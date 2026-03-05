import { sessionScore } from './types';
import type { SessionSummary } from './types';

interface SessionScoreBadgeProps {
  session: SessionSummary;
  avgCost: number;
}

export function SessionScoreBadge({ session, avgCost }: SessionScoreBadgeProps) {
  const score = sessionScore(session, avgCost);
  return (
    <span className="text-amber-400 text-xs whitespace-nowrap" title={`Score: ${score}/5`}>
      {'★'.repeat(score)}{'☆'.repeat(5 - score)}
    </span>
  );
}
