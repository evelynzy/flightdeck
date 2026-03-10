/**
 * TokenUsageSection — Shows token usage at project, session, and agent levels.
 *
 * Works even when sessions are not active — reads from persisted DB data via API.
 * Fetches from /api/costs/by-agent and /api/costs/by-task endpoints.
 * Structured to easily swap to /api/costs/by-project and /api/costs/by-session
 * when those endpoints become available.
 */
import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { formatTokens } from '../../utils/format';
import type { AgentCostSummary, TaskCostSummary, AgentInfo } from '../../types';
import { Coins, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  projectId: string;
}

export function TokenUsageSection({ projectId }: Props) {
  const [agentCosts, setAgentCosts] = useState<AgentCostSummary[]>([]);
  const [taskCosts, setTaskCosts] = useState<TaskCostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const agents = useAppStore((s) => s.agents);

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  // Filter to agents belonging to this project
  const projectAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of agents) {
      if (a.projectId === projectId) ids.add(a.id);
    }
    return ids;
  }, [agents, projectId]);

  useEffect(() => {
    let cancelled = false;
    const fetchCosts = async () => {
      try {
        const [agentRes, taskRes] = await Promise.all([
          fetch('/api/costs/by-agent'),
          fetch('/api/costs/by-task'),
        ]);
        if (cancelled) return;
        const allAgentCosts: AgentCostSummary[] = await agentRes.json();
        const allTaskCosts: TaskCostSummary[] = await taskRes.json();

        // Filter to this project's agents
        // When /api/costs/by-project becomes available, replace this with a direct call
        const filteredAgents = allAgentCosts.filter(c => projectAgentIds.has(c.agentId));
        const filteredTasks = allTaskCosts.filter(c => {
          // Include tasks where any contributing agent belongs to this project
          return c.agents.some(a => projectAgentIds.has(a.agentId));
        });

        setAgentCosts(filteredAgents);
        setTaskCosts(filteredTasks);
      } catch (err) {
        console.warn('[TokenUsage] Failed to fetch costs:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCosts();
    const interval = setInterval(fetchCosts, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectAgentIds]);

  // Aggregate totals
  const totalInput = useMemo(
    () => agentCosts.reduce((s, c) => s + c.totalInputTokens, 0),
    [agentCosts],
  );
  const totalOutput = useMemo(
    () => agentCosts.reduce((s, c) => s + c.totalOutputTokens, 0),
    [agentCosts],
  );
  const totalTokens = totalInput + totalOutput;

  if (loading) {
    return (
      <section className="rounded-xl bg-th-bg-panel border border-th-border/50 p-4">
        <div className="text-xs text-th-text-muted">Loading token usage…</div>
      </section>
    );
  }

  if (totalTokens === 0) {
    return (
      <section className="rounded-xl bg-th-bg-panel border border-th-border/50 p-4">
        <div className="flex items-center gap-2 text-th-text-muted text-xs">
          <Coins className="w-3.5 h-3.5" />
          <span>No token usage recorded yet</span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-th-bg-panel border border-th-border/50">
      {/* Summary header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-th-bg-alt/30 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-th-text-alt">Token Usage</span>
          <span className="text-xs text-th-text-muted">
            ({agentCosts.length} agent{agentCosts.length !== 1 ? 's' : ''})
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-blue-500">↓{formatTokens(totalInput)}</span>
            <span className="text-emerald-500">↑{formatTokens(totalOutput)}</span>
            <span className="font-semibold text-th-text-alt">{formatTokens(totalTokens)}</span>
          </div>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-th-text-muted" />
            : <ChevronRight className="w-3.5 h-3.5 text-th-text-muted" />}
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="border-t border-th-border/30 px-4 py-3 space-y-3">
          {/* Per-agent breakdown */}
          <AgentBreakdown costs={agentCosts} agentMap={agentMap} total={totalTokens} />

          {/* Per-task breakdown (collapsed by default) */}
          {taskCosts.length > 0 && (
            <TaskBreakdown costs={taskCosts} agentMap={agentMap} total={totalTokens} />
          )}
        </div>
      )}
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function AgentBreakdown({
  costs,
  agentMap,
  total,
}: {
  costs: AgentCostSummary[];
  agentMap: Map<string, AgentInfo>;
  total: number;
}) {
  const sorted = useMemo(
    () => [...costs].sort((a, b) =>
      (b.totalInputTokens + b.totalOutputTokens) - (a.totalInputTokens + a.totalOutputTokens)
    ),
    [costs],
  );

  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-th-text-muted mb-1.5">By Agent</h4>
      <div className="space-y-1">
        {sorted.map((cost) => {
          const agent = agentMap.get(cost.agentId);
          const agentTotal = cost.totalInputTokens + cost.totalOutputTokens;
          const pct = total > 0 ? (agentTotal / total) * 100 : 0;
          return (
            <div key={cost.agentId} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-center">{agent?.role.icon ?? '🤖'}</span>
              <span className="text-th-text-alt min-w-[80px] truncate">
                {agent?.role.name ?? cost.agentId.slice(0, 8)}
              </span>
              {/* Usage bar */}
              <div className="flex-1 h-1.5 bg-th-bg-alt rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500/60 rounded-full transition-all"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              <span className="font-mono text-th-text-muted w-14 text-right">
                {formatTokens(agentTotal)}
              </span>
              <span className="font-mono text-th-text-muted w-8 text-right text-[10px]">
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskBreakdown({
  costs,
  agentMap,
  total,
}: {
  costs: TaskCostSummary[];
  agentMap: Map<string, AgentInfo>;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...costs].sort((a, b) =>
      (b.totalInputTokens + b.totalOutputTokens) - (a.totalInputTokens + a.totalOutputTokens)
    ),
    [costs],
  );

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-th-text-muted hover:text-th-text-alt transition-colors"
      >
        {open ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        By Task ({costs.length})
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {sorted.map((cost) => {
            const taskTotal = cost.totalInputTokens + cost.totalOutputTokens;
            const pct = total > 0 ? (taskTotal / total) * 100 : 0;
            return (
              <div key={`${cost.leadId}:${cost.dagTaskId}`} className="flex items-center gap-2 text-xs">
                <span className="text-th-text-muted font-mono min-w-[120px] truncate text-[10px]">
                  {cost.dagTaskId}
                </span>
                <div className="flex-1 h-1.5 bg-th-bg-alt rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full transition-all"
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
                <span className="font-mono text-th-text-muted w-14 text-right">
                  {formatTokens(taskTotal)}
                </span>
                <div className="flex gap-0.5">
                  {cost.agents.slice(0, 3).map((a) => {
                    const agent = agentMap.get(a.agentId);
                    return (
                      <span key={a.agentId} title={agent?.role.name ?? a.agentId.slice(0, 6)}>
                        {agent?.role.icon ?? '🤖'}
                      </span>
                    );
                  })}
                  {cost.agents.length > 3 && (
                    <span className="text-th-text-muted text-[10px]">+{cost.agents.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
