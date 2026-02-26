import { create } from 'zustand';
import type { Decision, Delegation, LeadProgress, AgentInfo, AcpTextChunk } from '../types';

interface LeadState {
  leadAgentId: string | null;
  decisions: Decision[];
  progress: LeadProgress | null;
  messages: AcpTextChunk[];

  setLeadAgentId: (id: string | null) => void;
  setDecisions: (decisions: Decision[]) => void;
  addDecision: (decision: Decision) => void;
  setProgress: (progress: LeadProgress) => void;
  addMessage: (msg: AcpTextChunk) => void;
  appendToLastAgentMessage: (text: string) => void;
  clearMessages: () => void;
  reset: () => void;
}

export const useLeadStore = create<LeadState>((set) => ({
  leadAgentId: null,
  decisions: [],
  progress: null,
  messages: [],

  setLeadAgentId: (id) => set({ leadAgentId: id }),

  setDecisions: (decisions) => set({ decisions }),

  addDecision: (decision) =>
    set((s) => ({ decisions: [...s.decisions, decision] })),

  setProgress: (progress) => set({ progress }),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastAgentMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].sender === 'agent') {
        msgs[lastIdx] = { ...msgs[lastIdx], text: msgs[lastIdx].text + text };
      } else {
        msgs.push({ type: 'text', text: text.replace(/^\n+/, ''), sender: 'agent' });
      }
      return { messages: msgs };
    }),

  clearMessages: () => set({ messages: [] }),

  reset: () =>
    set({
      leadAgentId: null,
      decisions: [],
      progress: null,
      messages: [],
    }),
}));
