import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { AnalyticsOverview } from './types';

interface SessionOverviewCardProps {
  overview: AnalyticsOverview;
}

export function SessionOverviewCard({ overview }: SessionOverviewCardProps) {
  const { totalSessions, totalCostUsd, avgCostPerSession, sessions } = overview;

  // Total duration from sessions
  const totalDurationMs = sessions.reduce((sum, s) => {
    if (!s.endedAt) return sum;
    return sum + (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime());
  }, 0);
  const totalHours = totalDurationMs / 3_600_000;

  const totalTasks = sessions.reduce((s, x) => s + x.taskCount, 0);

  // Cost trend arrow
  const recent3 = sessions.slice(0, 3);
  const older3 = sessions.slice(3, 6);
  let TrendIcon = Minus;
  let trendColor = 'text-th-text-muted';
  if (recent3.length >= 2 && older3.length >= 2) {
    const recentAvg = recent3.reduce((s, x) => s + x.estimatedCostUsd, 0) / recent3.length;
    const olderAvg = older3.reduce((s, x) => s + x.estimatedCostUsd, 0) / older3.length;
    if (recentAvg < olderAvg * 0.9) {
      TrendIcon = TrendingDown;
      trendColor = 'text-green-500';
    } else if (recentAvg > olderAvg * 1.1) {
      TrendIcon = TrendingUp;
      trendColor = 'text-red-400';
    }
  }

  return (
    <div className="bg-surface-raised border border-th-border rounded-lg p-4" data-testid="session-overview-card">
      <h3 className="text-xs font-semibold text-th-text-muted uppercase tracking-wide mb-3">Sessions</h3>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total sessions" value={String(totalSessions)} />
        <Stat label="Total time" value={`${totalHours.toFixed(1)}h`} />
        <Stat label="Tasks completed" value={String(totalTasks)} />
        <div>
          <p className="text-[10px] text-th-text-muted">Total cost</p>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-th-text-alt">${totalCostUsd.toFixed(2)}</span>
            <TrendIcon size={14} className={trendColor} />
          </div>
        </div>
      </div>
      <p className="text-[10px] text-th-text-muted mt-2">
        Avg: ${avgCostPerSession.toFixed(2)}/session
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-th-text-muted">{label}</p>
      <p className="text-lg font-bold text-th-text-alt">{value}</p>
    </div>
  );
}
