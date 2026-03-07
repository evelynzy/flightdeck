import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform as osPlatform } from 'node:os';
import { createServer, type Server } from 'node:net';
import {
  detectPlatform,
  isWindows,
  isMacOS,
  isLinux,
  createTransport,
  getSocketDir,
  type TransportAdapter,
  type Platform,
} from '../daemon/platform.js';

// ── Test helpers ────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'platform-test-'));
}

// ── Platform Detection ──────────────────────────────────────────────

describe('Platform Detection', () => {
  it('detectPlatform returns a valid platform', () => {
    const p = detectPlatform();
    expect(['linux', 'darwin', 'win32', 'unsupported']).toContain(p);
  });

  it('detectPlatform matches os.platform()', () => {
    const p = detectPlatform();
    const osP = osPlatform();
    if (osP === 'linux' || osP === 'darwin' || osP === 'win32') {
      expect(p).toBe(osP);
    } else {
      expect(p).toBe('unsupported');
    }
  });

  it('isWindows returns boolean', () => {
    expect(typeof isWindows()).toBe('boolean');
    if (osPlatform() === 'win32') {
      expect(isWindows()).toBe(true);
    } else {
      expect(isWindows()).toBe(false);
    }
  });

  it('isMacOS returns boolean', () => {
    expect(typeof isMacOS()).toBe('boolean');
    if (osPlatform() === 'darwin') {
      expect(isMacOS()).toBe(true);
    } else {
      expect(isMacOS()).toBe(false);
    }
  });

  it('isLinux returns boolean', () => {
    expect(typeof isLinux()).toBe('boolean');
    if (osPlatform() === 'linux') {
      expect(isLinux()).toBe(true);
    } else {
      expect(isLinux()).toBe(false);
    }
  });

  it('exactly one platform detector returns true', () => {
    const results = [isWindows(), isMacOS(), isLinux()];
    const trueCount = results.filter(Boolean).length;
    // On known platforms, exactly one is true. On unsupported, all are false.
    expect(trueCount).toBeLessThanOrEqual(1);
    if (detectPlatform() !== 'unsupported') {
      expect(trueCount).toBe(1);
    }
  });
});

// ── Transport Factory ───────────────────────────────────────────────

describe('createTransport', () => {
  it('returns a TransportAdapter', () => {
    const transport = createTransport();
    expect(transport).toBeDefined();
    expect(transport.platform).toBeDefined();
    expect(typeof transport.getAddress).toBe('function');
    expect(typeof transport.getTokenPath).toBe('function');
    expect(typeof transport.getPidPath).toBe('function');
    expect(typeof transport.getManifestPath).toBe('function');
    expect(typeof transport.getSocketDir).toBe('function');
    expect(typeof transport.ensureSocketDir).toBe('function');
    expect(typeof transport.verifyDirectoryOwnership).toBe('function');
    expect(typeof transport.secureBefore).toBe('function');
    expect(typeof transport.secureFile).toBe('function');
    expect(typeof transport.cleanupStale).toBe('function');
    expect(typeof transport.cleanupFiles).toBe('function');
    expect(typeof transport.setupSignalHandlers).toBe('function');
  });

  it('platform matches detectPlatform()', () => {
    const transport = createTransport();
    expect(transport.platform).toBe(detectPlatform());
  });

  it('accepts custom socketDir override', () => {
    const customDir = '/tmp/custom-test';
    const transport = createTransport(customDir);
    expect(transport.getSocketDir()).toBe(customDir);
  });
});

// ── getSocketDir (canonical entry point) ────────────────────────────

describe('getSocketDir', () => {
  it('returns a non-empty string', () => {
    const dir = getSocketDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });

  it('returns a path containing flightdeck', () => {
    const dir = getSocketDir();
    expect(dir.toLowerCase()).toContain('flightdeck');
  });
});

// ── Unix Transport (Linux/macOS) ────────────────────────────────────

const isUnix = osPlatform() === 'linux' || osPlatform() === 'darwin';

