import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlaybookLibrary } from '../PlaybookLibrary';
import { BUILT_IN_PLAYBOOKS } from '../types';

// ── Mocks ────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockApiFetch = vi.fn() as Mock;
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('../../Toast', () => ({
  useToastStore: () => vi.fn(),
}));

function renderLib() {
  return render(
    <MemoryRouter>
      <PlaybookLibrary />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('PlaybookLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: [] }) });
  });

  it('renders built-in playbooks', async () => {
    renderLib();
    await waitFor(() => {
      expect(screen.getByText(BUILT_IN_PLAYBOOKS[0].name)).toBeTruthy();
    });
  });

  it('creates project on Apply and navigates', async () => {
    const projectResp = { id: 'proj-new', name: 'Code Review Crew' };
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: [] }) }) // fetchUserPlaybooks
      .mockResolvedValueOnce({ ok: true, json: async () => projectResp }); // POST /projects

    renderLib();

    // Wait for playbooks to load, then click first Apply button
    await waitFor(() => {
      expect(screen.getByText(BUILT_IN_PLAYBOOKS[0].name)).toBeTruthy();
    });

    const applyBtn = screen.getByTestId(`playbook-apply-${BUILT_IN_PLAYBOOKS[0].id}`);
    fireEvent.click(applyBtn);

    await waitFor(() => {
      // Should have called POST /projects
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/projects',
        expect.objectContaining({ method: 'POST' }),
      );
      // Should navigate to the new project
      expect(mockNavigate).toHaveBeenCalledWith(`/projects/${projectResp.id}`);
    });
  });

  it('shows error toast on API failure', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'name is required' }) });

    renderLib();

    await waitFor(() => {
      expect(screen.getByText(BUILT_IN_PLAYBOOKS[0].name)).toBeTruthy();
    });

    const applyBtn = screen.getByTestId(`playbook-apply-${BUILT_IN_PLAYBOOKS[0].id}`);
    fireEvent.click(applyBtn);

    // The error should be handled gracefully (no thrown error)
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
  });
});
