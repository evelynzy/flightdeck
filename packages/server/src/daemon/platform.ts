/**
 * Cross-platform daemon utilities.
 *
 * Abstracts platform-specific IPC transport, file permissions, signal handling,
 * and path resolution so the daemon works on macOS, Linux, and Windows.
 *
 * Design: packages/docs/design/hot-reload-agent-preservation.md § Cross-Platform Compatibility
 *
 * Key points:
 * - Node.js `net` module handles both UDS (Unix) and named pipes (Windows) through the same API
 * - Only the transport setup (paths, permissions, cleanup) is platform-specific
 * - JSON-RPC protocol, auth, event buffering, and reconnect logic are 100% shared
 */

import { platform as osPlatform, userInfo, homedir } from 'node:os';
import { join } from 'node:path';
import {
  mkdirSync,
  existsSync,
  unlinkSync,
  statSync,
  chmodSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect } from 'node:net';

// ── Platform Detection ──────────────────────────────────────────────

export type Platform = 'linux' | 'darwin' | 'win32' | 'unsupported';

/** Returns the current platform as a normalized value. */
export function detectPlatform(): Platform {
  const p = osPlatform();
  if (p === 'linux' || p === 'darwin' || p === 'win32') return p;
  return 'unsupported';
}

export function isWindows(): boolean {
  return osPlatform() === 'win32';
}

export function isMacOS(): boolean {
  return osPlatform() === 'darwin';
}

export function isLinux(): boolean {
  return osPlatform() === 'linux';
}

// ── Transport Adapter Interface ─────────────────────────────────────

/**
 * Platform-specific IPC transport adapter.
 *
 * Abstracts the differences between Unix domain sockets and Windows named pipes
 * while sharing the JSON-RPC protocol layer.
 */
export interface TransportAdapter {
  /** The platform identifier. */
  readonly platform: Platform;

  /** Platform-specific IPC address (socket path or pipe name). */
  getAddress(socketName?: string): string;

  /** Token file path for this platform. */
  getTokenPath(tokenName?: string): string;

  /** PID file path for this platform. */
  getPidPath(pidName?: string): string;

  /** Manifest file path for this platform. */
  getManifestPath(manifestName?: string): string;

  /** Base directory for daemon files on this platform. */
  getSocketDir(): string;

  /**
   * Ensure the socket directory exists with correct permissions.
   * On Unix: mkdir with mode 0o700.
   * On Windows: mkdir + icacls DACL restriction.
   */
  ensureSocketDir(): void;

  /**
   * Verify ownership of the socket directory (Unix only).
   * Throws if owned by a different user.
   * No-op on Windows (DACL handles this).
   */
  verifyDirectoryOwnership(): void;

  /**
   * Apply restrictive permissions before server.listen().
   * On Unix: sets umask to 0o177, returns a restore function.
   * On Windows: no-op (named pipes don't use filesystem permissions).
   */
  secureBefore(): () => void;

  /**
   * Apply restrictive permissions to a file after creation.
   * On Unix: chmod 0o600.
   * On Windows: icacls owner-only.
   */
  secureFile(filePath: string): void;

  /**
   * Check if a stale socket/pipe exists and clean it up.
   * Returns 'clean' if no stale socket, 'live-daemon' if another daemon is running.
   */
  cleanupStale(address: string): Promise<'clean' | 'live-daemon'>;

  /**
   * Remove socket/pipe and related files on shutdown.
   */
  cleanupFiles(files: string[]): void;

  /**
   * Register cross-platform signal handlers for graceful shutdown.
   * On Unix: SIGTERM + SIGINT.
   * On Windows: SIGINT (Ctrl+C) only — SIGTERM is immediate TerminateProcess.
   * Returns a cleanup function that removes the registered handlers.
   */
  setupSignalHandlers(callback: (signal: string) => void): () => void;
}

// ── Unix Transport (shared base for Linux and macOS) ────────────────

class UnixTransport implements TransportAdapter {
  readonly platform: Platform;
  protected readonly socketDir: string;

