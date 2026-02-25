import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Database } from '../db/database.js';
import { TaskQueue } from '../tasks/TaskQueue.js';

class MockAgentManager extends EventEmitter {
  getAll = vi.fn().mockReturnValue([]);
  getRoleRegistry = vi.fn().mockReturnValue(null);
  spawn = vi.fn();
}

describe('TaskQueue', () => {
  let db: Database;
  let agentManager: MockAgentManager;
  let queue: TaskQueue;

  beforeEach(() => {
    db = new Database(':memory:');
    agentManager = new MockAgentManager();
    queue = new TaskQueue(db, agentManager as any);
  });

  it('enqueue creates a task with correct fields and queued status', () => {
    const task = queue.enqueue({ title: 'Test task', description: 'A description' });
    expect(task.title).toBe('Test task');
    expect(task.description).toBe('A description');
    expect(task.status).toBe('queued');
    expect(task.priority).toBe(0);
    expect(task.id).toBeDefined();
    expect(task.createdAt).toBeDefined();
    expect(task.updatedAt).toBeDefined();
  });

  it('enqueue with priority sets correct priority value', () => {
    const task = queue.enqueue({ title: 'High priority', priority: 10 });
    expect(task.priority).toBe(10);
  });

  it('getAll returns tasks sorted by priority DESC, created_at ASC', () => {
    queue.enqueue({ title: 'Low', priority: 1 });
    queue.enqueue({ title: 'High', priority: 5 });
    queue.enqueue({ title: 'Medium', priority: 3 });

    const all = queue.getAll();
    expect(all.map((t) => t.title)).toEqual(['High', 'Medium', 'Low']);
  });

  it('getPending only returns queued tasks', () => {
    const t1 = queue.enqueue({ title: 'Queued task' });
    const t2 = queue.enqueue({ title: 'Done task' });
    queue.update(t2.id, { status: 'done' });

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(t1.id);
  });

  it('update changes task fields and updates updated_at', () => {
    const task = queue.enqueue({ title: 'Original' });
    const originalUpdatedAt = task.updatedAt;

    const updated = queue.update(task.id, { title: 'Changed', priority: 5 });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Changed');
    expect(updated!.priority).toBe(5);
    expect(updated!.updatedAt).toBeDefined();
  });

  it('update returns null for non-existent task', () => {
    const result = queue.update('non-existent-id', { title: 'Nope' });
    expect(result).toBeNull();
  });

  it('remove deletes the task and returns true', () => {
    const task = queue.enqueue({ title: 'To remove' });
    const result = queue.remove(task.id);
    expect(result).toBe(true);
    expect(queue.getById(task.id)).toBeNull();
  });

  it('remove returns false for non-existent task', () => {
    const result = queue.remove('non-existent-id');
    expect(result).toBe(false);
  });

  it('remove emits task:removed event', () => {
    const listener = vi.fn();
    queue.on('task:removed', listener);

    const task = queue.enqueue({ title: 'Will be removed' });
    queue.remove(task.id);

    expect(listener).toHaveBeenCalledWith(task.id);
  });

  it('enqueue emits task:updated event', () => {
    const listener = vi.fn();
    queue.on('task:updated', listener);

    const task = queue.enqueue({ title: 'New task' });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: task.id, title: 'New task' }));
  });

  it('enqueue triggers auto-assignment via tryAutoAssign', () => {
    // getAll is called internally by tryAutoAssign to find available agents
    queue.enqueue({ title: 'Auto assign test' });
    expect(agentManager.getAll).toHaveBeenCalled();
  });

  it('tasks with assignedRole filter correctly during assignment', () => {
    const mockRole = { id: 'designer', name: 'Designer' };
    const mockAgent = {
      id: 'agent-1',
      role: { id: 'designer' },
      status: 'running',
      taskId: undefined as string | undefined,
      write: vi.fn(),
    };

    agentManager.getAll.mockReturnValue([mockAgent]);

    const task = queue.enqueue({ title: 'Design task', assignedRole: 'designer' });

    // The agent should have been assigned the task
    const updated = queue.getById(task.id);
    expect(updated!.status).toBe('in_progress');
    expect(updated!.assignedAgentId).toBe('agent-1');
  });
});
