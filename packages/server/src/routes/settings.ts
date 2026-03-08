/**
 * Settings routes — provider configuration and status.
 *
 * Security: API keys are NEVER sent to the browser. Only masked previews
 * (first 8 chars) are returned. Keys live in env vars, not the database.
 */
import { Router } from 'express';
import { PROVIDER_PRESETS, isValidProviderId, listPresets } from '../adapters/presets.js';
import type { ProviderId, ProviderPreset } from '../adapters/presets.js';
import type { AppContext } from './context.js';

// ── Types ───────────────────────────────────────────────────────────

export type ProviderStatus = 'configured' | 'not-configured' | 'error';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  status: ProviderStatus;
  /** Masked key preview, e.g. "sk-ant-a...****". Null if not configured. */
  maskedKey: string | null;
  /** Which env var(s) this provider needs */
  requiredEnvVars: string[];
  /** Whether the CLI binary was specified (for Copilot which uses OAuth) */
  binary: string;
  defaultModel: string | null;
  supportsResume: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  /** Time in ms */
  latency?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Mask an API key for safe display. Shows first 8 chars + "****".
 * Returns null for undefined/empty keys.
 */
export function maskApiKey(key: string | undefined): string | null {
  if (!key || key.length === 0) return null;
  const visible = Math.min(8, key.length);
  return key.slice(0, visible) + '****';
}

/**
 * Detect provider status by checking if required env vars are set.
 */
export function detectProviderStatus(preset: ProviderPreset): ProviderStatus {
  const envVars = preset.requiredEnvVars ?? [];
  if (envVars.length === 0) {
    // Providers without required env vars (e.g., Copilot uses OAuth)
    return 'configured';
  }
  const allSet = envVars.every((v) => {
    const val = process.env[v];
    return val !== undefined && val.length > 0;
  });
  return allSet ? 'configured' : 'not-configured';
}

/**
 * Build the ProviderInfo for a single preset.
 */
function buildProviderInfo(preset: ProviderPreset): ProviderInfo {
  const status = detectProviderStatus(preset);
  const envVars = preset.requiredEnvVars ?? [];
  const firstKey = envVars.length > 0 ? process.env[envVars[0]] : undefined;

  return {
    id: preset.id as ProviderId,
    name: preset.name,
    status,
    maskedKey: status === 'configured' ? maskApiKey(firstKey) : null,
    requiredEnvVars: envVars,
    binary: preset.binary,
    defaultModel: preset.defaultModel ?? null,
    supportsResume: preset.supportsResume ?? false,
  };
}

/**
 * Test connection to a provider by checking if the CLI binary is accessible.
 * A real implementation would make a minimal API call; for now we verify
 * env vars are set and the binary resolves.
 */
async function testProviderConnection(preset: ProviderPreset): Promise<ConnectionTestResult> {
  const start = Date.now();

  // Check env vars first
  const envVars = preset.requiredEnvVars ?? [];
  for (const envVar of envVars) {
    const val = process.env[envVar];
    if (!val || val.length === 0) {
      return {
        success: false,
        message: `Missing environment variable: ${envVar}`,
        latency: Date.now() - start,
      };
    }
  }

  // Check binary availability
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  const checkCmd = process.platform === 'win32' ? 'where' : 'which';

  try {
    await execFileAsync(checkCmd, [preset.binary], { timeout: 5000 });
  } catch {
    return {
      success: false,
      message: `CLI binary "${preset.binary}" not found on PATH`,
      latency: Date.now() - start,
    };
  }

  return {
    success: true,
    message: `Provider "${preset.name}" is reachable (binary found, env vars set)`,
    latency: Date.now() - start,
  };
}

// ── Routes ──────────────────────────────────────────────────────────

export function settingsRoutes(_ctx: AppContext): Router {
  const router = Router();

  /**
   * GET /settings/providers — list all providers with status.
   */
  router.get('/settings/providers', (_req, res) => {
    const providers = listPresets().map(buildProviderInfo);
    res.json(providers);
  });

  /**
   * GET /settings/providers/:provider — get single provider details.
   */
  router.get('/settings/providers/:provider', (req, res) => {
    const { provider } = req.params;
    if (!isValidProviderId(provider)) {
      return res.status(404).json({ error: `Unknown provider: ${provider}` });
    }
    const preset = PROVIDER_PRESETS[provider];
    res.json(buildProviderInfo(preset));
  });

  /**
   * POST /settings/providers/:provider/test — test provider connection.
   */
  router.post('/settings/providers/:provider/test', async (req, res) => {
    const { provider } = req.params;
    if (!isValidProviderId(provider)) {
      return res.status(404).json({ error: `Unknown provider: ${provider}` });
    }
    const preset = PROVIDER_PRESETS[provider];
    try {
      const result = await testProviderConnection(preset);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Connection test failed: ${err.message}`,
      });
    }
  });

  return router;
}
