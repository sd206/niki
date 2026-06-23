'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, Event, EventType, Task } from '@niki/shared';
import { EVENT_TEMPLATES } from '@niki/shared';

/**
 * Single static route, same reason as /family and /tasks (apps/web uses
 * `output: 'export'`). Event "detail" is an inline expand within this list
 * rather than a separate /events/[id] route, since a dynamic segment isn't
 * feasible for arbitrary Firestore doc IDs under static export.
 */
export default function EventsPage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('custom');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadEvents(familyId: string) {
    const result = await api.events.list(familyId);
    setEvents(result);
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
        await loadEvents(familyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load events');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user]);

  async function handleCreate() {
    if (!family) return;
    setBusy(true);
    setError(null);
    try {
      await api.events.create(family.id, {
        title,
        type,
        startDate,
        endDate: endDate || undefined,
        description: description || undefined,
      });
      setTitle('');
      setType('custom');
      setStartDate('');
      setEndDate('');
      setDescription('');
      await loadEvents(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create event');
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(event: Event) {
    if (!family) return;
    if (expandedId === event.id) {
      setExpandedId(null);
      setExpandedTasks([]);
      return;
    }
    setError(null);
    try {
      const result = await api.events.get(family.id, event.id);
      setExpandedId(event.id);
      setExpandedTasks(result.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load event details');
    }
  }

  async function handleAddTaskToEvent(event: Event) {
    if (!family || !newTaskTitle) return;
    setError(null);
    try {
      await api.tasks.create(family.id, { title: newTaskTitle, eventId: event.id, priority: 'medium' });
      setNewTaskTitle('');
      const result = await api.events.get(family.id, event.id);
      setExpandedTasks(result.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add task');
    }
  }

  async function handleDelete(event: Event) {
    if (!family) return;
    setError(null);
    try {
      await api.events.remove(family.id, event.id);
      if (expandedId === event.id) setExpandedId(null);
      await loadEvents(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete event');
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

  return (
    <div className="container">
      <h1>Events — {family.name}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {events.map((ev) => (
          <li key={ev.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ cursor: 'pointer' }} onClick={() => toggleExpand(ev)}>
              <strong>{ev.title}</strong> ({ev.type})
              <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#666' }}>
                {ev.startDate}
                {ev.endDate && ` – ${ev.endDate}`}
              </p>
            </div>

            {expandedId === ev.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
                {ev.description && <p>{ev.description}</p>}
                <h4>Linked tasks</h4>
                <ul>
                  {expandedTasks.map((t) => (
                    <li key={t.id}>
                      {t.title} — {t.status}
                    </li>
                  ))}
                  {expandedTasks.length === 0 && <li>No tasks linked yet.</li>}
                </ul>
                <input
                  placeholder="New task for this event"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                />
                <button onClick={() => handleAddTaskToEvent(ev)} disabled={!newTaskTitle} style={{ marginLeft: 8 }}>
                  Add task
                </button>
                <br />
                <button onClick={() => handleDelete(ev)} style={{ marginTop: 8, color: 'crimson' }}>
                  Delete event
                </button>
              </div>
            )}
          </li>
        ))}
        {events.length === 0 && <p>No events yet.</p>}
      </ul>

      <h3 style={{ marginTop: 32 }}>New event</h3>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <br />
      <select value={type} onChange={(e) => setType(e.target.value as EventType)} style={{ marginTop: 8 }}>
        {EVENT_TEMPLATES.map((t) => (
          <option key={t} value={t}>
            {t.replace('_', ' ')}
          </option>
        ))}
      </select>
      <br />
      <label style={{ marginTop: 8, display: 'inline-block' }}>
        Start <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label style={{ marginLeft: 8 }}>
        End (optional) <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <br />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ marginTop: 8, width: '100%', maxWidth: 400 }}
      />
      <br />
      <button
        className="btn-primary"
        disabled={busy || !title || !startDate}
        onClick={handleCreate}
        style={{ marginTop: 8 }}
      >
        Add event
      </button>

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}
