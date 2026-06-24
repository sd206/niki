'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, Member, Task, TaskStatus, TaskPriority } from '@niki/shared';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, EmptyState, PageHeader } from '@/components/ui';
import { TasksIcon, PlusIcon } from '@/components/icons';

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
    <AppShell>
      <PageHeader module="tasks" icon={<TasksIcon size={22} />} title="Tasks" subtitle={family.name} />
      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</Card>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')} style={{ marginBottom: 0 }}>
          <option value="all">All statuses</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ marginBottom: 0 }}>
          <option value="all">Everyone</option>
          {members.map((m) => (
            <option key={m.uid} value={m.uid}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          module="tasks"
          icon={<TasksIcon size={32} />}
          title="No tasks match this filter"
          description="Add a task below, or clear the filters above."
        />
      ) : (
        tasks.map((t) => (
          <Card key={t.id}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{t.title}</strong>{' '}
                <Badge module="tasks">{t.priority}</Badge>
                {t.description && <p style={{ margin: '4px 0' }}>{t.description}</p>}
                <p style={{ margin: '4px 0', fontSize: 13 }}>
                  Assigned to: {memberName(t.assignedTo)}
                  {t.dueDate && ` · Due ${t.dueDate}`}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <select value={t.status} onChange={(e) => handleStatusChange(t, e.target.value as TaskStatus)} style={{ marginBottom: 0, width: 'auto' }}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
              <button className="btn-danger" onClick={() => handleDelete(t)}>
                Delete
              </button>
            </div>
          </Card>
        ))
      )}

      <h3 style={{ marginTop: 32, marginBottom: 12 }}>New task</h3>
      <Card>
        <label>Title</label>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description</label>
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.displayName}
              </option>
            ))}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <button className="btn-primary" disabled={busy || !title} onClick={handleCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PlusIcon size={15} />
          Add task
        </button>
      </Card>
    </AppShell>
  );
}
