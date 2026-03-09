// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SessionViewer } from '../SessionViewer';

const mockApiFetch = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

vi.mock('../../../utils/markdown', () => ({
  MarkdownContent: ({ text }: { text: string }) => <span>{text}</span>,
}));

const session = {
  leadId: 'lead-abc123',
  task: 'Implement auth module',
  startedAt: '2026-03-09T10:00:00Z',
  endedAt: '2026-03-09T12:30:00Z',
};

const mockMessages = [
  { id: 1, conversationId: 'c1', sender: 'user', content: 'Build the auth module', timestamp: '2026-03-09T10:01:00Z' },
  { id: 2, conversationId: 'c1', sender: 'agent', content: 'Starting implementation...', timestamp: '2026-03-09T10:02:00Z' },
  { id: 3, conversationId: 'c1', sender: 'system', content: '[System] Task DAG declared: 3 tasks', timestamp: '2026-03-09T10:03:00Z' },
];

describe('SessionViewer', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ messages: mockMessages });
  });

  it('renders read-only banner and session info', async () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    expect(screen.getByTestId('session-viewer')).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('Implement auth module')).toBeInTheDocument();
  });

  it('fetches messages on mount', async () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/agents/lead-abc123/messages?limit=1000');
    });
  });

  it('renders conversation messages', async () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('Build the auth module')).toBeInTheDocument();
    });
    expect(screen.getByText('Starting implementation...')).toBeInTheDocument();
    expect(screen.getByText('[System] Task DAG declared: 3 tasks')).toBeInTheDocument();
  });

  it('shows message count in banner', async () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText(/3 messages/)).toBeInTheDocument();
    });
  });

  it('shows disabled input placeholder', () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    expect(screen.getByText('This is a read-only view of a past session')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('session-viewer-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error on fetch failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    render(<SessionViewer session={session} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows empty state when no messages', async () => {
    mockApiFetch.mockResolvedValue({ messages: [] });
    render(<SessionViewer session={session} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('No messages recorded for this session')).toBeInTheDocument();
    });
  });

  it('shows lead ID prefix in header', () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    expect(screen.getByText(/lead-abc/)).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    render(<SessionViewer session={session} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