  constructor(platform: 'linux' | 'darwin', socketDir?: string) {
    this.platform = platform;
    this.socketDir = socketDir ?? this.resolveSocketDir();
  }

  protected resolveSocketDir(): string {
    const { env } = process;

    // XDG_RUNTIME_DIR is the standard on Linux; also respect it on macOS if explicitly set
    if (env.XDG_RUNTIME_DIR) {
      return `${env.XDG_RUNTIME_DIR}/flightdeck`;
    }

    if (env.TMPDIR) {
      // Include UID in the path for security when TMPDIR is shared (e.g., /tmp on Linux).
      // On macOS, TMPDIR is already per-user but including UID is harmless.
      const uid = process.getuid?.() ?? 'unknown';
      return `${env.TMPDIR}/flightdeck-${uid}`;
    }

    const home = env.HOME || homedir();
    return `${home}/.flightdeck/run`;
  }

  getSocketDir(): string {
    return this.socketDir;
  }

  getAddress(socketName = 'agent-host.sock'): string {
    return join(this.socketDir, socketName);
  }

  getTokenPath(tokenName = 'agent-host.token'): string {
    return join(this.socketDir, tokenName);
  }

  getPidPath(pidName = 'agent-host.pid'): string {
    return join(this.socketDir, pidName);
  }

  getManifestPath(manifestName = 'daemon-manifest.json'): string {
    return join(this.socketDir, manifestName);
  }

  ensureSocketDir(): void {
    mkdirSync(this.socketDir, { recursive: true, mode: 0o700 });
  }

  verifyDirectoryOwnership(): void {
    try {
      const stat = statSync(this.socketDir);
      const uid = process.getuid?.();
      if (uid !== undefined && stat.uid !== uid) {
        throw new Error(
          `Socket directory ${this.socketDir} is owned by uid ${stat.uid}, ` +
          `but daemon is running as uid ${uid}. ` +
          `This usually means a previous run used sudo. Fix: sudo rm -rf ${this.socketDir}`,
        );
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  secureBefore(): () => void {
    const previousUmask = process.umask(0o177);
    return () => process.umask(previousUmask);
  }

  secureFile(filePath: string): void {
    chmodSync(filePath, 0o600);
  }

  async cleanupStale(address: string): Promise<'clean' | 'live-daemon'> {
    if (!existsSync(address)) return 'clean';

    return new Promise<'clean' | 'live-daemon'>((resolve, reject) => {
      const probe = connect(address);
      const timeout = setTimeout(() => {
        probe.destroy();
        // Socket exists but no response — treat as stale
        try { unlinkSync(address); } catch { /* ignore */ }
        resolve('clean');
      }, 2000);

      probe.on('connect', () => {
        clearTimeout(timeout);
        probe.destroy();
        resolve('live-daemon');
      });

      probe.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTSOCK') {
          // Stale socket or non-socket file occupying the path — clean up
          try { unlinkSync(address); } catch { /* ignore */ }
          resolve('clean');
        } else {
          reject(new Error(`Cannot probe daemon socket: ${err.code} — ${err.message}`));
        }
      });
    });
  }

  cleanupFiles(files: string[]): void {
    for (const f of files) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }

  setupSignalHandlers(callback: (signal: string) => void): () => void {
    const onTerm = () => callback('SIGTERM');
    const onInt = () => callback('SIGINT');
    process.on('SIGTERM', onTerm);
    process.on('SIGINT', onInt);
    return () => {
      process.removeListener('SIGTERM', onTerm);
      process.removeListener('SIGINT', onInt);
    };
  }
}

// ── Linux Transport ─────────────────────────────────────────────────

class LinuxTransportImpl extends UnixTransport {
  constructor(socketDir?: string) {
    super('linux', socketDir);
  }
}

// ── macOS Transport ─────────────────────────────────────────────────

class DarwinTransportImpl extends UnixTransport {
  constructor(socketDir?: string) {
    super('darwin', socketDir);
  }
}

// ── Windows Transport ───────────────────────────────────────────────

