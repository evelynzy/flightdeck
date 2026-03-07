/**
 * ForkListener — agent server side listener that accepts connections
 * from the orchestrator via Node IPC (fork channel) and TCP localhost.
 *
 * Two connection modes:
 *  1. IPC (primary): When forked, parent communicates via process.send/message.
 *  2. TCP localhost (reconnection): When orchestrator restarts, it connects
 *     via a TCP port written to a port file alongside the PID file.
 *
 * Both modes wrap connections in a uniform TransportConnection interface.
 *
 * Design: docs/design/agent-server-architecture.md (AS3)
 */
import { createServer, type Server, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { logger } from '../utils/logger.js';
import type {
  AgentServerListener,
  TransportConnection,
  OrchestratorMessage,
  AgentServerMessage,
} from './types.js';
import { validateMessage, isOrchestratorMessage } from './types.js';

// ── Types ───────────────────────────────────────────────────────────

export interface ForkListenerOptions {
  /** Directory for the port file (default: process.cwd()). */
  portFileDir?: string;
  /** Port file name (default: 'agent-server.port'). */
  portFileName?: string;
  /** TCP host to bind (default: '127.0.0.1'). */
  tcpHost?: string;
  /** TCP port to bind — 0 for OS-assigned (default: 0). */
  tcpPort?: number;
  /** Override process object for testing. */
  process?: ForkProcess;
}

/** Subset of process we need — allows injection for testing. */
export interface ForkProcess {
  send?(message: unknown): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  connected?: boolean;
}

const DEFAULTS = {
  portFileDir: process.cwd(),
  portFileName: 'agent-server.port',
  tcpHost: '127.0.0.1',
  tcpPort: 0,
};

// ── ForkListener ────────────────────────────────────────────────────

export class ForkListener implements AgentServerListener {
  private readonly opts: Required<Omit<ForkListenerOptions, 'process'>>;
  private readonly proc: ForkProcess;

  private connectionHandlers = new Set<(connection: TransportConnection) => void>();
  private tcpServer: Server | null = null;
  private tcpPort: number | null = null;
  private portFilePath: string | null = null;
  private listening = false;

  /** Active IPC connection (at most one — the parent process). */
  private ipcConnection: IpcConnection | null = null;
  /** Active TCP connections. */
  private tcpConnections = new Map<string, TcpConnection>();

  constructor(options?: ForkListenerOptions) {
    this.opts = {
      portFileDir: options?.portFileDir ?? DEFAULTS.portFileDir,
      portFileName: options?.portFileName ?? DEFAULTS.portFileName,
      tcpHost: options?.tcpHost ?? DEFAULTS.tcpHost,
      tcpPort: options?.tcpPort ?? DEFAULTS.tcpPort,
    };
    this.proc = options?.process ?? process;
    this.portFilePath = `${this.opts.portFileDir}/${this.opts.portFileName}`;
  }

  /** Whether the listener is actively accepting connections. */
  get isListening(): boolean {
    return this.listening;
  }

  /** The TCP port assigned by the OS (null if not yet listening). */
  get port(): number | null {
    return this.tcpPort;
  }

  /** Number of active connections (IPC + TCP). */
  get connectionCount(): number {
    return (this.ipcConnection ? 1 : 0) + this.tcpConnections.size;
  }

  // ── AgentServerListener interface ─────────────────────────────

  listen(): void {
    if (this.listening) return;
    this.listening = true;

    this.setupIpc();
    this.setupTcp();
  }

  close(): void {
    if (!this.listening) return;
    this.listening = false;

    // Close IPC
    if (this.ipcConnection) {
      this.ipcConnection.close();
      this.ipcConnection = null;
    }

    // Close all TCP connections
    for (const conn of this.tcpConnections.values()) {
      conn.close();
    }
    this.tcpConnections.clear();

    // Close TCP server
    if (this.tcpServer) {
      this.tcpServer.close();
      this.tcpServer = null;
    }

    // Clean up port file
    this.removePortFile();

    // Remove IPC handlers
    this.proc.off('message', this.onIpcMessage);
    this.proc.off('disconnect', this.onIpcDisconnect);

    this.connectionHandlers.clear();
  }

  onConnection(handler: (connection: TransportConnection) => void): () => void {
    this.connectionHandlers.add(handler);
    return () => { this.connectionHandlers.delete(handler); };
  }

  // ── IPC Setup ─────────────────────────────────────────────────

  private setupIpc(): void {
    // Only set up IPC if the process has a send function (i.e., was forked)
    if (!this.proc.send) {
      logger.info({ module: 'fork-listener', msg: 'No IPC channel — running standalone' });
      return;
    }

    this.proc.on('message', this.onIpcMessage);
    this.proc.on('disconnect', this.onIpcDisconnect);

    // Create an IPC connection representing the parent
    this.ipcConnection = new IpcConnection(this.proc);
    this.emitConnection(this.ipcConnection);

    logger.info({ module: 'fork-listener', msg: 'IPC listener ready' });
  }

  private onIpcMessage = (raw: unknown): void => {
    if (!this.ipcConnection) return;
    this.ipcConnection.handleMessage(raw);
  };

  private onIpcDisconnect = (): void => {
    if (this.ipcConnection) {
      this.ipcConnection.markDisconnected('parent process disconnected');
      this.ipcConnection = null;
    }
    logger.info({ module: 'fork-listener', msg: 'IPC disconnected — agents stay alive' });
  };

  // ── TCP Setup ─────────────────────────────────────────────────

  private setupTcp(): void {
    this.tcpServer = createServer((socket) => {
      this.handleTcpConnection(socket);
    });

    this.tcpServer.on('error', (err) => {
      logger.error({ module: 'fork-listener', msg: 'TCP server error', error: String(err) });
    });

    this.tcpServer.listen(this.opts.tcpPort, this.opts.tcpHost, () => {
      const addr = this.tcpServer!.address();
      if (addr && typeof addr === 'object') {
        this.tcpPort = addr.port;
        this.writePortFile();
        logger.info({
          module: 'fork-listener',
          msg: 'TCP listener ready',
          host: this.opts.tcpHost,
          port: this.tcpPort,
        });
      }
    });
  }

  private handleTcpConnection(socket: Socket): void {
    const conn = new TcpConnection(socket);

    this.tcpConnections.set(conn.id, conn);
    conn.onDisconnect(() => {
      this.tcpConnections.delete(conn.id);
    });

    this.emitConnection(conn);

    logger.info({
      module: 'fork-listener',
      msg: 'TCP connection accepted',
      connectionId: conn.id,
      remote: `${socket.remoteAddress}:${socket.remotePort}`,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  private emitConnection(connection: TransportConnection): void {
    for (const handler of this.connectionHandlers) {
      try {
        handler(connection);
      } catch (err) {
        logger.error({
          module: 'fork-listener',
          msg: 'Connection handler error',
          error: String(err),
        });
      }
    }
  }

  private writePortFile(): void {
    if (!this.portFilePath || this.tcpPort === null) return;
    try {
      writeFileSync(this.portFilePath, String(this.tcpPort), 'utf-8');
    } catch (err) {
      logger.warn({ module: 'fork-listener', msg: 'Failed to write port file', error: String(err) });
    }
  }

  private removePortFile(): void {
    if (!this.portFilePath) return;
    try {
      if (existsSync(this.portFilePath)) {
        unlinkSync(this.portFilePath);
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

// ── IpcConnection ───────────────────────────────────────────────────

/**
 * TransportConnection backed by Node IPC (process.send/message).
 * Represents the parent orchestrator process.
 */
class IpcConnection implements TransportConnection {
  readonly id: string;
  private _isConnected = true;
  private messageHandlers = new Set<(message: OrchestratorMessage) => void>();
  private disconnectHandlers = new Set<(reason: string) => void>();
  private readonly proc: ForkProcess;

  constructor(proc: ForkProcess) {
    this.id = `ipc-${randomUUID().slice(0, 8)}`;
    this.proc = proc;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  send(message: AgentServerMessage): void {
    if (!this._isConnected || !this.proc.send) return;
    try {
      this.proc.send(message);
    } catch (err) {
      logger.warn({ module: 'ipc-connection', msg: 'Send failed', error: String(err) });
      this.markDisconnected('send failed');
    }
  }

  onMessage(handler: (message: OrchestratorMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => { this.messageHandlers.delete(handler); };
  }

  onDisconnect(handler: (reason: string) => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => { this.disconnectHandlers.delete(handler); };
  }

  close(): void {
    if (!this._isConnected) return;
    this.markDisconnected('closed by server');
  }

  /** Called by ForkListener when a message arrives on the IPC channel. */
  handleMessage(raw: unknown): void {
    const msg = validateMessage(raw);
    if (!msg || !isOrchestratorMessage(msg)) return;

    for (const handler of this.messageHandlers) {
      try {
        handler(msg);
      } catch (err) {
        logger.error({ module: 'ipc-connection', msg: 'Message handler error', error: String(err) });
      }
    }
  }

  /** Called by ForkListener when the IPC channel disconnects. */
  markDisconnected(reason: string): void {
    if (!this._isConnected) return;
    this._isConnected = false;
    for (const handler of this.disconnectHandlers) {
      try {
        handler(reason);
      } catch {
        // Non-fatal
      }
    }
    this.messageHandlers.clear();
    this.disconnectHandlers.clear();
  }
}

// ── TcpConnection ───────────────────────────────────────────────────

/**
 * TransportConnection backed by a TCP socket.
 * Used for reconnection after orchestrator restart.
 */
class TcpConnection implements TransportConnection {
  readonly id: string;
  private _isConnected = true;
  private messageHandlers = new Set<(message: OrchestratorMessage) => void>();
  private disconnectHandlers = new Set<(reason: string) => void>();
  private readonly socket: Socket;
  private buffer = '';

  constructor(socket: Socket) {
    this.id = `tcp-${randomUUID().slice(0, 8)}`;
    this.socket = socket;

    socket.setEncoding('utf-8');

    socket.on('data', (data: string) => {
      this.handleData(data);
    });

    socket.on('close', () => {
      this.markDisconnected('socket closed');
    });

    socket.on('error', (err) => {
      logger.warn({ module: 'tcp-connection', msg: 'Socket error', error: String(err) });
      this.markDisconnected(`socket error: ${(err as NodeJS.ErrnoException).code ?? err.message}`);
    });
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  send(message: AgentServerMessage): void {
    if (!this._isConnected) return;
    try {
      // NDJSON: one JSON object per line
      this.socket.write(JSON.stringify(message) + '\n');
    } catch (err) {
      logger.warn({ module: 'tcp-connection', msg: 'Send failed', error: String(err) });
      this.markDisconnected('send failed');
    }
  }

  onMessage(handler: (message: OrchestratorMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => { this.messageHandlers.delete(handler); };
  }

  onDisconnect(handler: (reason: string) => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => { this.disconnectHandlers.delete(handler); };
  }

  close(): void {
    if (!this._isConnected) return;
    this.socket.destroy();
    this.markDisconnected('closed by server');
  }

  /** Parse NDJSON data from the socket. */
  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    // Last element is either '' (complete line) or a partial line
    this.buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const raw = JSON.parse(trimmed);
        const msg = validateMessage(raw);
        if (msg && isOrchestratorMessage(msg)) {
          for (const handler of this.messageHandlers) {
            try {
              handler(msg);
            } catch (err) {
              logger.error({ module: 'tcp-connection', msg: 'Message handler error', error: String(err) });
            }
          }
        }
      } catch {
        logger.warn({ module: 'tcp-connection', msg: 'Invalid JSON received', data: trimmed.slice(0, 100) });
      }
    }
  }

  private markDisconnected(reason: string): void {
    if (!this._isConnected) return;
    this._isConnected = false;
    for (const handler of this.disconnectHandlers) {
      try {
        handler(reason);
      } catch {
        // Non-fatal
      }
    }
    this.messageHandlers.clear();
    this.disconnectHandlers.clear();
  }
}
