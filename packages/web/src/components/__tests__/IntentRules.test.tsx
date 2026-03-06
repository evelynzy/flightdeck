import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { IntentRuleV2 } from '../IntentRules/types';
import { ACTION_DISPLAY, TRUST_PRESETS } from '../IntentRules/types';
import {
  backendToFrontend,
  frontendToCreateBody,
  frontendToPatchBody,
  type BackendIntentRule,
} from '../IntentRules/adapters';

// Mock apiFetch — capture calls for assertion
const mockApiFetch = vi.fn().mockResolvedValue([]);
vi.mock('../../hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { IntentRulesDashboard } from '../IntentRules/IntentRulesDashboard';
import { TrustPresetBar } from '../IntentRules/TrustPresetBar';
import { RuleRow } from '../IntentRules/RuleRow';
import { RuleEditor } from '../IntentRules/RuleEditor';

// ── Test Data ──────────────────────────────────────────────────────

const makeRule = (overrides: Partial<IntentRuleV2> = {}): IntentRuleV2 => ({
  id: 'rule-1',
  name: 'Auto-approve style from devs',
  enabled: true,
  priority: 1,
  action: 'auto-approve',
  match: { categories: ['style'], roles: ['developer'] },
  conditions: [],
  metadata: {
    source: 'manual',
    matchCount: 47,
    lastMatchedAt: new Date().toISOString(),
    effectivenessScore: 94,
    issuesAfterMatch: 0,
    createdAt: new Date().toISOString(),
  },
  ...overrides,
});

/** Backend-shaped rule as returned by GET /intents */
const makeBackendRule = (overrides: Partial<BackendIntentRule> = {}): BackendIntentRule => ({
  id: 'rule-backend-1',
  category: 'style',
  action: 'auto-approve',
  source: 'manual',
  approvalCount: 12,
  createdAt: '2026-01-15T10:00:00Z',
  lastMatchedAt: '2026-03-01T14:30:00Z',
  description: 'Auto-approve style changes',
  roleScopes: ['developer'],
  conditions: [],
  priority: 5,
  effectiveness: {
    totalMatches: 42,
    autoApproved: 40,
    overriddenByUser: 2,
    lastEvaluatedAt: '2026-03-05T12:00:00Z',
    score: 88,
  },
  enabled: true,
  ...overrides,
});

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue([]);
});

// ── Adapter Tests ──────────────────────────────────────────────────

