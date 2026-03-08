// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ProvidersSection } from '../ProvidersSection';

// ── Mocks ─────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

// ── Fixtures ──────────────────────────────────────────────

const MOCK_PROVIDERS = [
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    status: 'configured',
    maskedKey: null,
    requiredEnvVars: [],
    binary: 'copilot',
    defaultModel: null,
    supportsResume: true,
  },
  {
    id: 'claude',
    name: 'Claude Code',
    status: 'configured',
    maskedKey: 'sk-ant-a****',
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    binary: 'claude',
    defaultModel: 'claude-sonnet-4',
    supportsResume: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini CLI',
    status: 'not-configured',
    maskedKey: null,
    requiredEnvVars: ['GEMINI_API_KEY'],
    binary: 'gemini',
    defaultModel: 'gemini-2.5-pro',
    supportsResume: false,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    status: 'configured',
    maskedKey: null,
    requiredEnvVars: [],
    binary: 'opencode',
    defaultModel: null,
    supportsResume: false,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    status: 'not-configured',
    maskedKey: null,
    requiredEnvVars: ['CURSOR_API_KEY'],
    binary: 'agent',
    defaultModel: null,
    supportsResume: true,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    status: 'configured',
    maskedKey: 'sk-proj-****',
    requiredEnvVars: ['OPENAI_API_KEY'],
    binary: 'codex',
    defaultModel: 'gpt-5',
    supportsResume: false,
  },
];

// ── Tests ─────────────────────────────────────────────────

describe('ProvidersSection', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('renders loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ProvidersSection />);
    expect(screen.getByText('Loading providers…')).toBeInTheDocument();
  });

  it('renders all 6 provider cards after loading', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PROVIDERS);
    render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('providers-list')).toBeInTheDocument();
    });
    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini CLI')).toBeInTheDocument();
    expect(screen.getByText('OpenCode')).toBeInTheDocument();
    expect(screen.getByText('Cursor')).toBeInTheDocument();
    expect(screen.getByText('Codex CLI')).toBeInTheDocument();
  });

  it('shows configured count', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PROVIDERS);
    render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByText('4/6 configured')).toBeInTheDocument();
    });
  });

  it('shows masked key for configured providers', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PROVIDERS);
    render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByText('sk-ant-a****')).toBeInTheDocument();
    });
  });

  it('shows env var instruction for unconfigured providers', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PROVIDERS);
    render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('providers-list')).toBeInTheDocument();
    });
    // Gemini is not configured — should show its env var
    expect(screen.getByText((content) => content.includes('GEMINI_API_KEY'))).toBeInTheDocument();
  });

  it('expands a card to show details on click', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PROVIDERS);
    render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('providers-list')).toBeInTheDocument();
    });
    // Click Claude card header
    const claudeCard = screen.getByTestId('provider-card-claude');
    fireEvent.click(claudeCard.querySelector('[role="button"]')!);
    // Should now show details
    expect(screen.getByText('claude')).toBeInTheDocument(); // binary name
    expect(screen.getByTestId('test-connection-claude')).toBeInTheDocument();
  });

  it('shows test connection result on click', async () => {
    mockApiFetch
      .mockResolvedValueOnce(MOCK_PROVIDERS) // initial load
      .mockResolvedValueOnce({ success: true, message: 'Provider reachable', latency: 42 }); // test

    render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('providers-list')).toBeInTheDocument();
    });

    // Expand Claude card
    const claudeCard = screen.getByTestId('provider-card-claude');
    fireEvent.click(claudeCard.querySelector('[role="button"]')!);

    // Click test connection
    fireEvent.click(screen.getByTestId('test-connection-claude'));

    await waitFor(() => {
      expect(screen.getByTestId('test-result-claude')).toBeInTheDocument();
    });
    expect(screen.getByText(/Provider reachable/)).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('providers-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it('never displays full API keys in the DOM', async () => {
    mockApiFetch.mockResolvedValue(MOCK_PROVIDERS);
    const { container } = render(<ProvidersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('providers-list')).toBeInTheDocument();
    });
    const html = container.innerHTML;
    // Ensure no full key patterns appear
    expect(html).not.toContain('sk-ant-api03');
    expect(html).not.toContain('sk-proj-real');
    // Masked keys should be present
    expect(html).toContain('sk-ant-a****');
    expect(html).toContain('sk-proj-****');
  });
});
