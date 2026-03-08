import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderManager, maskApiKey } from '../ProviderManager.js';
import type { Database } from '../../db/database.js';

// ── Mock DB ──────────────────────────────────────────────────────

function createMockDb(): Database {
  const store = new Map<string, string>();
  return {
    getSetting: vi.fn((key: string) => store.get(key)),
    setSetting: vi.fn((key: string, value: string) => { store.set(key, value); }),
  } as unknown as Database;
}

// ── Tests ────────────────────────────────────────────────────────

describe('ProviderManager', () => {
  let db: Database;
  let env: Record<string, string | undefined>;
  let execCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = createMockDb();
    env = {};
    execCommand = vi.fn().mockReturnValue('');
  });

  function createManager() {
    return new ProviderManager({ db, env, execCommand });
  }

  // ── getProviderStatus — env_var detection ─────────────────

  describe('getProviderStatus — env_var providers', () => {
    it('detects configured claude via ANTHROPIC_API_KEY', () => {
      env.ANTHROPIC_API_KEY = 'sk-ant-abc123xyz789';
      const status = createManager().getProviderStatus('claude');

      expect(status.id).toBe('claude');
      expect(status.name).toBe('Claude Code');
      expect(status.configured).toBe(true);
      expect(status.detectionMethod).toBe('env_var');
      expect(status.detail).toBe('sk-ant-a...z789');
      expect(status.enabled).toBe(true);
    });

    it('detects unconfigured claude', () => {
      const status = createManager().getProviderStatus('claude');
      expect(status.configured).toBe(false);
      expect(status.detail).toBeNull();
    });

    it('detects configured codex via OPENAI_API_KEY', () => {
      env.OPENAI_API_KEY = 'sk-proj-abcdef123456';
      const status = createManager().getProviderStatus('codex');

      expect(status.configured).toBe(true);
      expect(status.detectionMethod).toBe('env_var');
    });

    it('throws for unknown provider', () => {
      expect(() => createManager().getProviderStatus('unknown' as any)).toThrow('Unknown provider');
    });
  });

  // ── getProviderStatus — cli_auth detection ────────────────

  describe('getProviderStatus — cli_auth providers', () => {
    it('detects copilot via gh auth status', () => {
      execCommand.mockReturnValue('github.com\n  ✓ Logged in to github.com account user');
      const status = createManager().getProviderStatus('copilot');

      expect(status.configured).toBe(true);
      expect(status.detectionMethod).toBe('cli_auth');
      expect(status.detail).toBe('github.com');
    });

    it('detects unauthenticated copilot', () => {
      execCommand.mockImplementation(() => { throw new Error('not logged in'); });
      const status = createManager().getProviderStatus('copilot');

      expect(status.configured).toBe(false);
      expect(status.detail).toBeNull();
    });
  });

  // ── getProviderStatus — cli_installed detection ───────────

  describe('getProviderStatus — cli_installed providers', () => {
    it('detects installed gemini CLI', () => {
      execCommand.mockReturnValue('/usr/local/bin/gemini');
      const status = createManager().getProviderStatus('gemini');

      expect(status.configured).toBe(true);
      expect(status.detectionMethod).toBe('cli_installed');
      expect(status.detail).toBe('/usr/local/bin/gemini');
    });

    it('detects missing opencode CLI', () => {
      execCommand.mockImplementation(() => { throw new Error('not found'); });
      const status = createManager().getProviderStatus('opencode');

      expect(status.configured).toBe(false);
      expect(status.detail).toBeNull();
    });

    it('detects installed cursor CLI', () => {
      execCommand.mockReturnValue('/usr/local/bin/agent');
      const status = createManager().getProviderStatus('cursor');

      expect(status.configured).toBe(true);
    });
  });

  // ── getAllProviderStatuses ────────────────────────────────

  describe('getAllProviderStatuses', () => {
    it('returns status for all 6 providers', () => {
      const statuses = createManager().getAllProviderStatuses();

      expect(statuses).toHaveLength(6);
      const ids = statuses.map((s) => s.id).sort();
      expect(ids).toEqual(['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode']);
    });
  });

  // ── isProviderEnabled / setProviderEnabled ────────────────

  describe('enabled/disabled', () => {
    it('defaults to enabled when no setting exists', () => {
      expect(createManager().isProviderEnabled('claude')).toBe(true);
    });

    it('persists disabled state', () => {
      const mgr = createManager();
      mgr.setProviderEnabled('gemini', false);
      expect(mgr.isProviderEnabled('gemini')).toBe(false);
    });

    it('persists re-enabled state', () => {
      const mgr = createManager();
      mgr.setProviderEnabled('gemini', false);
      mgr.setProviderEnabled('gemini', true);
      expect(mgr.isProviderEnabled('gemini')).toBe(true);
    });

    it('reflects disabled in provider status', () => {
      const mgr = createManager();
      mgr.setProviderEnabled('claude', false);
      expect(mgr.getProviderStatus('claude').enabled).toBe(false);
    });

    it('defaults to enabled without db', () => {
      const mgr = new ProviderManager({ env, execCommand });
      expect(mgr.isProviderEnabled('claude')).toBe(true);
    });
  });

  // ── testConnection ────────────────────────────────────────

  describe('testConnection', () => {
    it('returns error for missing API key (env_var provider)', async () => {
      const result = await createManager().testConnection('claude');
      expect(result.success).toBe(false);
      expect(result.error).toContain('ANTHROPIC_API_KEY not set');
    });

    it('returns error for unknown provider', async () => {
      const result = await createManager().testConnection('unknown' as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown provider');
    });

    it('succeeds for cli_installed when binary found', async () => {
      execCommand.mockReturnValue('/usr/local/bin/gemini');
      const result = await createManager().testConnection('gemini');
      expect(result.success).toBe(true);
    });

    it('fails for cli_installed when binary not found', async () => {
      execCommand.mockImplementation(() => { throw new Error('not found'); });
      const result = await createManager().testConnection('gemini');
      expect(result.success).toBe(false);
      expect(result.error).toBe('not found');
    });

    it('succeeds for cli_auth when authenticated', async () => {
      execCommand.mockReturnValue('Logged in');
      const result = await createManager().testConnection('copilot');
      expect(result.success).toBe(true);
    });

    it('catches fetch errors for API providers', async () => {
      env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

      try {
        const result = await createManager().testConnection('claude');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Network unreachable');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('catches HTTP error responses', async () => {
      env.ANTHROPIC_API_KEY = 'sk-ant-invalid';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

      try {
        const result = await createManager().testConnection('claude');
        expect(result.success).toBe(false);
        expect(result.error).toContain('401');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('measures latency', async () => {
      env.OPENAI_API_KEY = 'sk-test';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      try {
        const result = await createManager().testConnection('codex');
        expect(result.success).toBe(true);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ── maskApiKey ───────────────────────────────────────────────────

describe('maskApiKey', () => {
  it('masks long key (first 8 + last 4)', () => {
    expect(maskApiKey('sk-ant-abc123xyz456def789')).toBe('sk-ant-a...f789');
  });

  it('masks medium key (first 4 + last 2)', () => {
    expect(maskApiKey('abcdefghijkl')).toBe('abcd...kl');
  });

  it('masks very short key', () => {
    expect(maskApiKey('short')).toBe('****');
  });

  it('handles empty string', () => {
    expect(maskApiKey('')).toBe('****');
  });

  it('masks GitHub token format', () => {
    expect(maskApiKey('ghp_abc123def456ghi789')).toBe('ghp_abc1...i789');
  });
});
