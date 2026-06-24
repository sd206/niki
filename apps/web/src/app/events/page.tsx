'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, Event, EventType, Task, EventPlanDraft, ExpenseCategory } from '@niki/shared';
import { EVENT_TEMPLATES, EXPENSE_CATEGORIES } from '@niki/shared';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, EmptyState, PageHeader } from '@/components/ui';
import { EventsIcon } from '@/components/icons';

/**
 * Single static route, same reason as /family and /tasks (apps/web uses
 * `output: 'export'`). Event "detail" is an inline expand within this list
 * rather than a separate /events/[id] route, since a dynamic segment isn't
 * feasible for arbitrary Firestore doc IDs under static export.
 *
 * Phase 4.B adds an "AI plan assist" action to the expanded view: calls
 * POST .../plan-assist (Gemini) and shows a draft checklist + budget the
 * user reviews and explicitly accepts — nothing is auto-created.
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

  const [planDraft, setPlanDraft] = useState<EventPlanDraft | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [addedChecklistTitles, setAddedChecklistTitles] = useState<Set<string>>(new Set());
  const [budgetAccepted, setBudgetAccepted] = useState(false);

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
      setPlanDraft(null);
      setAddedChecklistTitles(new Set());
      setBudgetAccepted(false);
      return;
    }
    setError(null);
    try {
      const result = await api.events.get(family.id, event.id);
      setExpandedId(event.id);
      setExpandedTasks(result.tasks);
      setPlanDraft(null);
      setAddedChecklistTitles(new Set());
      setBudgetAccepted(false);
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

  async function handlePlanAssist(event: Event) {
    if (!family) return;
    setPlanLoading(true);
    setError(null);
    try {
      const draft = await api.events.planAssist(family.id, event.id);
      setPlanDraft(draft);
      setAddedChecklistTitles(new Set());
      setBudgetAccepted(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI plan assist failed — is Vertex AI configured?');
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleAcceptChecklistItem(event: Event, item: { title: string; description?: string }) {
    if (!family) return;
    setError(null);
    try {
      await api.tasks.create(family.id, {
        title: item.title,
        description: item.description,
        eventId: event.id,
        priority: 'medium',
      });
      setAddedChecklistTitles((prev) => new Set(prev).add(item.title));
      const result = await api.events.get(family.id, event.id);
      setExpandedTasks(result.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add suggested task');
    }
  }

  /** Best-effort match of Gemini's free-text category onto our fixed ExpenseCategory enum. */
  function matchExpenseCategory(category: string): ExpenseCategory {
    const needle = category.toLowerCase();
    const match = EXPENSE_CATEGORIES.find((c) => needle.includes(c) || c.includes(needle));
    return match ?? 'other';
  }

  async function handleAcceptBudget(event: Event, items: EventPlanDraft['budget']) {
    if (!family || items.length === 0) return;
    setError(null);
    try {
      const categoryAllocations: Partial<Record<ExpenseCategory, number>> = {};
      for (const item of items) {
        const category = matchExpenseCategory(item.category);
        categoryAllocations[category] = (categoryAllocations[category] ?? 0) + item.estimatedAmount;
      }
      await api.budgets.create(family.id, {
        name: `${event.title} (AI suggested)`,
        period: 'event',
        eventId: event.id,
        categoryAllocations,
      });
      setBudgetAccepted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create budget from suggestions');
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
    <AppShell>
      <PageHeader module="events" icon={<EventsIcon size={22} />} title="Events" subtitle={family.name} />
      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</Card>
      )}

      {events.length === 0 && (
        <EmptyState module="events" icon={<EventsIcon size={32} />} title="No events yet" description="Plan a trip, a birthday, or any milestone below." />
      )}
      {events.map((ev) => (
          <Card key={ev.id}>
            <div style={{ cursor: 'pointer' }} onClick={() => toggleExpand(ev)}>
              <strong>{ev.title}</strong> <Badge module="events">{ev.type.replace('_', ' ')}</Badge>
              <p style={{ margin: '4px 0', fontSize: 13 }}>
                {ev.startDate}
                {ev.endDate && ` – ${ev.endDate}`}
              </p>
            </div>

            {expandedId === ev.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
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

                <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                  <h4>AI plan assist</h4>
                  <button onClick={() => handlePlanAssist(ev)} disabled={planLoading}>
                    {planLoading ? 'Thinking…' : 'Get checklist + budget suggestions'}
                  </button>

                  {planDraft && (
                    <div style={{ marginTop: 12 }}>
                      <strong>Suggested checklist</strong>
                      <ul>
                        {planDraft.checklist.map((item) => (
                          <li key={item.title} style={{ marginBottom: 4 }}>
                            {item.title}
                            {item.description && (
                              <span style={{ color: '#888' }}> — {item.description}</span>
                            )}{' '}
                            {addedChecklistTitles.has(item.title) ? (
                              <span style={{ color: 'green', fontSize: '0.85em' }}>Added</span>
                            ) : (
                              <button onClick={() => handleAcceptChecklistItem(ev, item)} style={{ fontSize: '0.85em' }}>
                                Add as task
                              </button>
                            )}
                          </li>
                        ))}
                        {planDraft.checklist.length === 0 && <li>No checklist suggestions.</li>}
                      </ul>

                      <strong>Suggested budget</strong>
                      <ul>
                        {planDraft.budget.map((item) => (
                          <li key={item.category}>
                            {item.category}: {item.estimatedAmount}
                            {item.notes && <span style={{ color: '#888' }}> — {item.notes}</span>}
                          </li>
                        ))}
                        {planDraft.budget.length === 0 && <li>No budget suggestions.</li>}
                      </ul>
                      {planDraft.budget.length > 0 && (
                        budgetAccepted ? (
                          <span style={{ color: 'green', fontSize: '0.85em' }}>Budget created</span>
                        ) : (
                          <button onClick={() => handleAcceptBudget(ev, planDraft.budget)} style={{ fontSize: '0.85em' }}>
                            Create event budget from these suggestions
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                <br />
                <button className="btn-danger" onClick={() => handleDelete(ev)} style={{ marginTop: 8 }}>
                  Delete event
                </button>
              </div>
            )}
          </Card>
        ))}

      <h3 style={{ marginTop: 32, marginBottom: 12 }}>New event</h3>
      <Card>
        <label>Title</label>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
          {EVENT_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>
            Start
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            End (optional)
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        <label>Description</label>
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !title || !startDate} onClick={handleCreate}>
          Add event
        </button>
      </Card>
    </AppShell>
  );
}
