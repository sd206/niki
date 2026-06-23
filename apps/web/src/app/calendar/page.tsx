'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, CalendarEntry, CalendarEntryType } from '@niki/shared';
import { CALENDAR_ENTRY_TYPES } from '@niki/shared';

type View = 'month' | 'week' | 'day' | 'agenda';

/**
 * Single static route (apps/web uses `output: 'export'`), same reason as
 * /family, /tasks, /events. All four views (month/week/day/agenda) live in
 * this one page and just re-render the same fetched range differently —
 * per the explicit decision to ship all four now rather than a reduced MVP.
 *
 * Entries returned by GET /calendar are a merge of real CalendarEntry docs
 * and synthetic derived entries from Tasks (`task:{id}`) and Events
 * (`event:{id}`) — see apps/api/src/routes/calendar.ts. Synthetic entries
 * are read-only here (no edit/delete); only real entries can be edited.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
// Week starts Monday.
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSynthetic(entry: CalendarEntry): boolean {
  return entry.id.startsWith('task:') || entry.id.startsWith('event:');
}

export default function CalendarPage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(toISO(new Date()));
  const [formType, setFormType] = useState<CalendarEntryType>('reminder');
  const [busy, setBusy] = useState(false);

  // The fetched range — wider than what's visibly rendered for month view,
  // since the grid shows leading/trailing days from adjacent months too.
  const range = useMemo(() => {
    if (view === 'agenda') {
      return { from: toISO(anchor), to: toISO(addDays(anchor, 30)) };
    }
    if (view === 'day') {
      return { from: toISO(anchor), to: toISO(anchor) };
    }
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return { from: toISO(start), to: toISO(addDays(start, 6)) };
    }
    // month
    const gridStart = startOfWeek(startOfMonth(anchor));
    const gridEnd = addDays(startOfWeek(endOfMonth(anchor)), 6);
    return { from: toISO(gridStart), to: toISO(gridEnd) };
  }, [view, anchor]);

  async function loadEntries(familyId: string) {
    const result = await api.calendar.range(familyId, range.from, range.to);
    setEntries(result);
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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load family');
      } finally {
        setLoadingData(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!family) return;
    loadEntries(family.id).catch((e) =>
      setError(e instanceof Error ? e.message : 'Failed to load calendar'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, range.from, range.to]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [entries]);

  function openNewForm(date: string) {
    setEditingId(null);
    setFormTitle('');
    setFormDate(date);
    setFormType('reminder');
    setFormOpen(true);
  }

  function openEditForm(entry: CalendarEntry) {
    if (isSynthetic(entry)) return;
    setEditingId(entry.id);
    setFormTitle(entry.title);
    setFormDate(entry.date);
    setFormType(entry.type);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!family || !formTitle || !formDate) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await api.calendar.update(family.id, editingId, {
          title: formTitle,
          date: formDate,
          type: formType,
        });
      } else {
        await api.calendar.create(family.id, {
          title: formTitle,
          date: formDate,
          type: formType,
        });
      }
      setFormOpen(false);
      await loadEntries(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entry');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!family || !editingId) return;
    setBusy(true);
    setError(null);
    try {
      await api.calendar.remove(family.id, editingId);
      setFormOpen(false);
      await loadEntries(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete entry');
    } finally {
      setBusy(false);
    }
  }

  function navigate(step: number) {
    if (view === 'agenda') setAnchor((a) => addDays(a, step * 30));
    else if (view === 'day') setAnchor((a) => addDays(a, step));
    else if (view === 'week') setAnchor((a) => addDays(a, step * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + step, 1));
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
      <h1>Calendar — {family.name}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        {(['month', 'week', 'day', 'agenda'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              fontWeight: view === v ? 'bold' : 'normal',
              textTransform: 'capitalize',
            }}
          >
            {v}
          </button>
        ))}
        <span style={{ marginLeft: 16 }}>
          <button onClick={() => navigate(-1)}>← Prev</button>
          <button onClick={() => setAnchor(new Date())} style={{ marginLeft: 4 }}>
            Today
          </button>
          <button onClick={() => navigate(1)} style={{ marginLeft: 4 }}>
            Next →
          </button>
        </span>
        <button style={{ marginLeft: 16 }} onClick={() => openNewForm(toISO(anchor))}>
          + New entry
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {view === 'month' && (
          <MonthView
            anchor={anchor}
            entriesByDate={entriesByDate}
            onDayClick={openNewForm}
            onEntryClick={openEditForm}
          />
        )}
        {view === 'week' && (
          <WeekView
            anchor={anchor}
            entriesByDate={entriesByDate}
            onDayClick={openNewForm}
            onEntryClick={openEditForm}
          />
        )}
        {view === 'day' && (
          <DayView
            anchor={anchor}
            entriesByDate={entriesByDate}
            onDayClick={openNewForm}
            onEntryClick={openEditForm}
          />
        )}
        {view === 'agenda' && <AgendaView entries={entries} onEntryClick={openEditForm} />}
      </div>

      {formOpen && (
        <div
          style={{
            marginTop: 24,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 16,
            maxWidth: 360,
          }}
        >
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit entry' : 'New entry'}</h3>
          <input
            placeholder="Title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            style={{ width: '100%' }}
          />
          <br />
          <label style={{ marginTop: 8, display: 'inline-block' }}>
            Date{' '}
            <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          </label>
          <br />
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value as CalendarEntryType)}
            style={{ marginTop: 8 }}
          >
            {CALENDAR_ENTRY_TYPES.filter((t) => t !== 'task' && t !== 'event').map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <br />
          <button
            className="btn-primary"
            disabled={busy || !formTitle || !formDate}
            onClick={handleSave}
            style={{ marginTop: 12 }}
          >
            Save
          </button>
          {editingId && (
            <button
              disabled={busy}
              onClick={handleDelete}
              style={{ marginTop: 12, marginLeft: 8, color: 'crimson' }}
            >
              Delete
            </button>
          )}
          <button disabled={busy} onClick={() => setFormOpen(false)} style={{ marginTop: 12, marginLeft: 8 }}>
            Cancel
          </button>
        </div>
      )}

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}

function EntryChip({ entry, onClick }: { entry: CalendarEntry; onClick: (e: CalendarEntry) => void }) {
  const synthetic = isSynthetic(entry);
  return (
    <div
      onClick={() => onClick(entry)}
      title={synthetic ? `Derived from ${entry.type} — edit it on its own page` : entry.type}
      style={{
        fontSize: '0.75em',
        padding: '2px 4px',
        marginTop: 2,
        borderRadius: 4,
        background: synthetic ? '#eee' : '#dbe9ff',
        color: synthetic ? '#666' : '#1a3d7c',
        cursor: synthetic ? 'default' : 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {entry.title}
    </div>
  );
}

function MonthView({
  anchor,
  entriesByDate,
  onDayClick,
  onEntryClick,
}: {
  anchor: Date;
  entriesByDate: Map<string, CalendarEntry[]>;
  onDayClick: (date: string) => void;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(anchor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const currentMonth = anchor.getMonth();

  return (
    <div>
      <h3>
        {MONTH_LABELS[anchor.getMonth()]} {anchor.getFullYear()}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} style={{ fontWeight: 'bold', fontSize: '0.8em', padding: 4 }}>
            {w}
          </div>
        ))}
        {days.map((d) => {
          const iso = toISO(d);
          const dayEntries = entriesByDate.get(iso) ?? [];
          const inMonth = d.getMonth() === currentMonth;
          return (
            <div
              key={iso}
              onClick={() => onDayClick(iso)}
              style={{
                minHeight: 72,
                border: '1px solid #eee',
                padding: 4,
                cursor: 'pointer',
                background: inMonth ? 'white' : '#fafafa',
                color: inMonth ? 'black' : '#bbb',
              }}
            >
              <div style={{ fontSize: '0.8em' }}>{d.getDate()}</div>
              {dayEntries.slice(0, 3).map((e) => (
                <div key={e.id} onClick={(ev) => ev.stopPropagation()}>
                  <EntryChip entry={e} onClick={onEntryClick} />
                </div>
              ))}
              {dayEntries.length > 3 && (
                <div style={{ fontSize: '0.7em', color: '#888' }}>+{dayEntries.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  anchor,
  entriesByDate,
  onDayClick,
  onEntryClick,
}: {
  anchor: Date;
  entriesByDate: Map<string, CalendarEntry[]>;
  onDayClick: (date: string) => void;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
      {days.map((d) => {
        const iso = toISO(d);
        const dayEntries = entriesByDate.get(iso) ?? [];
        return (
          <div
            key={iso}
            onClick={() => onDayClick(iso)}
            style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, minHeight: 160, cursor: 'pointer' }}
          >
            <div style={{ fontWeight: 'bold', fontSize: '0.85em' }}>
              {WEEKDAY_LABELS[(d.getDay() + 6) % 7]} {d.getDate()}
            </div>
            {dayEntries.map((e) => (
              <div key={e.id} onClick={(ev) => ev.stopPropagation()}>
                <EntryChip entry={e} onClick={onEntryClick} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DayView({
  anchor,
  entriesByDate,
  onDayClick,
  onEntryClick,
}: {
  anchor: Date;
  entriesByDate: Map<string, CalendarEntry[]>;
  onDayClick: (date: string) => void;
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const iso = toISO(anchor);
  const dayEntries = entriesByDate.get(iso) ?? [];

  return (
    <div>
      <h3>
        {WEEKDAY_LABELS[(anchor.getDay() + 6) % 7]}, {MONTH_LABELS[anchor.getMonth()]} {anchor.getDate()}{' '}
        {anchor.getFullYear()}
      </h3>
      <div
        onClick={() => onDayClick(iso)}
        style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, minHeight: 120, cursor: 'pointer' }}
      >
        {dayEntries.length === 0 && <p style={{ color: '#888' }}>Nothing scheduled. Click to add an entry.</p>}
        {dayEntries.map((e) => (
          <div key={e.id} onClick={(ev) => ev.stopPropagation()} style={{ marginBottom: 4 }}>
            <EntryChip entry={e} onClick={onEntryClick} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaView({
  entries,
  onEntryClick,
}: {
  entries: CalendarEntry[];
  onEntryClick: (entry: CalendarEntry) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  return (
    <div>
      {grouped.length === 0 && <p style={{ color: '#888' }}>Nothing in the next 30 days.</p>}
      {grouped.map(([date, dayEntries]) => {
        const d = fromISO(date);
        return (
          <div key={date} style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '4px 0' }}>
              {WEEKDAY_LABELS[(d.getDay() + 6) % 7]}, {MONTH_LABELS[d.getMonth()]} {d.getDate()}
            </h4>
            {dayEntries.map((e) => (
              <div
                key={e.id}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  cursor: isSynthetic(e) ? 'default' : 'pointer',
                }}
                onClick={() => onEntryClick(e)}
              >
                <span>{e.title}</span>
                <span style={{ fontSize: '0.8em', color: '#888' }}>{e.type}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