describe('Intent Rules Adapters', () => {
  describe('backendToFrontend', () => {
    it('transforms a full backend rule to frontend shape', () => {
      const backend = makeBackendRule();
      const result = backendToFrontend(backend);

      expect(result.id).toBe('rule-backend-1');
      expect(result.name).toBe('Auto-approve style changes');
      expect(result.enabled).toBe(true);
      expect(result.priority).toBe(5);
      expect(result.action).toBe('auto-approve');
      expect(result.match.categories).toEqual(['style']);
      expect(result.match.roles).toEqual(['developer']);
      expect(result.metadata.source).toBe('manual');
      expect(result.metadata.matchCount).toBe(42);
      expect(result.metadata.effectivenessScore).toBe(88);
      expect(result.metadata.issuesAfterMatch).toBe(2);
      expect(result.metadata.createdAt).toBe('2026-01-15T10:00:00Z');
      expect(result.metadata.lastMatchedAt).toBe('2026-03-01T14:30:00Z');
    });

    it('maps backend action "queue" to frontend "require-review"', () => {
      const result = backendToFrontend(makeBackendRule({ action: 'queue' }));
      expect(result.action).toBe('require-review');
    });

    it('maps backend action "alert" to frontend "auto-reject"', () => {
      const result = backendToFrontend(makeBackendRule({ action: 'alert' }));
      expect(result.action).toBe('auto-reject');
    });

    it('falls back to description or generated name', () => {
      const noDesc = backendToFrontend(makeBackendRule({ description: undefined }));
      expect(noDesc.name).toBe('auto-approve style');

      const withDesc = backendToFrontend(makeBackendRule({ description: 'My Rule' }));
      expect(withDesc.name).toBe('My Rule');
    });

    it('uses approvalCount when effectiveness is missing', () => {
      const result = backendToFrontend(makeBackendRule({ effectiveness: undefined }));
      expect(result.metadata.matchCount).toBe(12); // Falls back to approvalCount
      expect(result.metadata.effectivenessScore).toBeNull();
    });

    it('handles missing optional fields gracefully', () => {
      const minimal: BackendIntentRule = {
        id: 'rule-min',
        category: 'general',
        action: 'auto-approve',
        source: 'preset',
        approvalCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        lastMatchedAt: null,
        enabled: true,
      };
      const result = backendToFrontend(minimal);
      expect(result.match.categories).toEqual(['general']);
      expect(result.match.roles).toBeUndefined();
      expect(result.conditions).toEqual([]);
      expect(result.metadata.matchCount).toBe(0);
    });

    it('maps teach_me source to manual', () => {
      const result = backendToFrontend(makeBackendRule({ source: 'teach_me' }));
      expect(result.metadata.source).toBe('manual');
    });
  });

  describe('frontendToCreateBody', () => {
    it('transforms frontend rule to backend POST body', () => {
      const rule = makeRule();
      const body = frontendToCreateBody(rule);

      expect(body.category).toBe('style');
      expect(body.source).toBe('manual');
      expect(body.action).toBe('auto-approve');
      expect(body.description).toBe('Auto-approve style from devs');
      expect(body.roleScopes).toEqual(['developer']);
      expect(body.enabled).toBe(true);
    });

    it('maps require-review action to queue', () => {
      const rule = makeRule({ action: 'require-review' });
      const body = frontendToCreateBody(rule);
      expect(body.action).toBe('queue');
    });

    it('maps auto-reject action to alert', () => {
      const rule = makeRule({ action: 'auto-reject' });
      const body = frontendToCreateBody(rule);
      expect(body.action).toBe('alert');
    });

    it('defaults category to general if empty', () => {
      const rule = makeRule({ match: { categories: [] } });
      const body = frontendToCreateBody(rule);
      expect(body.category).toBe('general');
    });
  });

  describe('frontendToPatchBody', () => {
    it('transforms frontend rule to backend PATCH body', () => {
      const rule = makeRule({ name: 'Updated rule', action: 'require-review', priority: 10 });
      const body = frontendToPatchBody(rule);

      expect(body.action).toBe('queue');
      expect(body.description).toBe('Updated rule');
      expect(body.priority).toBe(10);
      expect(body.roleScopes).toEqual(['developer']);
      expect(body.enabled).toBe(true);
      // PATCH body should NOT contain category or source
      expect(body).not.toHaveProperty('category');
      expect(body).not.toHaveProperty('source');
    });
  });
});

// ── Component Tests ────────────────────────────────────────────────

