/**
 * Settings route tests.
 *
 * Covers: provider listing, individual provider details, masked keys,
 * connection testing, error cases.
 */
import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { Request, Response, NextFunction } from 'express';

// Bypass rate limiters in tests
vi.mock('../middleware/rateLimit.js', () => ({
  rateLimit: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { settingsRoutes, maskApiKey, detectProviderStatus } from './settings.js';
import type { AppContext } from './context.js';
import type { ProviderPreset } from '../adapters/presets.js';

// ── Helpers ─────────────────────────────────────────────────────────

function minimalCtx(): AppContext {
  return {
    agentManager: {} as any,
    roleRegistry: {} as any,
    config: {} as any,
    db: {} as any,
    lockRegistry: {} as any,
    activityLedger: {} as any,
    decisionLog: {} as any,
  } as AppContext;
}

function createTestServer(): {
  start: () => Promise<string>;
  stop: () => Promise<void>;
} {
  const ctx = minimalCtx();
  const app = express();
  app.use(express.json());
  app.use(settingsRoutes(ctx));

  let server: Server;
  return {
    start: () =>
      new Promise<string>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const { port } = server.address() as AddressInfo;
          resolve(`http://127.0.0.1:${port}`);
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        server?.close(() => resolve());
      }),
  };
}

// ── Unit Tests: maskApiKey ──────────────────────────────────────────

describe('maskApiKey', () => {
  it('masks a typical API key showing first 8 chars', () => {
    expect(maskApiKey('sk-ant-api03-xxxxxxxxx')).toBe('sk-ant-a****');
  });

  it('returns null for undefined', () => {
    expect(maskApiKey(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(maskApiKey('')).toBeNull();
  });

  it('handles short keys gracefully', () => {
    expect(maskApiKey('abc')).toBe('abc****');
  });

  it('masks exactly 8 chars for long keys', () => {
    const key = 'abcdefghijklmnop';
    const masked = maskApiKey(key)!;
    expect(masked).toBe('abcdefgh****');
    expect(masked).not.toContain('ijklmnop');
  });
});

// ── Unit Tests: detectProviderStatus ────────────────────────────────

describe('detectProviderStatus', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns "configured" for providers without required env vars', () => {
    const preset: ProviderPreset = {
      id: 'copilot',
      name: 'Copilot',
      binary: 'copilot',
      args: [],
      transport: 'stdio',
    };
    expect(detectProviderStatus(preset)).toBe('configured');
  });

  it('returns "configured" when all required env vars are set', () => {
    process.env.TEST_API_KEY = 'sk-test-12345';
    const preset: ProviderPreset = {
      id: 'test' as any,
      name: 'Test',
      binary: 'test',
      args: [],
      transport: 'stdio',
      requiredEnvVars: ['TEST_API_KEY'],
    };
    expect(detectProviderStatus(preset)).toBe('configured');
  });

  it('returns "not-configured" when env var is missing', () => {
    delete process.env.MISSING_KEY;
    const preset: ProviderPreset = {
      id: 'test' as any,
      name: 'Test',
      binary: 'test',
      args: [],
      transport: 'stdio',
      requiredEnvVars: ['MISSING_KEY'],
    };
    expect(detectProviderStatus(preset)).toBe('not-configured');
  });

  it('returns "not-configured" when env var is empty string', () => {
    process.env.EMPTY_KEY = '';
    const preset: ProviderPreset = {
      id: 'test' as any,
      name: 'Test',
      binary: 'test',
      args: [],
      transport: 'stdio',
      requiredEnvVars: ['EMPTY_KEY'],
    };
    expect(detectProviderStatus(preset)).toBe('not-configured');
  });
});

// ── Integration Tests: Routes ───────────────────────────────────────

describe('settings routes', () => {
  let baseUrl: string;
  const srv = createTestServer();

  beforeEach(async () => {
    baseUrl = await srv.start();
  });

  afterEach(async () => {
    await srv.stop();
  });

  describe('GET /settings/providers', () => {
    it('returns a list of all 6 providers', async () => {
      const res = await fetch(`${baseUrl}/settings/providers`);
      expect(res.status).toBe(200);
      const providers = await res.json();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBe(6);
    });

    it('each provider has expected fields', async () => {
      const res = await fetch(`${baseUrl}/settings/providers`);
      const providers = await res.json();
      for (const p of providers) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('status');
        expect(p).toHaveProperty('maskedKey');
        expect(p).toHaveProperty('requiredEnvVars');
        expect(p).toHaveProperty('binary');
        expect(['configured', 'not-configured', 'error']).toContain(p.status);
      }
    });

    it('never exposes full API keys', async () => {
      const res = await fetch(`${baseUrl}/settings/providers`);
      const providers = await res.json();
      for (const p of providers) {
        if (p.maskedKey) {
          expect(p.maskedKey).toMatch(/\*{4}$/);
          expect(p.maskedKey.length).toBeLessThanOrEqual(12); // 8 chars + "****"
        }
      }
    });
  });

  describe('GET /settings/providers/:provider', () => {
    it('returns details for a valid provider', async () => {
      const res = await fetch(`${baseUrl}/settings/providers/claude`);
      expect(res.status).toBe(200);
      const provider = await res.json();
      expect(provider.id).toBe('claude');
      expect(provider.name).toBe('Claude Code');
      expect(provider.requiredEnvVars).toContain('ANTHROPIC_API_KEY');
    });

    it('returns 404 for unknown provider', async () => {
      const res = await fetch(`${baseUrl}/settings/providers/unknown-provider`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Unknown provider');
    });
  });

  describe('POST /settings/providers/:provider/test', () => {
    it('returns a test result object', async () => {
      const res = await fetch(`${baseUrl}/settings/providers/copilot/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      const result = await res.json();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
    });

    it('returns 404 for unknown provider', async () => {
      const res = await fetch(`${baseUrl}/settings/providers/fake/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(404);
    });

    it('reports missing env var when not configured', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        const res = await fetch(`${baseUrl}/settings/providers/claude/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await res.json();
        expect(result.success).toBe(false);
        expect(result.message).toContain('ANTHROPIC_API_KEY');
      } finally {
        if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });
  });
});