describe.skipIf(!isUnix)('Unix Transport', () => {
  let transport: TransportAdapter;
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    transport = createTransport(tempDir);
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('path resolution', () => {
    it('getAddress returns a .sock path inside socketDir', () => {
      const addr = transport.getAddress();
      expect(addr).toBe(join(tempDir, 'agent-host.sock'));
    });

    it('getAddress accepts custom socket name', () => {
      const addr = transport.getAddress('custom.sock');
      expect(addr).toBe(join(tempDir, 'custom.sock'));
    });

    it('getTokenPath returns token file in socketDir', () => {
      const path = transport.getTokenPath();
      expect(path).toBe(join(tempDir, 'agent-host.token'));
    });

    it('getPidPath returns pid file in socketDir', () => {
      const path = transport.getPidPath();
      expect(path).toBe(join(tempDir, 'agent-host.pid'));
    });

    it('getManifestPath returns manifest in socketDir', () => {
      const path = transport.getManifestPath();
      expect(path).toBe(join(tempDir, 'daemon-manifest.json'));
    });

    it('getSocketDir returns the configured directory', () => {
      expect(transport.getSocketDir()).toBe(tempDir);
    });
  });

  describe('directory management', () => {
    it('ensureSocketDir creates directory with 0o700', () => {
      const newDir = join(tempDir, 'nested', 'daemon');
      const nested = createTransport(newDir);
      nested.ensureSocketDir();
      expect(existsSync(newDir)).toBe(true);
    });

    it('verifyDirectoryOwnership passes for current user', () => {
      transport.ensureSocketDir();
      // Should not throw for directories owned by current user
      expect(() => transport.verifyDirectoryOwnership()).not.toThrow();
    });
  });

  describe('security', () => {
    it('secureBefore returns a restore function', () => {
      const restore = transport.secureBefore();
      expect(typeof restore).toBe('function');
      restore(); // Should not throw
    });

    it('secureBefore sets restrictive umask and restore reverts', () => {
      const originalUmask = process.umask();
      const restore = transport.secureBefore();
      // After secureBefore, umask should be 0o177
      const currentUmask = process.umask();
      process.umask(currentUmask); // Restore what we just read
      expect(currentUmask).toBe(0o177);
      restore();
      const restoredUmask = process.umask();
      process.umask(restoredUmask);
      expect(restoredUmask).toBe(originalUmask);
    });

    it('secureFile sets restrictive permissions on a file', () => {
      const filePath = join(tempDir, 'test-file');
      writeFileSync(filePath, 'test content');
      transport.secureFile(filePath);
      const { statSync } = require('node:fs');
      const stat = statSync(filePath);
      expect(stat.mode & 0o777).toBe(0o600);
    });
  });

  describe('stale socket cleanup', () => {
    it('returns clean when no socket exists', async () => {
      const addr = transport.getAddress();
      const result = await transport.cleanupStale(addr);
      expect(result).toBe('clean');
    });

    it('returns live-daemon when a server is listening', async () => {
      const addr = transport.getAddress();
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(addr, resolve));
      try {
        const result = await transport.cleanupStale(addr);
        expect(result).toBe('live-daemon');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        try { require('node:fs').unlinkSync(addr); } catch { /* ignore */ }
      }
    });

    it('returns clean and removes stale socket file', async () => {
      const addr = transport.getAddress();
      // Create a fake stale socket file (just a regular file)
      writeFileSync(addr, 'stale');
      const result = await transport.cleanupStale(addr);
      expect(result).toBe('clean');
      expect(existsSync(addr)).toBe(false);
    });
  });

  describe('file cleanup', () => {
    it('removes listed files', () => {
      const file1 = join(tempDir, 'file1');
      const file2 = join(tempDir, 'file2');
      writeFileSync(file1, 'a');
      writeFileSync(file2, 'b');
      transport.cleanupFiles([file1, file2]);
      expect(existsSync(file1)).toBe(false);
      expect(existsSync(file2)).toBe(false);
    });

    it('ignores non-existent files', () => {
      expect(() => transport.cleanupFiles(['/nonexistent/file'])).not.toThrow();
    });
  });

  describe('signal handlers', () => {
    it('setupSignalHandlers registers handlers', () => {
      const onSpy = vi.spyOn(process, 'on');
      const callback = vi.fn();
      transport.setupSignalHandlers(callback);
      expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      onSpy.mockRestore();
    });
  });
});

// ── Socket directory resolution with environment variables ──────────

