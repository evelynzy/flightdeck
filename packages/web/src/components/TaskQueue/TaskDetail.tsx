import { useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { Task, TaskStatus } from '../../types';

interface Props {
  task: Task;
  api: any;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; color: string; label: string }[] = [
  { value: 'queued', color: 'bg-gray-500', label: 'Queued' },
  { value: 'assigned', color: 'bg-blue-500', label: 'Assigned' },
  { value: 'in_progress', color: 'bg-yellow-500', label: 'In Progress' },
  { value: 'review', color: 'bg-purple-500', label: 'Review' },
  { value: 'done', color: 'bg-green-500', label: 'Done' },
  { value: 'failed', color: 'bg-red-500', label: 'Failed' },
];

const PRIORITY_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'High',
  2: 'Urgent',
};

export function TaskDetail({ task, api, onClose }: Props) {
  const { roles, agents } = useAppStore();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [editingTitle, setEditingTitle] = useState(false);

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === task.status) ?? STATUS_OPTIONS[0];
  const role = roles.find((r) => r.id === task.assignedRole);
  const agent = agents.find((a) => a.id === task.assignedAgentId);

  const handleStatusChange = async (newStatus: TaskStatus) => {
    await api.updateTask(task.id, { status: newStatus });
  };

  const handleTitleBlur = async () => {
    setEditingTitle(false);
    if (title.trim() && title !== task.title) {
      await api.updateTask(task.id, { title: title.trim() });
    } else {
      setTitle(task.title);
    }
  };

  const handleDescriptionBlur = async () => {
    if (description !== task.description) {
      await api.updateTask(task.id, { description });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-raised border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTitleBlur(); }}
                className="w-full bg-surface border border-gray-600 rounded px-2 py-1 text-lg font-semibold focus:outline-none focus:border-accent"
              />
            ) : (
              <h2
                className="text-lg font-semibold cursor-text truncate"
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                {task.title}
              </h2>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Status */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Status</label>
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            className="bg-surface border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <span className={`inline-block w-2 h-2 rounded-full ml-2 align-middle ${currentStatus.color}`} />
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            rows={4}
            placeholder="No description"
            className="w-full bg-surface border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
          />
        </div>

        {/* Priority */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Priority</label>
            <span className="text-sm">{PRIORITY_LABELS[task.priority] ?? `P${task.priority}`}</span>
          </div>

          {/* Assigned Role */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Assigned Role</label>
            <span className="text-sm">
              {role ? `${role.icon} ${role.name}` : <span className="text-gray-500">None</span>}
            </span>
          </div>
        </div>

        {/* Assigned Agent */}
        {task.assignedAgentId && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Assigned Agent</label>
            <span className="text-sm">
              {agent ? (
                <>{agent.role.icon} <span className="font-mono text-xs text-gray-400">{task.assignedAgentId}</span></>
              ) : (
                <span className="font-mono text-xs text-gray-400">{task.assignedAgentId}</span>
              )}
            </span>
          </div>
        )}

        {/* Timestamps */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-700">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Created</label>
            <span className="text-xs text-gray-400">{new Date(task.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Updated</label>
            <span className="text-xs text-gray-400">{new Date(task.updatedAt).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
