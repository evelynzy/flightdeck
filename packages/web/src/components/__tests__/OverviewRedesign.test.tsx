import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KeyStats } from '../OverviewPage/KeyStats';
import { MilestoneTimeline } from '../OverviewPage/MilestoneTimeline';
import { AgentHeatmap } from '../OverviewPage/AgentHeatmap';
import type { AgentInfo } from '../../types';
import type { ReplayKeyframe } from '../../hooks/useSessionReplay';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../stores/appStore', () => ({
  useAppStore: (sel: any) => sel({
    agents: [
      { id: 'a1', role: { id: 'lead', name: 'Lead' }, status: 'running' },
      { id: 'a2', role: { id: 'dev', name: 'Developer' }, status: 'idle' },
    ],
  }),
}));

vi.mock('../../stores/leadStore', () => ({
  useLeadStore: (sel: any) => sel({ selectedLeadId: 'lead-1' }),
}));

vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: false }),
}));

// ── Helpers ────────────────────────────────────────────────────────

const mockAgents: AgentInfo[] = [
  { id: 'a1', role: { id: 'lead', name: 'Lead' } as any, status: 'running', model: 'claude' } as any,
  { id: 'a2', role: { id: 'dev', name: 'Developer' } as any, status: 'idle', model: 'claude' } as any,
  { id: 'a3', role: { id: 'dev', name: 'Developer' } as any, status: 'completed', model: 'gpt' } as any,
];

// ── Tests ──────────────────────────────────────────────────────────

describe('KeyStats', () => {
  it('renders stats card', () => {
    render(<KeyStats agents={mockAgents} totalCost={5.50} budget={15} />);
    expect(screen.getByTestId('key-stats')).toBeTruthy();
    expect(screen.getByText('Key Stats')).toBeTruthy();
    expect(screen.getByText('1 active / 3 total')).toBeTruthy();
    expect(screen.getByText('$5.50 / $15')).toBeTruthy();
  });

  it('shows cost without budget', () => {
    render(<KeyStats agents={mockAgents} totalCost={3.20} />);
    expect(screen.getByText('$3.20')).toBeTruthy();
  });
});

describe('MilestoneTimeline', () => {
  it('renders empty state', () => {
    render(
      <MemoryRouter>
        <MilestoneTimeline keyframes={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No milestones yet')).toBeTruthy();
  });

  it('renders keyframes', () => {
    const kf: ReplayKeyframe[] = [
      { timestamp: '2025-01-01T10:00:00Z', label: 'Session started', type: 'agent_spawned' },
      { timestamp: '2025-01-01T10:05:00Z', label: 'Task completed', type: 'milestone' },
    ];
    render(
      <MemoryRouter>
        <MilestoneTimeline keyframes={kf} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Session started')).toBeTruthy();
    expect(screen.getByText('Task completed')).toBeTruthy();
  });
});

describe('AgentHeatmap', () => {
  it('renders empty state', () => {
    render(<AgentHeatmap agents={[]} buckets={[]} />);
    expect(screen.getByText('No agent activity data')).toBeTruthy();
  });

  it('renders with agents', () => {
    render(<AgentHeatmap agents={mockAgents} buckets={[
      { agentId: 'a1', time: Date.now(), intensity: 0.8 },
    ]} />);
    expect(screen.getByTestId('agent-heatmap')).toBeTruthy();
  });
});
