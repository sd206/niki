'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, SearchResult } from '@niki/shared';

/**
 * Single static route (apps/web uses `output: 'export'`), same reason as
 * /knowledge, /memories. Phase 4.A — semantic search over Knowledge Hub
 * entries and Tasks via Vertex AI Vector Search (see
 * apps/api/src/routes/search.ts). If that infra isn't configured yet in
 * this environment, the API returns an empty result set rather than an
 * error, so this page shows a "search isn't set up yet" hint instead of a
 * raw failure.
 */
export default function SearchPage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await api.users.me();
        if (!profile.familyIds.length) {
          window.location.href = '/onboarding';
          return;
        }
        const result = await api.families.get(profile.familyIds[0]);
        setFamily(result.family);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load family');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!family || !q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const response = await api.search.query(family.id, q.trim());
      setResults(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
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
      <h1>Search — {family.name}</h1>
      <p style={{ color: '#666', fontSize: '0.9em' }}>
        Searches Knowledge Hub entries and Tasks by meaning, not just keywords.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={handleSearch} style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <input
          placeholder="What are you looking for?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, maxWidth: 400 }}
        />
        <button type="submit" disabled={searching || !q.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div style={{ marginTop: 24 }}>
        {results === null && <p style={{ color: '#888' }}>Results will appear here.</p>}
        {results !== null && results.length === 0 && (
          <p>
            No results. If this is your first search, the AI search index may not be configured yet for this
            environment — see PHASES.md's Phase 4 setup notes.
          </p>
        )}
        {results?.map((r) => (
          <div key={`${r.type}:${r.id}`} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{r.title}</strong>
              <span style={{ color: '#888', fontSize: '0.85em' }}>{r.type}</span>
            </div>
            {r.snippet && <p style={{ margin: '4px 0', color: '#555' }}>{r.snippet}</p>}
            <a href={r.type === 'knowledge' ? '/knowledge' : '/tasks'} style={{ fontSize: '0.85em' }}>
              Open in {r.type === 'knowledge' ? 'Knowledge' : 'Tasks'}
            </a>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}
