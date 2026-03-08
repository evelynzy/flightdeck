/**
 * ProvidersSection — provider configuration cards for the Settings page.
 *
 * Shows status (configured/not-configured), masked API key preview,
 * connection test button, and setup instructions for each provider.
 * API keys are NEVER fetched or displayed in full — only masked previews.
 */
import { useState, useEffect, useCallback } from 'react';
import { Cpu, CheckCircle, XCircle, Circle, Loader2, Zap, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';

// ── Types ───────────────────────────────────────────────────────────

interface ProviderInfo {
  id: string;
  name: string;
  status: 'configured' | 'not-configured' | 'error';
  maskedKey: string | null;
  requiredEnvVars: string[];
  binary: string;
  defaultModel: string | null;
  supportsResume: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
  latency?: number;
}

// ── Provider Icons ──────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  copilot: '🐙',
  claude: '🟠',
  gemini: '💎',
  opencode: '🔓',
  cursor: '↗️',
  codex: '🤖',
};

const PROVIDER_DOCS: Record<string, string> = {
  copilot: 'https://docs.github.com/en/copilot',
  claude: 'https://docs.anthropic.com/en/docs/developer-tools/claude-code',
  gemini: 'https://ai.google.dev/gemini-api/docs/api-key',
  opencode: 'https://github.com/nicepkg/opencode',
  cursor: 'https://docs.cursor.com',
  codex: 'https://platform.openai.com/docs/api-reference',
};

// ── Status Badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProviderInfo['status'] }) {
  switch (status) {
    case 'configured':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
          <CheckCircle size={10} /> Configured
        </span>
      );
    case 'not-configured':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-th-text-muted bg-th-bg-alt px-2 py-0.5 rounded-full">
          <Circle size={10} /> Not configured
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
          <XCircle size={10} /> Error
        </span>
      );
  }
}

// ── Provider Card ───────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: ProviderInfo }) {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<TestResult>(
        `/settings/providers/${provider.id}/test`,
        { method: 'POST' },
      );
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }, [provider.id]);

  const icon = PROVIDER_ICONS[provider.id] ?? '🔌';
  const docsUrl = PROVIDER_DOCS[provider.id];

  return (
    <div
      className="bg-surface-raised border border-th-border rounded-lg overflow-hidden transition-colors hover:border-th-border-hover"
      data-testid={`provider-card-${provider.id}`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
        aria-label={`${provider.name} provider details`}
      >
        <span className="text-lg" role="img" aria-label={provider.name}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-th-text-alt">{provider.name}</span>
            <StatusBadge status={provider.status} />
          </div>
          <div className="text-xs text-th-text-muted">
            {provider.maskedKey ? (
              <code className="font-mono text-[10px]">{provider.maskedKey}</code>
            ) : provider.requiredEnvVars.length > 0 ? (
              <span>Set <code className="font-mono text-[10px]">{provider.requiredEnvVars[0]}</code> to configure</span>
            ) : (
              <span>Uses OAuth — no API key needed</span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-th-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-th-text-muted shrink-0" />
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-th-border px-4 py-3 bg-th-bg-alt/30 space-y-3">
          {/* Config Details */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-th-text-muted">Binary:</span>{' '}
              <code className="font-mono text-th-text-alt">{provider.binary}</code>
            </div>
            {provider.defaultModel && (
              <div>
                <span className="text-th-text-muted">Default model:</span>{' '}
                <code className="font-mono text-th-text-alt">{provider.defaultModel}</code>
              </div>
            )}
            <div>
              <span className="text-th-text-muted">Session resume:</span>{' '}
              <span className={provider.supportsResume ? 'text-green-400' : 'text-th-text-muted'}>
                {provider.supportsResume ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {/* Env var setup instructions */}
          {provider.status === 'not-configured' && provider.requiredEnvVars.length > 0 && (
            <div className="bg-th-bg-alt border border-th-border rounded-md p-3 text-xs">
              <p className="text-th-text-muted mb-1.5">To configure this provider, set the environment variable:</p>
              <code className="block bg-th-bg border border-th-border rounded px-2 py-1.5 font-mono text-th-text-alt">
                export {provider.requiredEnvVars[0]}="your-api-key-here"
              </code>
              {docsUrl && (
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:text-accent-muted mt-2 transition-colors"
                >
                  <ExternalLink size={10} /> Provider docs
                </a>
              )}
            </div>
          )}

          {/* Test Connection */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded-md transition-colors disabled:opacity-50"
              data-testid={`test-connection-${provider.id}`}
            >
              {testing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Zap size={12} />
              )}
              {testing ? 'Testing…' : 'Test Connection'}
            </button>

            {testResult && (
              <span
                className={`text-xs ${testResult.success ? 'text-green-400' : 'text-red-400'}`}
                data-testid={`test-result-${provider.id}`}
              >
                {testResult.success ? '✅' : '❌'} {testResult.message}
                {testResult.latency != null && (
                  <span className="text-th-text-muted ml-1">({testResult.latency}ms)</span>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProvidersSection ────────────────────────────────────────────────

export function ProvidersSection() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ProviderInfo[]>('/settings/providers')
      .then(setProviders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const configuredCount = providers.filter((p) => p.status === 'configured').length;

  return (
    <section className="bg-surface-raised border border-th-border rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" /> Providers
        </h3>
        {!loading && (
          <span className="text-[10px] text-th-text-muted">
            {configuredCount}/{providers.length} configured
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 text-th-text-muted">
          <Loader2 className="animate-spin mr-2" size={16} />
          <span className="text-sm">Loading providers…</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-md p-3" data-testid="providers-error">
          Failed to load providers: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2" data-testid="providers-list">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </section>
  );
}
