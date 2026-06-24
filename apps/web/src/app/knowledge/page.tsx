'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, KnowledgeEntry, KnowledgeContentType, KnowledgeDigestResponse } from '@niki/shared';
import { KNOWLEDGE_CONTENT_TYPES } from '@niki/shared';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, EmptyState, PageHeader } from '@/components/ui';
import { KnowledgeIcon } from '@/components/icons';

/**
 * Single static route (apps/web uses `output: 'export'`), same reason as
 * /calendar, /finance, /vault — no dynamic [id] route, expand-in-place
 * instead. Phase 3.A. Search is the basic tag/title match the API does
 * in-memory; semantic search is Phase 4.A (/search). Phase 4.D adds
 * AI summarization here: a per-entry "Summarize" button and a digest panel
 * below — both stateless, generated on demand, never persisted.
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

  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  const [digest, setDigest] = useState<KnowledgeDigestResponse | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestTag, setDigestTag] = useState('');
  const [digestContentType, setDigestContentType] = useState<KnowledgeContentType | ''>('');

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

  async function handleSummarize(entry: KnowledgeEntry) {
    if (!family) return;
    setSummarizingId(entry.id);
    setError(null);
    try {
      const result = await api.knowledge.summarize(family.id, entry.id);
      setSummaries((s) => ({ ...s, [entry.id]: result.summary }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to summarize entry');
    } finally {
      setSummarizingId(null);
    }
  }

  async function handleDigest() {
    if (!family) return;
    setDigestLoading(true);
    setError(null);
    try {
      const result = await api.knowledge.digest(family.id, {
        tag: digestTag || undefined,
        contentType: digestContentType || undefined,
      });
      setDigest(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setDigestLoading(false);
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
      <PageHeader module="knowledge" icon={<KnowledgeIcon size={22} />} title="Knowledge" subtitle={family.name} />
      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</Card>
      )}

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Search title or tags…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}
        />
        <button type="submit" className="btn-secondary">Search</button>
        {q && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setQ('');
              loadEntries(family.id);
            }}
          >
            Clear
          </button>
        )}
      </form>

      <Card style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Knowledge digest</h3>
        <p style={{ fontSize: 13, margin: '4px 0 8px' }}>
          AI-generated overview of your knowledge base — leave both filters blank for the whole hub.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={digestContentType} onChange={(e) => setDigestContentType(e.target.value as KnowledgeContentType | '')}>
            <option value="">All types</option>
            {KNOWLEDGE_CONTENT_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="Tag (optional)"
            value={digestTag}
            onChange={(e) => setDigestTag(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={handleDigest} disabled={digestLoading}>
          {digestLoading ? 'Generating…' : 'Generate digest'}
        </button>

        {digest && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontStyle: 'italic' }}>{digest.summary}</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Based on {digest.entryCount} matching entr{digest.entryCount === 1 ? 'y' : 'ies'}.</p>
            {digest.highlights.length > 0 && (
              <ul style={{ paddingLeft: 16 }}>
                {digest.highlights.map((h, i) => (
                  <li key={i} style={{ fontSize: 13 }}>
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {entries.length === 0 ? (
        <EmptyState module="knowledge" icon={<KnowledgeIcon size={32} />} title="No knowledge entries yet" description="Add a recipe, plan, or reference note below." />
      ) : (
        entries.map((entry) =>
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
            <Card key={entry.id}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <div>
                  <strong>{entry.title}</strong>{' '}
                  <Badge module="knowledge">{entry.contentType}</Badge>
                </div>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>{expandedId === entry.id ? '▲' : '▼'}</span>
              </div>
              {entry.tags.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {entry.tags.map((t) => (
                    <Badge key={t} module="search">{t}</Badge>
                  ))}
                </div>
              )}
              {expandedId === entry.id && (
                <>
                  <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{entry.body}</p>
                  {summaries[entry.id] && (
                    <p style={{ fontStyle: 'italic', background: 'var(--color-bg)', borderRadius: 6, padding: 8 }}>
                      {summaries[entry.id]}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn-secondary" onClick={() => setEditingId(entry.id)}>Edit</button>
                    <button className="btn-secondary" onClick={() => handleSummarize(entry)} disabled={summarizingId === entry.id}>
                      {summarizingId === entry.id ? 'Summarizing…' : 'Summarize'}
                    </button>
                    <button
                      className="btn-danger"
                      onClick={async () => {
                        setError(null);
                        try {
                          await api.knowledge.remove(family.id, entry.id);
                          refresh();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to delete entry');
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </Card>
          ),
        )
      )}

      {!formOpen && (
        <button className="btn-primary" onClick={() => setFormOpen(true)}>
          + New entry
        </button>
      )}
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
    </AppShell>
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
    <Card style={{ maxWidth: 480 }}>
      <h3 style={{ marginTop: 0 }}>{entry ? 'Edit entry' : 'New entry'}</h3>
      <label>Title</label>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>Type</label>
      <select
        value={contentType}
        onChange={(e) => setContentType(e.target.value as KnowledgeContentType)}
      >
        {KNOWLEDGE_CONTENT_TYPES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label>Body</label>
      <textarea
        placeholder="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
      />
      <label>Tags</label>
      <input
        placeholder="Tags (comma separated)"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={busy || !title.trim()} onClick={handleSave}>
          Save
        </button>
        <button className="btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
