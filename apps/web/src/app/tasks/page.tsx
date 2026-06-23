'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, Member, Task, TaskStatus, TaskPriority } from '@niki/shared';

/**
 * Single static route (no [id] segment) for the same reason /family is —
 * apps/web uses `output: 'export'`. Loads the signed-in user's own family
 * the same way, then lists/manages that family's tasks.
 */
export default function TasksPage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string | 'all'>('all');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [busy, setBusy] = useState(false);

  async function loadTasks(familyId: string) {
    const filter: { status?: TaskStatus; assignedTo?: string } = {};
    if (statusFilter !== 'all') filter.status = statusFilter;
    if (assigneeFilter !== 'all') filter.assignedTo = assigneeFilter;
    const result = await api.tasks.list(familyId, filter);
    setTasks(result);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await api.users.me();
        if (!profile.familyIds.length) {
          window.location.href = '/onboarding';
          return;
        }
        const familyId = profile.familyIds[0];
        const result = await api.families.get(familyId);
        setFamily(result.family);
        setMembers(result.members);
        await loadTasks(familyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load tasks');
      } finally {
        setLoadingData(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!family) return;
    loadTasks(family.id).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load tasks'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, assigneeFilter]);

  async function handleCreate() {
    if (!family) return;
    setBusy(true);
    setError(null);
    try {
      await api.tasks.create(family.id, {
        title,
        description: description || undefined,
        assignedTo: assignedTo || undefined,
        dueDate: dueDate || undefined,
        priority,
      });
      setTitle('');
      setDescription('');
      setAssignedTo('');
      setDueDate('');
      setPriority('medium');
      await loadTasks(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task');
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    if (!family) return;
    setError(null);
    try {
      await api.tasks.update(family.id, task.id, { status });
      await loadTasks(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update task');
    }
  }

  async function handleDelete(task: Task) {
    if (!family) return;
    setError(null);
    try {
      await api.tasks.remove(family.id, task.id);
      await loadTasks(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task');
    }
  }

  if (loading || loadingData) {
    return <div className="container">Loading…</div>;
  }
  if (!user) {
    return <div className="container">Sign in first.</div>;
  }
  if (!family) {
    return null;
  }

  const memberName = (uid?: string) => members.find((m) => m.uid === uid)?.displayName ?? '—';

  return (
    <div className="container">
      <h1>Tasks — {family.name}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}>
          <option value="all">All statuses</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="all">Everyone</option>
          {members.map((m) => (
            <option key={m.uid} value={m.uid}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {tasks.map((t) => (
          <li key={t.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <strong>{t.title}</strong> ({t.priority})
            {t.description && <p style={{ margin: '4px 0' }}>{t.description}</p>}
            <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#666' }}>
              Assigned to: {memberName(t.assignedTo)}
              {t.dueDate && ` · Due ${t.dueDate}`}
            </p>
            <select value={t.status} onChange={(e) => handleStatusChange(t, e.target.value as TaskStatus)}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
            <button onClick={() => handleDelete(t)} style={{ marginLeft: 8 }}>
              Delete
            </button>
          </li>
        ))}
        {tasks.length === 0 && <p>No tasks match this filter.</p>}
      </ul>

      <h3 style={{ marginTop: 32 }}>New task</h3>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <br />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ marginTop: 8, width: '100%', maxWidth: 400 }}
      />
      <br />
      <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={{ marginTop: 8 }}>
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.uid} value={m.uid}>
            {m.displayName}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        style={{ marginLeft: 8 }}
      />
      <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} style={{ marginLeft: 8 }}>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
      <br />
      <button className="btn-primary" disabled={busy || !title} onClick={handleCreate} style={{ marginTop: 8 }}>
        Add task
      </button>

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}
