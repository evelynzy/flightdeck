import { Lightbulb } from 'lucide-react';
import type { Decision } from '../../types';

interface Props {
  decisions: Decision[];
}

export function DecisionPanel({ decisions }: Props) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2 shrink-0">
        <Lightbulb className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-semibold">Decisions</span>
        <span className="text-xs text-gray-500 ml-auto">{decisions.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {decisions.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4 font-mono">
            No decisions yet
          </p>
        ) : (
          decisions.map((d) => (
            <div key={d.id} className="bg-gray-800 border border-gray-700 rounded p-2">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-mono font-semibold text-gray-200">{d.title}</p>
                  {d.rationale && (
                    <p className="text-xs font-mono text-gray-400 mt-1">{d.rationale}</p>
                  )}
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
