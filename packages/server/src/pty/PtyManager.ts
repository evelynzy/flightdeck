import { EventEmitter } from 'events';
import * as pty from 'node-pty';

export interface PtyOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  /** Inactivity timeout in ms before emitting a 'hung' event (default: 300_000 = 5 min) */
  watchdogTimeoutMs?: number;
}

export class PtyManager extends EventEmitter {
  private process: pty.IPty | null = null;
  private outputBuffer: string[] = [];
  private _exitCode: number | null = null;
  private lastOutputAt: number = 0;
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private watchdogTimeoutMs: number = 300_000;
  private _isHung: boolean = false;

  get pid(): number | undefined {
    return this.process?.pid;
  }

  get exitCode(): number | null {
    return this._exitCode;
  }

  get isRunning(): boolean {
    return this.process !== null && this._exitCode === null;
  }

  get isHung(): boolean {
    return this._isHung;
  }

  spawn(opts: PtyOptions): void {
    if (this.process) {
      throw new Error('PTY already running');
    }

    this.watchdogTimeoutMs = opts.watchdogTimeoutMs ?? 300_000;
    this.lastOutputAt = Date.now();
    this._isHung = false;

    this.process = pty.spawn(opts.command, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols || 120,
      rows: opts.rows || 30,
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...opts.env } as Record<string, string>,
    });

    this.process.onData((data: string) => {
      this.lastOutputAt = Date.now();
      this._isHung = false;
      this.outputBuffer.push(data);
      // Keep buffer bounded
      if (this.outputBuffer.length > 10000) {
        this.outputBuffer = this.outputBuffer.slice(-5000);
      }
      this.emit('data', data);
    });

    this.process.onExit(({ exitCode }) => {
      this.clearWatchdog();
      this._exitCode = exitCode;
      this.emit('exit', exitCode);
      this.process = null;
    });

    this.startWatchdog();
  }

  write(data: string): void {
    if (!this.process) throw new Error('PTY not running');
    this.process.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.process) {
      this.process.resize(cols, rows);
    }
  }

  kill(): void {
    this.clearWatchdog();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  getBufferedOutput(): string {
    return this.outputBuffer.join('');
  }

  clearBuffer(): void {
    this.outputBuffer = [];
  }

  private startWatchdog(): void {
    this.watchdogInterval = setInterval(() => {
      if (!this.isRunning) {
        this.clearWatchdog();
        return;
      }
      const elapsed = Date.now() - this.lastOutputAt;
      if (elapsed > this.watchdogTimeoutMs) {
        this._isHung = true;
        this.emit('hung', elapsed);
      }
    }, 30_000);
  }

  private clearWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }
}
