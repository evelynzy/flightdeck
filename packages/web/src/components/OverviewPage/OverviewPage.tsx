import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useLeadStore } from '../../stores/leadStore';
import type { ProgressSnapshot } from '../../stores/leadStore';
import type { Decision } from '../../types';
import { AlertTriangle, Check, X, MessageSquare, Send, Clock } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';

interface Props {
  api: any;
  ws: any;
}

/** Format an ISO timestamp into a short human-readable string */
function fmtTime(ts: string | number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

// ── Pending Decision Card ───────────────────────────────────────────────

function PendingDecisionCard({
  decision,
  onApprove,
  onDeny,
  onRespond,
}: {
  decision: Decision;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onRespond: (id: string, message: string) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [acting, setActing] = useState(false);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setActing(true);
    await onRespond(decision.id, replyText.trim());
    setActing(false);
    setShowReply(false);
    setReplyText('');
  };

  return (
    <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-lg p-3 animate-pulse-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-yellow-200 truncate">{decision.title}</h4>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{decision.rationale}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-gray-500 bg-gray-700/50 px-1 rounded">
              {decision.agentRole}
            </span>
            <span className="text-[10px] text-gray-500">
              <Clock className="w-3 h-3 inline mr-0.5" />
              {fmtTime(decision.timestamp)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setActing(true); onApprove(decision.id); }}
            disabled={acting}
            className="px-2 py-1 text-xs rounded bg-green-600/80 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
            title="Approve"
          >
            <Check className="w-3.5 h-3.5 inline" /> Approve
          </button>
          <button
            onClick={() => { setActing(true); onDeny(decision.id); }}
            disabled={acting}
            className="px-2 py-1 text-xs rounded bg-red-600/80 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
            title="Deny"
          >
            <X className="w-3.5 h-3.5 inline" /> Deny
          </button>
          <button
            onClick={() => setShowReply(!showReply)}
            disabled={acting}
            className="px-2 py-1 text-xs rounded bg-blue-600/80 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
            title="Reply with feedback"
          >
            <MessageSquare className="w-3.5 h-3.5 inline" /> Reply
          </button>
        </div>
      </div>
      {showReply && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSendReply(); }}
            placeholder="Your feedback..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <button
            onClick={handleSendReply}
            disabled={!replyText.trim() || acting}
            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            <Send className="w-3 h-3 inline" /> Send
          </button>
        </div>
      )}
    </div>
  );
}

// ── Decision Timeline Item ──────────────────────────────────────────────