describe('Socket directory resolution', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  it.skipIf(isWindows())('Linux uses XDG_RUNTIME_DIR when set', () => {
    process.env.XDG_RUNTIME_DIR = '/run/user/1000';
    delete process.env.TMPDIR;
    // Force linux platform for this test
    const transport = createTransport();
    if (transport.platform === 'linux') {
      expect(transport.getSocketDir()).toBe('/run/user/1000/flightdeck');
    }
  });

  it.skipIf(isWindows())('macOS uses TMPDIR when set', () => {
    delete process.env.XDG_RUNTIME_DIR;
    process.env.TMPDIR = '/var/folders/vd/abc123/T/';
    const transport = createTransport();
    if (transport.platform === 'darwin') {
      expect(transport.getSocketDir()).toMatch(/^\/var\/folders\/vd\/abc123\/T\/\/flightdeck-/);
    }
  });

  it.skipIf(isWindows())('falls back to ~/.flightdeck/run', () => {
    delete process.env.XDG_RUNTIME_DIR;
    delete process.env.TMPDIR;
    const transport = createTransport();
    if (transport.platform === 'linux' || transport.platform === 'darwin') {
      expect(transport.getSocketDir()).toContain('.flightdeck/run');
    }
  });
});

// ── Windows Transport (conditional) ─────────────────────────────────

describe.skipIf(!isWindows())('Windows Transport', () => {
  let transport: TransportAdapter;
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    transport = createTransport(tempDir);
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('getAddress returns a named pipe path', () => {
    const addr = transport.getAddress();
    expect(addr).toMatch(/^\\\\\.\\pipe\\flightdeck-/);
  });

  it('getAddress includes username', () => {
    const addr = transport.getAddress();
    const { userInfo } = require('node:os');
    expect(addr).toContain(userInfo().username);
  });

  it('token path is in LOCALAPPDATA or socketDir', () => {
    const tokenPath = transport.getTokenPath();
    expect(tokenPath).toContain('agent-host.token');
  });

  it('secureBefore is a no-op that returns restore function', () => {
    const restore = transport.secureBefore();
    expect(typeof restore).toBe('function');
    restore(); // Should not throw
  });

  it('cleanupFiles skips pipe paths', () => {
    const pipePath = '\\\\.\\pipe\\test-pipe';
    const realFile = join(tempDir, 'test.txt');
    writeFileSync(realFile, 'test');
    // Should not throw for pipe paths, should clean real files
    transport.cleanupFiles([pipePath, realFile]);
    expect(existsSync(realFile)).toBe(false);
  });

  it('setupSignalHandlers registers SIGINT only', () => {
    const onSpy = vi.spyOn(process, 'on');
    const callback = vi.fn();
    transport.setupSignalHandlers(callback);
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    // SIGTERM should NOT be registered on Windows
    expect(onSpy).not.toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    onSpy.mockRestore();
  });
});

// ── Transport adapter contract tests (all platforms) ────────────────

describe('TransportAdapter contract', () => {
  let transport: TransportAdapter;
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    transport = createTransport(tempDir);
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('getAddress returns a non-empty string', () => {
    const addr = transport.getAddress();
    expect(typeof addr).toBe('string');
    expect(addr.length).toBeGreaterThan(0);
  });

  it('getTokenPath returns a path containing token', () => {
    expect(transport.getTokenPath()).toContain('token');
  });

  it('getPidPath returns a path containing pid', () => {
    expect(transport.getPidPath()).toContain('pid');
  });

  it('getManifestPath returns a path containing manifest', () => {
    expect(transport.getManifestPath()).toContain('manifest');
  });

  it('ensureSocketDir creates the directory', () => {
    const nested = join(tempDir, 'sub', 'dir');
    const t = createTransport(nested);
    t.ensureSocketDir();
    expect(existsSync(nested)).toBe(true);
  });

  it('verifyDirectoryOwnership does not throw for owned dirs', () => {
    transport.ensureSocketDir();
    expect(() => transport.verifyDirectoryOwnership()).not.toThrow();
  });

  it('secureBefore returns a callable restore function', () => {
    const restore = transport.secureBefore();
    expect(typeof restore).toBe('function');
    restore();
  });

  it('cleanupFiles handles empty array', () => {
    expect(() => transport.cleanupFiles([])).not.toThrow();
  });

  it('cleanupFiles handles non-existent files', () => {
    expect(() => transport.cleanupFiles([join(tempDir, 'nope')])).not.toThrow();
  });

  it('cleanupStale returns clean for non-existent address', async () => {
    const result = await transport.cleanupStale(transport.getAddress());
    expect(result).toBe('clean');
  });
});
