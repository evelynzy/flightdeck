import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock AcpConnection ────────────────────────────────────────────
const mockPrompt = vi.fn().mockResolvedValue({ stopReason: 'end_turn' });
const mockCancel = vi.fn().mockResolvedValue(undefined);
vi.mock('../acp/AcpConnection.js', () => ({
  AcpConnection: vi.fn().mockImplementation(() => ({
    isConnected: true,
    isPrompting: false,
    promptingStartedAt: null,
    supportsImages: false,
    prompt: mockPrompt,
    cancel: mockCancel,
    on: vi.fn(),
    emit: vi.fn(),
    start: vi.fn(),
  })),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../db/index.js', () => ({
  db: {},
  schema: {},
}));

import { Agent } from '../agents/Agent.js';
import type { ServerConfig } from '../config.js';

const testConfig: ServerConfig = {
  port: 3000,
  host: 'localhost',
  cliCommand: 'copilot',
  cliArgs: [],
  maxConcurrentAgents: 10,
  dbPath: ':memory:',
};

function createTestAgent(): Agent {
  const agent = new Agent(
    { id: 'lead', name: 'lead', description: 'Lead agent', systemPrompt: 'system', color: '#fff', icon: '👤', builtIn: true },
    testConfig,
  );
  // Simulate ACP connection
  (agent as any).acpConnection = {
    isConnected: true,
    isPrompting: false,
    promptingStartedAt: null,
    supportsImages: false,
    prompt: mockPrompt,
    cancel: mockCancel,
  };
  return agent;
}

describe('User message priority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent.queueMessage with priority', () => {
    it('queues normal messages at the back', () => {
      const agent = createTestAgent();
      // Make agent busy so messages queue
      (agent as any).status = 'running';

      agent.queueMessage('agent-msg-1');
      agent.queueMessage('agent-msg-2');
      agent.queueMessage('agent-msg-3');

      const summaries = agent.getPendingMessageSummaries();
      expect(summaries).toEqual(['agent-msg-1', 'agent-msg-2', 'agent-msg-3']);
    });

    it('queues priority messages at the front', () => {
      const agent = createTestAgent();
      (agent as any).status = 'running';

      agent.queueMessage('agent-msg-1');
      agent.queueMessage('agent-msg-2');
      agent.queueMessage('user-msg-priority', { priority: true });

      const summaries = agent.getPendingMessageSummaries();
      expect(summaries[0]).toBe('user-msg-priority');
      expect(summaries[1]).toBe('agent-msg-1');
      expect(summaries[2]).toBe('agent-msg-2');
    });

    it('queues priority messages at front even when system paused', () => {
      const agent = createTestAgent();
      (agent as any).systemPaused = true;

      agent.queueMessage('agent-msg-1');
      agent.queueMessage('user-msg', { priority: true });

      const summaries = agent.getPendingMessageSummaries();
      expect(summaries[0]).toBe('user-msg');
      expect(summaries[1]).toBe('agent-msg-1');
    });

    it('sends priority message immediately when idle', () => {
      const agent = createTestAgent();
      (agent as any).status = 'idle';

      agent.queueMessage('user-msg', { priority: true });

      expect(mockPrompt).toHaveBeenCalledWith('user-msg', { priority: true });
    });

    it('sends normal message immediately when idle', () => {
      const agent = createTestAgent();
      (agent as any).status = 'idle';

      agent.queueMessage('agent-msg');

      expect(mockPrompt).toHaveBeenCalledWith('agent-msg', undefined);
    });
  });

  describe('Agent.write with priority', () => {
    it('passes priority option to AcpConnection.prompt', () => {
      const agent = createTestAgent();

      agent.write('user message', { priority: true });

      expect(mockPrompt).toHaveBeenCalledWith('user message', { priority: true });
    });

    it('sends without priority by default', () => {
      const agent = createTestAgent();

      agent.write('agent message');

      expect(mockPrompt).toHaveBeenCalledWith('agent message', undefined);
    });
  });

  describe('multiple priority messages maintain FIFO among themselves', () => {
    it('first priority message stays at front, second goes after it', () => {
      const agent = createTestAgent();
      (agent as any).status = 'running';

      agent.queueMessage('agent-msg-1');
      agent.queueMessage('user-msg-1', { priority: true });
      agent.queueMessage('agent-msg-2');
      agent.queueMessage('user-msg-2', { priority: true });

      const summaries = agent.getPendingMessageSummaries();
      // Priority messages unshift: user-msg-2 at [0], user-msg-1 at [1], then agents
      expect(summaries[0]).toBe('user-msg-2');
      expect(summaries[1]).toBe('user-msg-1');
      expect(summaries[2]).toBe('agent-msg-1');
      expect(summaries[3]).toBe('agent-msg-2');
    });
  });
});