function DecisionTimelineItem({
  decision,
  projectName,
  onApprove,
  onDeny,
  onRespond,
}: {
  decision: Decision;
  projectName?: string;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onRespond: (id: string, message: string) => void;
}) {
  const isPending = decision.needsConfirmation && decision.status === 'recorded';
  const statusColor =
    decision.status === 'confirmed'
      ? 'border-green-500/40 bg-green-900/10'
      : decision.status === 'rejected'
        ? 'border-red-500/40 bg-red-900/10'
        : isPending
          ? 'border-yellow-500/40 bg-yellow-900/10'
          : 'border-gray-700 bg-gray-800/50';

  const statusBadge =
    decision.status === 'confirmed' ? (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-600/30 text-green-400">
        ✅ Confirmed {decision.confirmedAt ? fmtTime(decision.confirmedAt) : ''}
      </span>
    ) : decision.status === 'rejected' ? (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-600/30 text-red-400">
        ❌ Rejected {decision.confirmedAt ? fmtTime(decision.confirmedAt) : ''}
      </span>
    ) : null;

  return (
    <div className={`border rounded-lg p-3 ${statusColor}`}>
      {isPending ? (
        <PendingDecisionCard
          decision={decision}
          onApprove={onApprove}
          onDeny={onDeny}
          onRespond={onRespond}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-200 truncate">{decision.title}</h4>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{decision.rationale}</p>
            </div>
            {statusBadge}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] font-mono text-gray-500 bg-gray-700/50 px-1 rounded">
              {decision.agentRole}
            </span>
            {projectName && (
              <span className="text-[10px] font-mono text-purple-400/70 bg-gray-700/50 px-1 rounded">
                {projectName}
              </span>
            )}
            <span className="text-[10px] text-gray-500 ml-auto">
              <Clock className="w-3 h-3 inline mr-0.5" />
              {fmtTime(decision.timestamp)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Progress Card ───────────────────────────────────────────────────────

function ProjectProgressCard({
  leadId,
  projectName,
  teamSize,
  completionPct,
  latestSnapshot,
}: {
  leadId: string;
  projectName: string;
  teamSize: number;
  completionPct: number;
  latestSnapshot: ProgressSnapshot | null;
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-100 truncate" title={projectName}>
          {projectName}
        </h3>
        <span className="text-xs text-gray-500 font-mono">{teamSize} agents</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
        <div
          className="bg-accent h-2 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(completionPct, 100)}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mb-2">{completionPct}% complete</p>

      {latestSnapshot && (
        <>
          {latestSnapshot.summary && (
            <p className="text-xs text-gray-300 mb-2 line-clamp-3">{latestSnapshot.summary}</p>
          )}
          <div className="space-y-1">
            {latestSnapshot.completed.length > 0 && (
              <div>
                <span className="text-[10px] text-green-400 font-semibold">✅ Completed</span>
                <ul className="ml-3">
                  {latestSnapshot.completed.slice(0, 5).map((item, i) => (
                    <li key={i} className="text-[11px] text-gray-400 truncate">
                      {item}
                    </li>
                  ))}
                  {latestSnapshot.completed.length > 5 && (
                    <li className="text-[10px] text-gray-500">
                      +{latestSnapshot.completed.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            {latestSnapshot.inProgress.length > 0 && (
              <div>
                <span className="text-[10px] text-blue-400 font-semibold">🔄 In Progress</span>
                <ul className="ml-3">
                  {latestSnapshot.inProgress.slice(0, 5).map((item, i) => (
                    <li key={i} className="text-[11px] text-gray-400 truncate">
                      {item}
                    </li>
                  ))}
                  {latestSnapshot.inProgress.length > 5 && (
                    <li className="text-[10px] text-gray-500">
                      +{latestSnapshot.inProgress.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            {latestSnapshot.blocked.length > 0 && (
              <div>
                <span className="text-[10px] text-red-400 font-semibold">🚫 Blocked</span>
                <ul className="ml-3">
                  {latestSnapshot.blocked.slice(0, 5).map((item, i) => (
                    <li key={i} className="text-[11px] text-gray-400 truncate">
                      {item}
                    </li>
                  ))}
                  {latestSnapshot.blocked.length > 5 && (
                    <li className="text-[10px] text-gray-500">
                      +{latestSnapshot.blocked.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export function OverviewPage({ api, ws }: Props) {
  const [allDecisions, setAllDecisions] = useState<Decision[]>([]);
  const agents = useAppStore((s) => s.agents);
  const { projects } = useLeadStore();

  // Fetch all decisions on mount + poll every 5s
  const loadDecisions = useCallback(async () => {
    try {
      const data = await apiFetch<Decision[]>('/decisions');
      setAllDecisions(data);
    } catch {
      // ignore fetch errors during polling
    }
  }, []);

  useEffect(() => {
    loadDecisions();
    const interval = setInterval(loadDecisions, 5000);
    return () => clearInterval(interval);
  }, [loadDecisions]);

  // Actions
  const handleApprove = useCallback(
    async (id: string) => {
      // Optimistic update
      setAllDecisions((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: 'confirmed' as const, confirmedAt: new Date().toISOString() } : d,
        ),
      );
      await apiFetch(`/decisions/${id}/confirm`, { method: 'POST' });
      loadDecisions();
    },
    [loadDecisions],
  );

  const handleDeny = useCallback(
    async (id: string) => {
      setAllDecisions((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: 'rejected' as const, confirmedAt: new Date().toISOString() } : d,
        ),
      );
      await apiFetch(`/decisions/${id}/reject`, { method: 'POST' });
      loadDecisions();
    },
    [loadDecisions],
  );

  const handleRespond = useCallback(
    async (id: string, message: string) => {
      // Optimistic update
      setAllDecisions((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: 'confirmed' as const, confirmedAt: new Date().toISOString() } : d,
        ),
      );
      await apiFetch(`/decisions/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      loadDecisions();
    },
    [loadDecisions],
  );

  // Pending decisions (needs confirmation + still recorded)
  const pendingDecisions = allDecisions.filter(
    (d) => d.needsConfirmation && d.status === 'recorded',
  );

  // Build lead agents list
  const leadAgents = agents.filter((a) => a.role.id === 'lead' && !a.parentId);

  // Build a map of agentId → projectName for the timeline
  const agentProjectMap = new Map<string, string>();
  for (const agent of agents) {
    if (agent.projectName) {
      agentProjectMap.set(agent.id, agent.projectName);
      // Also map children to parent's projectName
      for (const childId of agent.childIds) {
        agentProjectMap.set(childId, agent.projectName);
      }
    }
  }

  // Build project progress data
  const projectCards = leadAgents.map((lead) => {
    const proj = projects[lead.id];
    const teamSize = lead.childIds.length;
    const completionPct = proj?.progress?.completionPct ?? 0;
    const latestSnapshot =
      proj?.progressHistory && proj.progressHistory.length > 0
        ? proj.progressHistory[proj.progressHistory.length - 1]
        : null;

    return {
      leadId: lead.id,
      projectName: lead.projectName || `Project ${lead.id.slice(0, 8)}`,
      teamSize,
      completionPct,
      latestSnapshot,
    };
  });

  // Timeline: all decisions, newest first
  const timelineDecisions = [...allDecisions].reverse();

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* A. Pending Decisions Banner */}
      {pendingDecisions.length > 0 && (
        <div className="bg-yellow-900/30 border-2 border-yellow-500/50 rounded-lg p-4 animate-pulse-slow">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <h2 className="text-base font-bold text-yellow-200">
              {pendingDecisions.length} Decision{pendingDecisions.length !== 1 ? 's' : ''} Pending
              Confirmation
            </h2>
          </div>
          <div className="space-y-2">
            {pendingDecisions.map((d) => (
              <PendingDecisionCard
                key={d.id}
                decision={d}
                onApprove={handleApprove}
                onDeny={handleDeny}
                onRespond={handleRespond}
              />
            ))}
          </div>
        </div>
      )}

      {/* B. Progress Overview */}
      <div>
        <h2 className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wide">
          Project Progress
        </h2>
        {projectCards.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-500 font-mono">
              No active projects. Start a project from the Project Lead page.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {projectCards.map((card) => (
              <ProjectProgressCard key={card.leadId} {...card} />
            ))}
          </div>
        )}
      </div>

      {/* C. All Decisions Timeline */}
      <div>
        <h2 className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wide">
          Decisions Timeline
        </h2>
        {timelineDecisions.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-500 font-mono">No decisions recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {timelineDecisions.map((d) => (
              <DecisionTimelineItem
                key={d.id}
                decision={d}
                projectName={agentProjectMap.get(d.agentId)}
                onApprove={handleApprove}
                onDeny={handleDeny}
                onRespond={handleRespond}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