class WindowsTransport implements TransportAdapter {
  readonly platform: Platform = 'win32';
  private readonly socketDir: string;

  constructor(socketDir?: string) {
    this.socketDir = socketDir ?? this.resolveSocketDir();
  }

  private resolveSocketDir(): string {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      return join(localAppData, 'flightdeck');
    }
    const home = process.env.USERPROFILE || homedir();
    return join(home, '.flightdeck', 'run');
  }

  getSocketDir(): string {
    return this.socketDir;
  }

  /**
   * Windows named pipe path.
   * Named pipes live in the kernel's \\.\pipe\ namespace, not the filesystem.
   * Username is included to prevent cross-user collisions.
   */
  getAddress(socketName = 'agent-host'): string {
    const username = userInfo().username;
    return `\\\\.\\pipe\\flightdeck-${socketName}-${username}`;
  }

  getTokenPath(tokenName = 'agent-host.token'): string {
    return join(this.socketDir, tokenName);
  }

  getPidPath(pidName = 'agent-host.pid'): string {
    return join(this.socketDir, pidName);
  }

  getManifestPath(manifestName = 'daemon-manifest.json'): string {
    return join(this.socketDir, manifestName);
  }

  ensureSocketDir(): void {
    mkdirSync(this.socketDir, { recursive: true });
    this.restrictDirectoryDacl();
  }

  private restrictDirectoryDacl(): void {
    try {
      const username = userInfo().username;
      execFileSync('icacls', [
        this.socketDir,
        '/inheritance:r',
        '/grant:r',
        `${username}:(OI)(CI)F`,
      ], { stdio: 'ignore' });
    } catch {
      // icacls may fail in some environments (CI, containers)
      // Token auth is the primary security boundary on Windows
    }
  }

  verifyDirectoryOwnership(): void {
    // Windows uses DACL-based access control; directory ownership verification
    // is handled by ensureSocketDir() via icacls. No additional check needed.
  }

  secureBefore(): () => void {
    // Named pipes don't use filesystem permissions — no-op
    return () => {};
  }

  secureFile(filePath: string): void {
    try {
      const username = userInfo().username;
      execFileSync('icacls', [
        filePath,
        '/inheritance:r',
        '/grant:r',
        `${username}:R`,
      ], { stdio: 'ignore' });
    } catch {
      // Fallback: token auth is the primary security boundary on Windows
    }
  }

  async cleanupStale(address: string): Promise<'clean' | 'live-daemon'> {
    // Named pipes auto-cleanup when the last handle closes.
    // Probe to check if a live daemon is listening.
    return new Promise<'clean' | 'live-daemon'>((resolve) => {
      const probe = connect(address);
      const timeout = setTimeout(() => {
        probe.destroy();
        resolve('clean');
      }, 2000);

      probe.on('connect', () => {
        clearTimeout(timeout);
        probe.destroy();
        resolve('live-daemon');
      });

      probe.on('error', () => {
        clearTimeout(timeout);
        resolve('clean');
      });
    });
  }

  cleanupFiles(files: string[]): void {
    // On Windows, named pipes auto-cleanup. Only remove token/pid files.
    for (const f of files) {
      // Skip pipe paths (they start with \\.\pipe\)
      if (f.startsWith('\\\\.\\pipe\\')) continue;
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }

  setupSignalHandlers(callback: (signal: string) => void): () => void {
    // Windows only reliably delivers SIGINT (Ctrl+C).
    // SIGTERM on Windows is TerminateProcess (no handler possible).
    const onInt = () => callback('SIGINT');
    process.on('SIGINT', onInt);
    return () => {
      process.removeListener('SIGINT', onInt);
    };
  }
}

// ── TCP Fallback Transport (unsupported platforms) ──────────────────

class TcpFallbackTransport implements TransportAdapter {
  readonly platform: Platform = 'unsupported';
  private readonly socketDir: string;
  private port: number;

