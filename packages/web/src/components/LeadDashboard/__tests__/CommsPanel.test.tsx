// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CommsPanelContent } from '../CommsPanel';
import type { AgentComm } from '../../../stores/leadStore';
import type { GroupMessage } from '../../../types';

// Mock appStore
vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    vi.fn(() => null),
    { getState: () => ({ agents: [], setSelectedAgent: vi.fn() }) },
  ),
}));

// Mock the Markdown component to verify it receives the right props
vi.mock('../../ui/Markdown', () => ({
  Markdown: ({ text, monospace }: { text: string; monospace?: boolean }) => (
    <div data-testid="markdown-renderer" data-monospace={monospace ? 'true' : 'false'}>
      {text}
    </div>
  ),
}));

// Mock AgentReportBlock
vi.mock('../AgentReportBlock', () => ({
  AgentReportBlock: ({ content }: { content: string }) => (
    <div data-testid="agent-report-block">{content}</div>
  ),
}));

// jsdom doesn't implement scrollTo
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

// Mock messageTiers to avoid complexity
vi.mock('../../../utils/messageTiers', () => ({
  classifyMessage: () => 'routine',
  tierPassesFilter: () => true,
  TIER_CONFIG: {
    critical: { bgClass: '', borderBClass: '', borderClass: '' },
    notable: { bgClass: '', borderBClass: '', borderClass: '' },
    routine: { bgClass: '', borderBClass: '', borderClass: '' },
  },
}));

function makeComm(overrides: Partial<AgentComm> = {}): AgentComm {
  return {
    id: 'comm-1',
    fromId: 'agent-aaa',
    toId: 'agent-bbb',
    fromRole: 'Architect',
    toRole: 'Project Lead',
    content: 'Hello **world**',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeGroupMsg(overrides: Partial<GroupMessage> = {}): GroupMessage {
  return {
    id: 'gm-1',
    groupName: 'test-group',
    fromId: 'agent-aaa',
    fromRole: 'Developer',
    content: '## Status\n- item 1\n- item 2',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('CommsPanelContent popup markdown rendering', () => {
  it('renders Markdown component in 1:1 message popup', () => {
    const comm = makeComm({ content: '**bold text** and `code`' });
    const { container } = render(
      <CommsPanelContent comms={[comm]} groupMessages={{}} />,
    );

    // Click the message to open the popup
    fireEvent.click(container.querySelector('.cursor-pointer')!);

    // The popup (fixed overlay) should use Markdown component (not <pre>)
    const popup = container.querySelector('.fixed');
    expect(popup).toBeTruthy();
    const markdownEl = popup!.querySelector('[data-testid="markdown-renderer"]');
    expect(markdownEl).toBeTruthy();
    expect(markdownEl!.textContent).toContain('**bold text** and `code`');
    expect(markdownEl!.getAttribute('data-monospace')).toBe('true');
  });

  it('renders Markdown component in group message popup', () => {
    const groupMsg = makeGroupMsg({ content: '## Heading\n- bullet point' });
    const { container } = render(
      <CommsPanelContent comms={[]} groupMessages={{ 'test-group': [groupMsg] }} />,
    );

    // Click the group message to open the popup
    fireEvent.click(container.querySelector('.cursor-pointer')!);

    // The popup (fixed overlay) should use Markdown component
    const popup = container.querySelector('.fixed');
    expect(popup).toBeTruthy();
    const markdownEl = popup!.querySelector('[data-testid="markdown-renderer"]');
    expect(markdownEl).toBeTruthy();
    expect(markdownEl!.textContent).toContain('## Heading');
    expect(markdownEl!.getAttribute('data-monospace')).toBe('true');
  });

  it('does not render <pre> tags for popup message content', () => {
    const comm = makeComm({ content: 'Some message content' });
    const { container } = render(
      <CommsPanelContent comms={[comm]} groupMessages={{}} />,
    );

    // Open the popup
    fireEvent.click(container.querySelector('.cursor-pointer')!);

    // The popup body should not contain a <pre> element
    const popup = container.querySelector('.fixed');
    expect(popup).toBeTruthy();
    const preElements = popup!.querySelectorAll('pre');
    expect(preElements.length).toBe(0);
  });

  it('still uses AgentReportBlock for [Agent Report] messages in popup', () => {
    const comm = makeComm({ content: '[Agent Report] some report data' });
    const { container } = render(
      <CommsPanelContent comms={[comm]} groupMessages={{}} />,
    );

    // Open the popup
    fireEvent.click(container.querySelector('.cursor-pointer')!);

    // The popup (fixed overlay) should use AgentReportBlock, not Markdown
    const popup = container.querySelector('.fixed');
    expect(popup).toBeTruthy();
    expect(popup!.querySelector('[data-testid="agent-report-block"]')).toBeTruthy();
    expect(popup!.querySelector('[data-testid="markdown-renderer"]')).toBeNull();
  });

  it('still uses AgentReportBlock for [Agent ACK] messages in popup', () => {
    const comm = makeComm({ content: '[Agent ACK] task acknowledged' });
    const { container } = render(
      <CommsPanelContent comms={[comm]} groupMessages={{}} />,
    );

    // Open the popup
    fireEvent.click(container.querySelector('.cursor-pointer')!);

    const popup = container.querySelector('.fixed');
    expect(popup).toBeTruthy();
    expect(popup!.querySelector('[data-testid="agent-report-block"]')).toBeTruthy();
    expect(popup!.querySelector('[data-testid="markdown-renderer"]')).toBeNull();
  });
});
