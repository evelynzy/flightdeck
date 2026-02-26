import { useState, useEffect, useRef, useCallback } from 'react';
import { Crown, Send, Users, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { useLeadStore } from '../../stores/leadStore';
import { useAppStore } from '../../stores/appStore';
import { DecisionPanel } from './DecisionPanel';
import { TeamStatus } from './TeamStatus';

interface Props {
  api: any;
  ws: any;
}

export function LeadDashboard({ api, ws }: Props) {
  const { leadAgentId, messages, progress, decisions } = useLeadStore();
  const agents = useAppStore((s) => s.agents);
  const [input, setInput] = useState('');
  const [starting, setStarting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const leadAgent = agents.find((a) => a.id === leadAgentId);
  const isActive = leadAgent && leadAgent.status === 'running';

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll progress
  useEffect(() => {
    if (!leadAgentId) return;
    const fetchProgress = () => {
      fetch('/api/lead/progress').then((r) => r.json()).then((data) => {
        if (data && !data.error) useLeadStore.getState().setProgress(data);
      }).catch(() => {});
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, [leadAgentId]);

  // Poll decisions
  useEffect(() => {
    if (!leadAgentId) return;
    const fetchDecisions = () => {
      fetch('/api/lead/decisions').then((r) => r.json()).then((data) => {
        if (Array.isArray(data)) useLeadStore.getState().setDecisions(data);
      }).catch(() => {});
    };
    fetchDecisions();
    const interval = setInterval(fetchDecisions, 5000);
    return () => clearInterval(interval);
  }, [leadAgentId]);

  // Listen for lead-specific WebSocket events
  useEffect(() => {
    const handler = (event: Event) => {
      const msg = JSON.parse((event as MessageEvent).data);
      if (msg.type === 'lead:decision') {
        useLeadStore.getState().addDecision(msg);
      }
      // Accumulate agent text for the lead agent
      if (msg.type === 'agent:text' && msg.agentId === leadAgentId) {
        useLeadStore.getState().appendToLastAgentMessage(msg.text);
      }
    };
    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, [leadAgentId]);

  const startLead = useCallback(async (task?: string) => {
    setStarting(true);
    try {
      const resp = await fetch('/api/lead/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      const data = await resp.json();
      if (data.id) {
        useLeadStore.getState().setLeadAgentId(data.id);
      }
    } catch {
      // ignore
    } finally {
      setStarting(false);
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !leadAgentId) return;
    const text = input.trim();
    setInput('');
    useLeadStore.getState().addMessage({ type: 'text', text, sender: 'user' });
    await fetch('/api/lead/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }, [input, leadAgentId]);

  // Start screen
  if (!leadAgentId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Crown className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Project Lead</h2>
          <p className="text-gray-400 mb-6 font-mono text-sm">
            Start a Project Lead to supervise your AI crew. Describe your project or task and the lead will assemble and manage a team of specialist agents.
          </p>
          <div className="space-y-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your project or task..."
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 resize-none h-24 focus:outline-none focus:border-yellow-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  startLead(input.trim() || undefined);
                }
              }}
            />
            <button
              onClick={() => startLead(input.trim() || undefined)}
              disabled={starting}
              className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-black font-semibold py-2 px-4 rounded flex items-center justify-center gap-2"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
              {starting ? 'Starting...' : 'Start Project Lead'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const teamAgents = agents.filter((a) => a.parentId === leadAgentId);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Progress banner */}
        {progress && progress.totalDelegations > 0 && (
          <div className="border-b border-gray-700 px-4 py-2 flex items-center gap-4 text-sm font-mono bg-gray-800/50">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-400" />
              <span>{progress.teamSize} agents</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span>{progress.active} active</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>{progress.completed} done</span>
            </div>
            {progress.failed > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span>{progress.failed} failed</span>
              </div>
            )}
            <div className="ml-auto">
              <div className="w-32 bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress.completionPct}%` }}
                />
              </div>
            </div>
            <span className="text-gray-400">{progress.completionPct}%</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 font-mono text-sm whitespace-pre-wrap ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 border border-gray-700'
                }`}
              >
                {msg.sender === 'agent' && (
                  <div className="flex items-center gap-1.5 mb-1 text-yellow-400 text-xs">
                    <Crown className="w-3 h-3" />
                    Project Lead
                  </div>
                )}
                <InlineMarkdown text={msg.text} />
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-700 p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isActive ? 'Message the Project Lead...' : 'Project Lead is not active'}
              disabled={!isActive}
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-yellow-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isActive || !input.trim()}
              className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-black px-3 py-2 rounded"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Right sidebar: decisions + team */}
      <div className="w-80 border-l border-gray-700 flex flex-col overflow-hidden">
        <DecisionPanel decisions={decisions} />
        <TeamStatus agents={teamAgents} delegations={progress?.delegations ?? []} />
      </div>
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Simple inline markdown: **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="bg-gray-700 px-1 rounded text-yellow-300">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