  constructor(socketDir?: string) {
    this.socketDir = socketDir ?? join(homedir(), '.flightdeck', 'run');
    this.port = 0; // Assigned during server listen
  }

  getSocketDir(): string {
    return this.socketDir;
  }

  /** TCP address — returns host:port string stored in a port file. */
  getAddress(): string {
    // For TCP fallback, we use localhost. The actual port is set dynamically.
    return '127.0.0.1';
  }

  /** Get the TCP port (0 = auto-assign). */
  getPort(): number {
    return this.port;
  }

  /** Set the TCP port after server starts listening. */
  setPort(port: number): void {
    this.port = port;
  }

  getTokenPath(tokenName = 'agent-host.token'): string {
    return join(this.socketDir, tokenName);
  }

  getPidPath(pidName = 'agent-host.pid'): string {
    return join(this.socketDir, pidName);
  }

  getManifestPath(manifestName = 'daemon-manifest.json'): string {
    return join(this.socketDir, manifestName);
  }

  ensureSocketDir(): void {
    mkdirSync(this.socketDir, { recursive: true });
  }

  verifyDirectoryOwnership(): void {
    // Best-effort on unsupported platforms
  }

  secureBefore(): () => void {
    // TCP has no filesystem-level security
    return () => {};
  }

  secureFile(_filePath: string): void {
    // Best-effort — no platform-specific permission tools available
  }

  async cleanupStale(_address: string): Promise<'clean' | 'live-daemon'> {
    // Read port from port file and probe
    const portPath = join(this.socketDir, 'agent-host.port');
    if (!existsSync(portPath)) return 'clean';

    const { readFileSync } = await import('node:fs');
    const savedPort = parseInt(readFileSync(portPath, 'utf-8').trim(), 10);
    if (isNaN(savedPort)) {
      try { unlinkSync(portPath); } catch { /* ignore */ }
      return 'clean';
    }

    return new Promise<'clean' | 'live-daemon'>((resolve) => {
      const probe = connect({ host: '127.0.0.1', port: savedPort });
      const timeout = setTimeout(() => {
        probe.destroy();
        resolve('clean');
      }, 2000);

      probe.on('connect', () => {
        clearTimeout(timeout);
        probe.destroy();
        resolve('live-daemon');
      });

      probe.on('error', () => {
        clearTimeout(timeout);
        try { unlinkSync(portPath); } catch { /* ignore */ }
        resolve('clean');
      });
    });
  }

  cleanupFiles(files: string[]): void {
    for (const f of files) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }

  setupSignalHandlers(callback: (signal: string) => void): () => void {
    const onTerm = () => callback('SIGTERM');
    const onInt = () => callback('SIGINT');
    process.on('SIGTERM', onTerm);
    process.on('SIGINT', onInt);
    return () => {
      process.removeListener('SIGTERM', onTerm);
      process.removeListener('SIGINT', onInt);
    };
  }
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Create the platform-appropriate transport adapter.
 *
 * @param socketDir Optional override for the socket directory (useful for testing)
 */
export function createTransport(socketDir?: string): TransportAdapter {
  switch (detectPlatform()) {
    case 'linux':
      return new LinuxTransportImpl(socketDir);
    case 'darwin':
      return new DarwinTransportImpl(socketDir);
    case 'win32':
      return new WindowsTransport(socketDir);
    default:
      return new TcpFallbackTransport(socketDir);
  }
}

/**
 * Resolve the daemon socket directory using the platform-aware fallback chain.
 *
 * This is the canonical entry point — replaces the old getSocketDir() in DaemonProtocol.ts.
 *
 * Linux:  $XDG_RUNTIME_DIR/flightdeck/ → ~/.flightdeck/run/
 * macOS:  $TMPDIR/flightdeck/ → ~/.flightdeck/run/
 * Windows: %LOCALAPPDATA%\flightdeck\ → %USERPROFILE%\.flightdeck\run\
 */
export function getSocketDir(): string {
  return createTransport().getSocketDir();
}

// Re-export types for convenience
export type { TcpFallbackTransport as TcpFallbackTransportType };