describe('Intent Rules V2', () => {
  describe('IntentRulesDashboard', () => {
    it('renders empty state with no rules', async () => {
      render(<IntentRulesDashboard />);
      const dashboard = await screen.findByTestId('intent-rules-dashboard');
      expect(dashboard).toBeInTheDocument();
      expect(screen.getByText('New Rule')).toBeInTheDocument();
    });

    it('fetches and displays rules from backend format', async () => {
      const backendRules = [
        makeBackendRule({ id: 'r1', description: 'Style auto', category: 'style' }),
        makeBackendRule({ id: 'r2', description: 'Queue arch', category: 'architecture', action: 'queue' }),
      ];
      mockApiFetch.mockResolvedValueOnce(backendRules);

      render(<IntentRulesDashboard />);
      await waitFor(() => {
        expect(screen.getByText('Style auto')).toBeInTheDocument();
        expect(screen.getByText('Queue arch')).toBeInTheDocument();
      });
    });

    it('shows summary stats when rules exist', async () => {
      mockApiFetch.mockResolvedValueOnce([makeBackendRule()]);
      render(<IntentRulesDashboard />);
      await waitFor(() => {
        expect(screen.getByText(/1 rules active/)).toBeInTheDocument();
        expect(screen.getByText(/42 total matches/)).toBeInTheDocument();
      });
    });

    it('shows New Rule editor when button clicked', async () => {
      render(<IntentRulesDashboard />);
      await screen.findByTestId('intent-rules-dashboard');
      fireEvent.click(screen.getByText('New Rule'));
      expect(screen.getByTestId('rule-editor')).toBeInTheDocument();
      expect(screen.getByText('New Intent Rule')).toBeInTheDocument();
    });

    it('calls DELETE API when rule is deleted', async () => {
      mockApiFetch.mockResolvedValueOnce([makeBackendRule({ id: 'r-del' })]);
      render(<IntentRulesDashboard />);
      await waitFor(() => expect(screen.getByText('Auto-approve style changes')).toBeInTheDocument());

      // Delete button appears on hover (via CSS) but is in the DOM
      const deleteBtn = screen.getByTitle('Delete rule');
      await act(async () => { fireEvent.click(deleteBtn); });

      expect(mockApiFetch).toHaveBeenCalledWith('/intents/r-del', { method: 'DELETE' });
    });

    it('calls PATCH API with correct body when toggle is clicked', async () => {
      mockApiFetch.mockResolvedValueOnce([makeBackendRule({ id: 'r-tog', enabled: true })]);
      render(<IntentRulesDashboard />);
      await waitFor(() => expect(screen.getByText('Auto-approve style changes')).toBeInTheDocument());

      const toggleBtn = screen.getByLabelText('Disable rule');
      await act(async () => { fireEvent.click(toggleBtn); });

      expect(mockApiFetch).toHaveBeenCalledWith('/intents/r-tog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
    });

    it('applies trust preset via API', async () => {
      render(<IntentRulesDashboard />);
      await screen.findByTestId('intent-rules-dashboard');
      await act(async () => { fireEvent.click(screen.getByText('Autonomous')); });

      expect(mockApiFetch).toHaveBeenCalledWith('/intents/presets/autonomous', { method: 'POST' });
    });

    it('handles API error gracefully — keeps empty rules', async () => {
      mockApiFetch.mockRejectedValueOnce(new Error('Network error'));
      render(<IntentRulesDashboard />);
      await waitFor(() => {
        expect(screen.getByText(/No intent rules yet/)).toBeInTheDocument();
      });
    });
  });

  describe('TrustPresetBar', () => {
    it('renders all three presets', () => {
      render(<TrustPresetBar active={null} onSelect={vi.fn()} />);
      expect(screen.getByText('Conservative')).toBeInTheDocument();
      expect(screen.getByText('Moderate')).toBeInTheDocument();
      expect(screen.getByText('Autonomous')).toBeInTheDocument();
    });

    it('highlights active preset with description', () => {
      render(<TrustPresetBar active="moderate" onSelect={vi.fn()} />);
      expect(screen.getByText(/"Routine decisions/)).toBeInTheDocument();
    });

    it('calls onSelect when clicked', () => {
      const onSelect = vi.fn();
      render(<TrustPresetBar active={null} onSelect={onSelect} />);
      fireEvent.click(screen.getByText('Autonomous'));
      expect(onSelect).toHaveBeenCalledWith('autonomous');
    });
  });

  describe('RuleRow', () => {
    it('renders rule with name and match count', () => {
      render(
        <RuleRow rule={makeRule()} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      expect(screen.getByText('Auto-approve style from devs')).toBeInTheDocument();
      expect(screen.getByText('47 matches')).toBeInTheDocument();
    });

    it('shows role badges', () => {
      render(
        <RuleRow rule={makeRule()} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      expect(screen.getByText('developer')).toBeInTheDocument();
    });

    it('shows "All agents" when no roles specified', () => {
      const rule = makeRule({ match: { categories: ['style'], roles: undefined } });
      render(
        <RuleRow rule={rule} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      expect(screen.getByText('All agents')).toBeInTheDocument();
    });

    it('shows warning for low effectiveness', () => {
      const rule = makeRule({
        metadata: { ...makeRule().metadata, effectivenessScore: 33, issuesAfterMatch: 2 },
      });
      render(
        <RuleRow rule={rule} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      expect(screen.getByText(/2 auto-approved preceded failures/)).toBeInTheDocument();
    });

    it('applies dimmed style when disabled', () => {
      const rule = makeRule({ enabled: false });
      const { container } = render(
        <RuleRow rule={rule} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      const row = container.querySelector('[data-testid="rule-row"]');
      expect(row?.className).toContain('opacity-50');
    });

    it('expands to show editor on click', () => {
      render(
        <RuleRow rule={makeRule()} onToggle={vi.fn()} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('Auto-approve style from devs'));
      expect(screen.getByTestId('rule-editor')).toBeInTheDocument();
    });

    it('calls onToggle when toggle button is clicked', () => {
      const onToggle = vi.fn();
      render(
        <RuleRow rule={makeRule({ id: 'r1', enabled: true })} onToggle={onToggle} onDelete={vi.fn()} onSave={vi.fn()} />,
      );
      fireEvent.click(screen.getByLabelText('Disable rule'));
      expect(onToggle).toHaveBeenCalledWith('r1', false);
    });

    it('calls onDelete when delete button is clicked', () => {
      const onDelete = vi.fn();
      render(
        <RuleRow rule={makeRule({ id: 'r1' })} onToggle={vi.fn()} onDelete={onDelete} onSave={vi.fn()} />,
      );
      fireEvent.click(screen.getByTitle('Delete rule'));
      expect(onDelete).toHaveBeenCalledWith('r1');
    });
  });

  describe('RuleEditor', () => {
    it('renders with save and cancel buttons', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText('Save Rule')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('shows category chips', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText(/Style/)).toBeInTheDocument();
      expect(screen.getByText(/Architecture/)).toBeInTheDocument();
    });

    it('save button is disabled when no categories selected', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      const saveBtn = screen.getByText('Save Rule');
      expect(saveBtn).toHaveAttribute('disabled');
    });

    it('save button enables after selecting a category', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      fireEvent.click(screen.getByText(/Style/));
      const saveBtn = screen.getByText('Save Rule');
      expect(saveBtn).not.toHaveAttribute('disabled');
    });

    it('calls onSave with constructed rule when Save clicked', () => {
      const onSave = vi.fn();
      render(<RuleEditor onSave={onSave} onCancel={vi.fn()} />);
      // Select a category
      fireEvent.click(screen.getByText(/Style/));
      fireEvent.click(screen.getByText('Save Rule'));

      expect(onSave).toHaveBeenCalledTimes(1);
      const savedRule: IntentRuleV2 = onSave.mock.calls[0][0];
      expect(savedRule.action).toBe('auto-approve');
      expect(savedRule.match.categories).toContain('style');
      expect(savedRule.enabled).toBe(true);
    });

    it('calls onCancel when Cancel clicked', () => {
      const onCancel = vi.fn();
      render(<RuleEditor onSave={vi.fn()} onCancel={onCancel} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('can add and remove conditions', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      fireEvent.click(screen.getByText('+ Add condition'));
      expect(screen.getByDisplayValue('50')).toBeInTheDocument();

      // Remove condition
      fireEvent.click(screen.getByText('✕'));
      expect(screen.queryByDisplayValue('50')).not.toBeInTheDocument();
    });

    it('pre-fills fields when editing an existing rule', () => {
      const existing = makeRule({ action: 'require-review', match: { categories: ['architecture'] } });
      render(<RuleEditor rule={existing} onSave={vi.fn()} onCancel={vi.fn()} />);

      // Action select should show require-review
      const actionSelect = screen.getByDisplayValue(/Require review/);
      expect(actionSelect).toBeInTheDocument();
    });

    it('shows role input when "Specific roles" is selected', () => {
      render(<RuleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
      fireEvent.click(screen.getByLabelText('Specific roles'));
      expect(screen.getByPlaceholderText('developer, qa_tester')).toBeInTheDocument();
    });
  });

  describe('types', () => {
    it('ACTION_DISPLAY covers all actions', () => {
      expect(ACTION_DISPLAY['auto-approve'].label).toBe('Auto-approve');
      expect(ACTION_DISPLAY['require-review'].label).toBe('Require review');
      expect(ACTION_DISPLAY['auto-reject'].label).toBe('Auto-reject');
      expect(ACTION_DISPLAY['queue-silent'].label).toBe('Queue silent');
    });

    it('TRUST_PRESETS covers all presets', () => {
      expect(TRUST_PRESETS.conservative).toBeDefined();
      expect(TRUST_PRESETS.moderate).toBeDefined();
      expect(TRUST_PRESETS.autonomous).toBeDefined();
    });
  });
});
