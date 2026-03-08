/**
 * ProviderManager — Detect provider availability and test connections.
 *
 * Detection strategy per provider:
 * - claude: check ANTHROPIC_API_KEY env var
 * - codex: check OPENAI_API_KEY env var
 * - copilot: check `gh auth status` (GitHub CLI authenticated)
 * - gemini/opencode/cursor: check if CLI binary is installed (which <binary>)
 */

import { execSync } from 'node:child_process';
import type { Database } from '../db/database.js';
import { PROVIDER_PRESETS, type ProviderId, type ProviderPreset } from '../adapters/presets.js';

// ── Types ────────────────────────────────────────────────────────

export type DetectionMethod = 'env_var' | 'cli_auth' | 'cli_installed';

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  /** Whether the provider is available (key set, CLI installed, or CLI authenticated). */
  configured: boolean;
  /** How availability was determined. */
  detectionMethod: DetectionMethod;
  /** Masked API key for env-var providers, CLI version for binary providers, or null. */
  detail: string | null;
  /** Whether the provider is enabled in settings. */
  enabled: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  latencyMs: number;
}

// ── Detection strategies ─────────────────────────────────────────

interface DetectionStrategy {
  method: DetectionMethod;
  envVar?: string;
}

const DETECTION_STRATEGIES: Record<ProviderId, DetectionStrategy> = {
  claude:   { method: 'env_var', envVar: 'ANTHROPIC_API_KEY' },
  codex:    { method: 'env_var', envVar: 'OPENAI_API_KEY' },
  copilot:  { method: 'cli_auth' },
  gemini:   { method: 'cli_installed' },
  opencode: { method: 'cli_installed' },
  cursor:   { method: 'cli_installed' },
};

// ── Constants ────────────────────────────────────────────────────

const SETTING_PREFIX = 'provider:';
const SETTING_SUFFIX = ':enabled';
const CONNECTION_TIMEOUT_MS = 10_000;

// ── ProviderManager ──────────────────────────────────────────────

export class ProviderManager {
  private readonly db: Database | undefined;
  private readonly env: Record<string, string | undefined>;
  /** Override for testing — avoids calling real `which`/`gh auth status`. */
  private readonly execCommand: (cmd: string) => string;

  constructor(opts: {
    db?: Database;
    env?: Record<string, string | undefined>;
    execCommand?: (cmd: string) => string;
  } = {}) {
    this.db = opts.db;
    this.env = opts.env ?? process.env;
    this.execCommand = opts.execCommand ?? ((cmd) => execSync(cmd, { encoding: 'utf8', timeout: 5_000 }).trim());
  }

  // ── Status ───────────────────────────────────────────────

  /** Get status for a single provider. */
  getProviderStatus(provider: ProviderId): ProviderStatus {
    const preset = PROVIDER_PRESETS[provider];
    if (!preset) throw new Error(`Unknown provider: ${provider}`);

    const strategy = DETECTION_STRATEGIES[provider];
    const { configured, detail } = this.detect(provider, preset, strategy);

    return {
      id: provider,
      name: preset.name,
      configured,
      detectionMethod: strategy.method,
      detail,
      enabled: this.isProviderEnabled(provider),
    };
  }

  /** Get status for all providers. */
  getAllProviderStatuses(): ProviderStatus[] {
    return (Object.keys(PROVIDER_PRESETS) as ProviderId[]).map((id) =>
      this.getProviderStatus(id),
    );
  }

  // ── Enabled/Disabled ─────────────────────────────────────

  /** Check if a provider is enabled. Defaults to true if no setting. */
  isProviderEnabled(provider: ProviderId): boolean {
    if (!this.db) return true;
    const val = this.db.getSetting(`${SETTING_PREFIX}${provider}${SETTING_SUFFIX}`);
    return val !== 'false';
  }

  /** Set whether a provider is enabled. */
  setProviderEnabled(provider: ProviderId, enabled: boolean): void {
    if (!this.db) return;
    this.db.setSetting(`${SETTING_PREFIX}${provider}${SETTING_SUFFIX}`, String(enabled));
  }

  // ── Connection Testing ───────────────────────────────────

  /**
   * Test connectivity to a provider.
   * - env_var providers: call their API (list models)
   * - cli_auth: run `gh auth status`
   * - cli_installed: run `<binary> --version`
   */
  async testConnection(provider: ProviderId): Promise<ConnectionTestResult> {
    const preset = PROVIDER_PRESETS[provider];
    if (!preset) return { success: false, error: `Unknown provider: ${provider}`, latencyMs: 0 };

    const strategy = DETECTION_STRATEGIES[provider];
    const start = Date.now();

    try {
      switch (strategy.method) {
        case 'env_var': {
          const apiKey = this.env[strategy.envVar!];
          if (!apiKey) return { success: false, error: `${strategy.envVar} not set`, latencyMs: 0 };
          await this.testApiConnection(provider, apiKey);
          break;
        }
        case 'cli_auth':
          this.execCommand('gh auth status');
          break;
        case 'cli_installed':
          this.execCommand(`which ${preset.binary}`);
          break;
      }
      return { success: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: err.message || String(err), latencyMs: Date.now() - start };
    }
  }

  // ── Detection logic ──────────────────────────────────────

  private detect(
    provider: ProviderId,
    preset: ProviderPreset,
    strategy: DetectionStrategy,
  ): { configured: boolean; detail: string | null } {
    switch (strategy.method) {
      case 'env_var': {
        const val = this.env[strategy.envVar!];
        return { configured: !!val, detail: val ? maskApiKey(val) : null };
      }
      case 'cli_auth':
        return this.detectCliAuth();
      case 'cli_installed':
        return this.detectCliBinary(preset.binary);
    }
  }

  /** Check if `gh auth status` succeeds (copilot). */
  private detectCliAuth(): { configured: boolean; detail: string | null } {
    try {
      const output = this.execCommand('gh auth status');
      return { configured: true, detail: output.split('\n')[0] || 'authenticated' };
    } catch {
      return { configured: false, detail: null };
    }
  }

  /** Check if a CLI binary is on PATH. */
  private detectCliBinary(binary: string): { configured: boolean; detail: string | null } {
    try {
      const path = this.execCommand(`which ${binary}`);
      return { configured: true, detail: path };
    } catch {
      return { configured: false, detail: null };
    }
  }

  /** API-based connection test for env_var providers. */
  private async testApiConnection(provider: ProviderId, apiKey: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

    try {
      let res: Response;
      switch (provider) {
        case 'claude':
          res = await fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            signal: controller.signal,
          });
          break;
        case 'codex':
          res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
          break;
        default:
          return; // No API test for other providers
      }
      if (!res.ok) throw new Error(`API returned ${res.status}: ${res.statusText}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ── Utility functions ────────────────────────────────────────────

/**
 * Mask an API key for display: show first 8 and last 4 characters.
 * Short keys (< 16 chars) show first 4 + last 2.
 */
export function maskApiKey(key: string): string {
  if (!key) return '****';
  if (key.length < 8) return '****';
  if (key.length < 16) return `${key.slice(0, 4)}...${key.slice(-2)}`;
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
