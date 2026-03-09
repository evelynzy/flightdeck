import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useLeadStore } from '../../stores/leadStore';
import { apiFetch } from '../../hooks/useApi';
import { useProjects } from '../../hooks/useProjects';
import { deriveAgentsFromKeyframes } from '../../hooks/useHistoricalAgents';
import { POLL_INTERVAL_MS } from '../../constants/timing';
import { ProgressTimeline } from './ProgressTimeline';
import { CumulativeFlow } from './TaskBurndown';
import { CostCurve } from './CostCurve';
import { KeyStats } from './KeyStats';
import { AgentHeatmap } from './AgentHeatmap';
import { MilestoneTimeline } from './MilestoneTimeline';
import { SessionHistory } from '../SessionHistory';
import type { TimelineDataPoint } from './ProgressTimeline';
import type { FlowPoint } from './TaskBurndown';
import type { CostPoint } from './CostCurve';
import type { HeatmapBucket } from './AgentHeatmap';
import type { ReplayKeyframe } from '../../hooks/useSessionReplay';

// ── Props (kept for backward compat with App.tsx route) ────────────

interface Props {
  api?: any;
  ws?: any;
}

// ── Overview Page ──────────────────────────────────────────────────

export function OverviewPage(_props: Props) {
  const agents = useAppStore((s) => s.agents);
  const selectedLeadId = useLeadStore((s) => s.selectedLeadId);

  // ── Project list for selector ───────────────────────────────────
  const { projects } = useProjects();

  // Derive the effective ID used for data fetching.
  // Priority: live lead agent > sidebar > first project
  // Uses lead.projectId (project registry UUID) when available so replay fetches
  // match the projectId stored in activity events.
  const effectiveId = useMemo(() => {
    if (selectedLeadId) {
      const lead = agents.find((a) => a.id === selectedLeadId);
      return lead?.projectId || selectedLeadId;
    }
    const lead = agents.find((a) => a.role?.id === 'lead' && !a.parentId);
    if (lead) return lead.projectId || lead.id;
    return projects.length > 0 ? projects[0].id : null;
  }, [selectedLeadId, agents, projects]);

  // Check if project has an active running lead
  const hasActiveLead = useMemo(() => {
    return agents.some(a => a.role?.id === 'lead' && a.projectId === effectiveId &&
      (a.status === 'running' || a.status === 'idle'));
  }, [agents, effectiveId]);

  // ── Data state ─────────────────────────────────────────────────
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([]);
  const [flowData, setFlowData] = useState<FlowPoint[]>([]);
  const [costData, setCostData] = useState<CostPoint[]>([]);
  const [heatmapBuckets, setHeatmapBuckets] = useState<HeatmapBucket[]>([]);
  const [keyframes, setKeyframes] = useState<ReplayKeyframe[]>([]);
  const [historicalAgents, setHistoricalAgents] = useState<any[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  // Use live agents if available, otherwise fall back to API-fetched historical agents
  const displayAgents = agents.length > 0 ? agents : historicalAgents;

  // ── Fetch overview data ────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!effectiveId) return;
    const requestId = ++fetchIdRef.current;

    try {
      // Fetch keyframes first — they drive all visualization panels
      const kfData = await apiFetch<{ keyframes: ReplayKeyframe[] }>(`/replay/${effectiveId}/keyframes`);
      const kf: ReplayKeyframe[] = kfData.keyframes ?? [];

      // Fetch/derive agent roster when live WebSocket agents are empty
      let resolvedAgents: any[] = [];
      if (agents.length === 0) {
        try {
          const agentData = await apiFetch<any[]>('/agents');
          resolvedAgents = Array.isArray(agentData) ? agentData : [];
        } catch { /* API may not have agent list endpoint */ }

        // Derive agents from spawn keyframes when REST /agents returns empty
        if (resolvedAgents.length === 0 && kf.length > 0) {
          resolvedAgents = deriveAgentsFromKeyframes(kf);
        }

        if (mountedRef.current) setHistoricalAgents(resolvedAgents);
      }

      // Bail if a newer request was started (rapid project switching)
      if (fetchIdRef.current !== requestId) return;

      // Use live agents if available, otherwise the resolved historical data
      const currentAgents = agents.length > 0 ? agents : resolvedAgents;
      if (mountedRef.current) {
        setKeyframes(kf);

        // Derive timeline data from keyframes
        if (kf.length > 0) {
          let completed = 0, inProgress = 0, agentCount = 0;
          const tPoints: TimelineDataPoint[] = [];
          const fPoints: FlowPoint[] = [];
          const cPoints: CostPoint[] = [];
          const hBuckets: HeatmapBucket[] = [];
          let taskTotal = 0;
          let spawnIdx = 0;

          // Use real token counts from available agents
          const totalInput = currentAgents.reduce((s: number, a: any) => s + (a.inputTokens ?? 0), 0);
          const totalOutput = currentAgents.reduce((s: number, a: any) => s + (a.outputTokens ?? 0), 0);
          const realTokens = totalInput + totalOutput;

          for (const frame of kf) {
            const t = new Date(frame.timestamp).getTime();

            if (frame.type === 'spawn') {
              agentCount++;
              // Map heatmap bucket to matching derived/live agent ID
              const matchAgent = currentAgents[spawnIdx];
              const bucketId = matchAgent?.id ?? `agent-${spawnIdx}`;
              spawnIdx++;
              hBuckets.push({ agentId: bucketId, time: t, intensity: 0.8 });
            }
            if (frame.type === 'agent_exit') agentCount = Math.max(0, agentCount - 1);
            if (frame.type === 'delegation') { taskTotal++; inProgress++; }
            if (frame.type === 'milestone' || frame.type === 'task') { completed++; inProgress = Math.max(0, inProgress - 1); }

            // Distribute real token usage proportionally across keyframes for the curve
            const progress = (tPoints.length + 1) / kf.length;
            cPoints.push({ time: t, cumulativeCost: realTokens * progress });

            tPoints.push({
              time: t,
              completed,
              inProgress,
              remaining: Math.max(0, taskTotal - completed - inProgress),
              agentCount,
            });
            fPoints.push({ time: t, created: taskTotal, inProgress, completed });
          }

          setTimelineData(tPoints);
          setFlowData(fPoints);
          setCostData(cPoints);
          setHeatmapBuckets(hBuckets);
          setTotalTokens(realTokens);
          setTotalTasks(taskTotal);
        } else {
          // No keyframes — clear stale data
          setTimelineData([]);
          setFlowData([]);
          setCostData([]);
          setHeatmapBuckets([]);
          setTotalTokens(0);
          setTotalTasks(0);
        }
      }
    } catch {
      // API not ready — show empty states
    }
  }, [effectiveId, agents.length]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS * 3); // 30s
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  // ── Session start time ─────────────────────────────────────────
  const sessionStart = useMemo(() => {
    if (keyframes.length > 0) return keyframes[0].timestamp;
    const lead = displayAgents.find((a: any) => a.id === effectiveId || a.projectId === effectiveId);
    return lead?.createdAt ?? undefined;
  }, [keyframes, displayAgents, effectiveId]);

  if (!effectiveId && projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-th-text-muted text-sm">
        No session data yet. Start a project to see the overview.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4" data-testid="overview-page">
      <div className="px-4 pt-2 space-y-4">
      {/* Hero: Progress Timeline */}
      <ProgressTimeline data={timelineData} width={800} height={240} />

      {/* Milestones */}
      <MilestoneTimeline keyframes={keyframes} />

      {/* Stats row: Burndown + Cost + Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CumulativeFlow data={flowData} />
        <CostCurve data={costData} />
        <KeyStats agents={displayAgents} totalTokens={totalTokens} sessionStart={sessionStart} />
      </div>

      {/* Agent Activity Heatmap */}
      <AgentHeatmap agents={displayAgents} buckets={heatmapBuckets} />

      {/* Session History */}
      {effectiveId && (
        <SessionHistory projectId={effectiveId} hasActiveLead={hasActiveLead} />
      )}
      </div>
    </div>
  );
}
