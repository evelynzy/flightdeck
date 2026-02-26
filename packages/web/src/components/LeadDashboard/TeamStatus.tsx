import { Bot, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { AgentInfo, Delegation } from '../../types';

interface Props {
  agents: AgentInfo[];
  delegations: Delegation[];
}

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  creating: 'text-gray-400',
  running: 'text-blue-400',
  idle: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
};

export function TeamStatus({ agents, delegations }: Props) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-t border-gray-700">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2 shrink-0">
        <Bot className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold">Team</span>
        <span className="text-xs text-gray-500 ml-auto">{agents.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {agents.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4 font-mono">
            No team members yet
          </p>
        ) : (
          agents.map((agent) => {
            const delegation = delegations.find((d) => d.toAgentId === agent.id);
            const Icon = STATUS_ICON[agent.status] || Bot;
            const colorClass = STATUS_COLOR[agent.status] || 'text-gray-400';

            return (
              <div key={agent.id} className="bg-gray-800 border border-gray-700 rounded p-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{agent.role.icon}</span>
                  <span className="text-sm font-mono font-semibold text-gray-200 truncate">
                    {agent.role.name}
                  </span>
                  <Icon className={`w-3.5 h-3.5 ${colorClass} ml-auto shrink-0 ${agent.status === 'running' ? 'animate-spin' : ''}`} />
                </div>
                {delegation && (
                  <p className="text-xs font-mono text-gray-400 mt-1 truncate" title={delegation.task}>
                    {delegation.task}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-mono ${colorClass}`}>{agent.status}</span>
                  <span className="text-xs text-gray-600">{agent.id.slice(0, 8)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
