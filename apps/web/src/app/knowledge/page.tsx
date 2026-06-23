'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, KnowledgeEntry, KnowledgeContentType } from '@niki/shared';
import { KNOWLEDGE_CONTENT_TYPES } from '@niki/shared';

/**
 * Single static route (apps/web uses `output: 'export'`), same reason as
 * /calendar, /finance, /vault — no dynamic [id] route, expand-in-place
 * instead. Phase 3.A. Search is the basic tag/title match the API does
 * in-memory; AI-powered semantic search is deferred to Phase 4.D.
 */
export default function KnowledgePage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [q, setQ] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  async function loadEntries(familyId: string, query?: string) {
    const result = await api.knowledge.list(familyId, query ? { q: query } : undefined);
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
        await loadEntries(familyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load knowledge entries');
      } finally {
        setLoadingData(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!family) return;
    await loadEntries(family.id, q || undefined);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!family) return;
    setError(null);
    try {
      await loadEntries(family.id, q || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
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
      <h1>Knowledge — {family.name}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={handleSearch} style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <input
          placeholder="Search title or tags…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, maxWidth: 320 }}
        />
        <button type="submit">Search</button>
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              loadEntries(family.id);
            }}
          >
            Clear
          </button>
        )}
      </form>

      <div style={{ marginTop: 16 }}>
        {entries.length === 0 && <p>No knowledge entries yet.</p>}
        {entries.map((entry) =>
          editingId === entry.id ? (
            <EntryForm
              key={entry.id}
              familyId={family.id}
              entry={entry}
              onDone={() => {
                setEditingId(null);
                refresh();
              }}
              onCancel={() => setEditingId(null)}
              setError={setError}
            />
          ) : (
            <div key={entry.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <div>
                  <strong>{entry.title}</strong>{' '}
                  <span style={{ color: '#888', fontSize: '0.85em' }}>({entry.contentType})</span>
                </div>
                <span style={{ color: '#888', fontSize: '0.85em' }}>{expandedId === entry.id ? '▲' : '▼'}</span>
              </div>
              {entry.tags.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {entry.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-block',
                        background: '#eee',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: '0.8em',
                        marginRight: 4,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {expandedId === entry.id && (
                <>
                  <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{entry.body}</p>
                  <button onClick={() => setEditingId(entry.id)}>Edit</button>
                  <button
                    onClick={async () => {
                      setError(null);
                      try {
                        await api.knowledge.remove(family.id, entry.id);
                        refresh();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to delete entry');
                      }
                    }}
                    style={{ marginLeft: 8, color: 'crimson' }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ),
        )}
      </div>

      {!formOpen && <button onClick={() => setFormOpen(true)}>+ New entry</button>}
      {formOpen && (
        <EntryForm
          familyId={family.id}
          onDone={() => {
            setFormOpen(false);
            refresh();
          }}
          onCancel={() => setFormOpen(false)}
          setError={setError}
        />
      )}

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}

function EntryForm({
  familyId,
  entry,
  onDone,
  onCancel,
  setError,
}: {
  familyId: string;
  entry?: KnowledgeEntry;
  onDone: () => void;
  onCancel: () => void;
  setError: (e: string | null) => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [contentType, setContentType] = useState<KnowledgeContentType>(entry?.contentType ?? 'reference');
  const [body, setBody] = useState(entry?.body ?? '');
  const [tagsInput, setTagsInput] = useState(entry?.tags.join(', ') ?? '');
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      if (entry) {
        await api.knowledge.update(familyId, entry.id, { title, contentType, body, tags });
      } else {
        await api.knowledge.create(familyId, { title, contentType, body, tags });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save knowledge entry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, maxWidth: 480, marginBottom: 8 }}>
      <h3 style={{ marginTop: 0 }}>{entry ? 'Edit entry' : 'New entry'}</h3>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} />
      <br />
      <select
        value={contentType}
        onChange={(e) => setContentType(e.target.value as KnowledgeContentType)}
        style={{ marginTop: 8 }}
      >
        {KNOWLEDGE_CONTENT_TYPES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <br />
      <textarea
        placeholder="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        style={{ marginTop: 8, width: '100%' }}
      />
      <br />
      <input
        placeholder="Tags (comma separated)"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        style={{ marginTop: 8, width: '100%' }}
      />
      <br />
      <button className="btn-primary" disabled={busy || !title.trim()} onClick={handleSave} style={{ marginTop: 12 }}>
        Save
      </button>
      <button disabled={busy} onClick={onCancel} style={{ marginTop: 12, marginLeft: 8 }}>
        Cancel
      </button>
    </div>
  );
}
