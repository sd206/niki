'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, VaultItem, VaultCategory, DriveConnection } from '@niki/shared';
import { VAULT_CATEGORIES } from '@niki/shared';

/**
 * Minimal ambient typing for the Google API loader + Picker — there's no
 * @types package for these pulled in, and pulling the full gapi type
 * definitions in just for this one page isn't worth it. See
 * https://developers.google.com/drive/picker/guides/overview for the real
 * shapes; we only touch a handful of fields below.
 */
declare global {
  interface Window {
    gapi?: { load: (api: string, callback: () => void) => void };
    google?: { picker: any };
  }
}

const GOOGLE_API_SCRIPT_SRC = 'https://apis.google.com/js/api.js';
const DEVELOPER_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

function loadGoogleApiScript(): Promise<void> {
  if (window.gapi) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GOOGLE_API_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google API script'));
    document.body.appendChild(script);
  });
}

function loadPicker(): Promise<void> {
  return new Promise((resolve) => {
    window.gapi!.load('picker', () => resolve());
  });
}

/**
 * Single static route, same reason as /family, /tasks, /events (apps/web
 * uses `output: 'export'`).
 */
export default function VaultPage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [drive, setDrive] = useState<DriveConnection | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VaultCategory | ''>('');
  const [pickerCategory, setPickerCategory] = useState<VaultCategory>('custom');
  const [busy, setBusy] = useState(false);

  async function loadItems(familyId: string, category?: VaultCategory) {
    const result = await api.vault.list(familyId, category || undefined);
    setItems(result);
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
        const [familyResult, driveStatus] = await Promise.all([
          api.families.get(familyId),
          api.drive.status(),
        ]);
        setFamily(familyResult.family);
        setDrive(driveStatus);
        await loadItems(familyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load vault');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user]);

  async function handleFilterChange(category: VaultCategory | '') {
    if (!family) return;
    setFilter(category);
    setError(null);
    try {
      await loadItems(family.id, category || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to filter vault');
    }
  }

  async function handleAddFromDrive() {
    if (!family) return;
    if (!DEVELOPER_KEY) {
      setError('Vault is missing its Google API key configuration (NEXT_PUBLIC_GOOGLE_API_KEY).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { accessToken } = await api.drive.pickerToken();
      await loadGoogleApiScript();
      await loadPicker();

      const view = new window.google!.picker.DocsView().setIncludeFolders(true);
      const picker = new window.google!.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(DEVELOPER_KEY)
        .setCallback(async (data: any) => {
          if (data.action !== window.google!.picker.Action.PICKED) {
            if (data.action === window.google!.picker.Action.CANCEL) setBusy(false);
            return;
          }
          const doc = data.docs[0];
          try {
            await api.vault.create(family.id, {
              name: doc.name,
              driveFileId: doc.id,
              driveFileUrl: doc.url,
              category: pickerCategory,
            });
            await loadItems(family.id, filter || undefined);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save vault item');
          } finally {
            setBusy(false);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Failed to open Drive picker');
    }
  }

  async function handleDelete(item: VaultItem) {
    if (!family) return;
    setError(null);
    try {
      await api.vault.remove(family.id, item.id);
      await loadItems(family.id, filter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete vault item');
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

  const driveConnected = drive?.status === 'connected';

  return (
    <div className="container">
      <h1>Vault — {family.name}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {!driveConnected && (
        <p>
          Connect Google Drive in <a href="/settings">Settings</a> before adding vault items.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <label>
          Filter by category{' '}
          <select value={filter} onChange={(e) => handleFilterChange(e.target.value as VaultCategory | '')}>
            <option value="">All</option>
            {VAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <a href={item.driveFileUrl} target="_blank" rel="noreferrer">
              <strong>{item.name}</strong>
            </a>
            <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#666' }}>{item.category}</p>
            <button onClick={() => handleDelete(item)} style={{ color: 'crimson' }}>
              Remove
            </button>
          </li>
        ))}
        {items.length === 0 && <p>No vault items yet.</p>}
      </ul>

      <h3 style={{ marginTop: 32 }}>Add from Drive</h3>
      <label>
        Category{' '}
        <select value={pickerCategory} onChange={(e) => setPickerCategory(e.target.value as VaultCategory)}>
          {VAULT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <br />
      <button
        className="btn-primary"
        disabled={busy || !driveConnected}
        onClick={handleAddFromDrive}
        style={{ marginTop: 8 }}
      >
        {busy ? 'Opening Drive…' : 'Add from Drive'}
      </button>

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}
