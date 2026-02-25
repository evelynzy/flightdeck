import { test, expect } from '@playwright/test';

test.describe('Error States & Edge Cases', () => {
  test.afterEach(async ({ page }) => {
    const agents = await (await page.request.get('/api/agents')).json();
    for (const agent of agents) {
      await page.request.delete(`/api/agents/${agent.id}`);
    }
    const tasks = await (await page.request.get('/api/tasks')).json();
    for (const task of tasks) {
      await page.request.delete(`/api/tasks/${task.id}`);
    }
  });

  test('spawning agent with invalid role returns 400', async ({ page }) => {
    const res = await page.request.post('/api/agents', {
      data: { roleId: 'nonexistent-role' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unknown role');
  });

  test('killing non-existent agent returns gracefully', async ({ page }) => {
    const res = await page.request.delete('/api/agents/fake-agent-id-12345');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('sending input to non-existent agent returns 404', async ({ page }) => {
    const res = await page.request.post('/api/agents/fake-id/input', {
      data: { text: 'hello' },
    });
    expect(res.status()).toBe(404);
  });

  test('updating non-existent task returns 404', async ({ page }) => {
    const res = await page.request.patch('/api/tasks/fake-task-id', {
      data: { status: 'done' },
    });
    expect(res.status()).toBe(404);
  });

  test('deleting non-existent task returns ok: false', async ({ page }) => {
    const res = await page.request.delete('/api/tasks/fake-task-id');
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('cannot delete built-in roles', async ({ page }) => {
    const res = await page.request.delete('/api/roles/developer');
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('lock release by wrong agent fails', async ({ page }) => {
    // Agent 1 acquires lock
    await page.request.post('/api/coordination/locks', {
      data: { agentId: 'owner-agent', filePath: 'locked.ts', reason: 'mine' },
    });

    // Agent 2 tries to release it
    await page.request.delete(
      `/api/coordination/locks/${encodeURIComponent('locked.ts')}?agentId=other-agent`
    );
    // Lock should still be held by original owner
    const locks = await (await page.request.get('/api/coordination/locks')).json();
    const lock = locks.find((l: any) => l.filePath === 'locked.ts');
    expect(lock).toBeTruthy();
    expect(lock.agentId).toBe('owner-agent');

    // Cleanup
    await page.request.delete(`/api/coordination/locks/${encodeURIComponent('locked.ts')}?agentId=owner-agent`);
  });

  test('double-creating same lock by same agent refreshes TTL', async ({ page }) => {
    await page.request.post('/api/coordination/locks', {
      data: { agentId: 'agent-1', filePath: 'refresh.ts', reason: 'first' },
    });

    // Same agent, same file — should succeed (refresh)
    const res = await page.request.post('/api/coordination/locks', {
      data: { agentId: 'agent-1', filePath: 'refresh.ts', reason: 'refreshed' },
    });
    const body = await res.json();
    expect(body.ok).toBeTruthy();

    // Cleanup
    await page.request.delete(`/api/coordination/locks/${encodeURIComponent('refresh.ts')}?agentId=agent-1`);
  });

  test('config update persists and returns updated values', async ({ page }) => {
    const original = await (await page.request.get('/api/config')).json();

    const res = await page.request.patch('/api/config', {
      data: { maxConcurrentAgents: 15 },
    });
    const updated = await res.json();
    expect(updated.maxConcurrentAgents).toBe(15);

    // Restore
    await page.request.patch('/api/config', {
      data: { maxConcurrentAgents: original.maxConcurrentAgents },
    });
  });

  test('health endpoint always returns ok', async ({ page }) => {
    const res = await page.request.get('http://localhost:3001/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.agents).toBe('number');
    expect(typeof body.queuedTasks).toBe('number');
  });

  test('creating task with empty title still works via API', async ({ page }) => {
    const res = await page.request.post('/api/tasks', {
      data: { title: '' },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('permission endpoint for non-existent agent returns 404', async ({ page }) => {
    const res = await page.request.post('/api/agents/fake-id/permission', {
      data: { approved: true },
    });
    expect(res.status()).toBe(404);
  });

  test('restart non-existent agent returns 404', async ({ page }) => {
    const res = await page.request.post('/api/agents/fake-id/restart');
    expect(res.status()).toBe(404);
  });
});
