import { Lightbulb, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { Decision } from '../../types';

interface Props {
  decisions: Decision[];
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function DecisionPanel({ decisions, onConfirm, onReject }: Props) {
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
          decisions.map((d, i) => (
            <div key={d.id || `dec-${i}`} className={`bg-gray-800 border rounded p-2 ${d.needsConfirmation && d.status === 'recorded' ? 'border-yellow-600' : d.status === 'rejected' ? 'border-red-700' : 'border-gray-700'}`}>
              <div className="flex items-start gap-2">
                {d.needsConfirmation && d.status === 'recorded' ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                ) : d.status === 'confirmed' ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                ) : d.status === 'rejected' ? (
                  <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                ) : (
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono font-semibold text-gray-200">{d.title}</p>
                  {d.rationale && (
                    <p className="text-xs font-mono text-gray-400 mt-1">{d.rationale}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-600">
                      {new Date(d.timestamp).toLocaleTimeString()}
                    </p>
                    {d.status && d.status !== 'recorded' && (
                      <span className={`text-xs px-1 rounded ${d.status === 'confirmed' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {d.status}
                      </span>
                    )}
                  </div>
                  {d.needsConfirmation && d.status === 'recorded' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => onConfirm?.(d.id)}
                        className="text-xs px-2 py-1 rounded bg-green-800 hover:bg-green-700 text-green-200 flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" /> Confirm
                      </button>
                      <button
                        onClick={() => onReject?.(d.id)}
                        className="text-xs px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-red-200 flex items-center gap-1"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
