'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, Memory, MemoryType, DriveConnection } from '@niki/shared';
import { MEMORY_TYPES } from '@niki/shared';

/**
 * Minimal ambient typing for the Google API loader + Picker, same as
 * vault/page.tsx — no @types package pulled in for this, see
 * https://developers.google.com/drive/picker/guides/overview.
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
 * Single static route (apps/web uses `output: 'export'`), same reason as
 * /vault, /calendar, /finance, /knowledge. Phase 3.B — timeline view +
 * add-memory flow. Attaching a Drive file is optional (a 'story' or
 * 'milestone' memory can be pure text), reusing the same Picker pattern as
 * Vault — Niki never touches file bytes.
 */
export default function MemoriesPage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [drive, setDrive] = useState<DriveConnection | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  async function loadMemories(familyId: string) {
    const result = await api.memories.list(familyId);
    setMemories(result);
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
        await loadMemories(familyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load memories');
      } finally {
        setLoadingData(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!family) return;
    await loadMemories(family.id);
  }

  async function handleDelete(memoryId: string) {
    if (!family) return;
    setError(null);
    try {
      await api.memories.remove(family.id, memoryId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete memory');
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
      <h1>Memories — {family.name}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ marginTop: 16 }}>
        {memories.length === 0 && <p>No memories yet.</p>}
        {memories.map((m) => (
          <div key={m.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{m.title}</strong>
              <span style={{ color: '#888', fontSize: '0.85em' }}>
                {m.date} · {m.type}
              </span>
            </div>
            {m.description && <p style={{ margin: '4px 0' }}>{m.description}</p>}
            {m.driveFileUrl && (
              <a href={m.driveFileUrl} target="_blank" rel="noreferrer">
                View attached file
              </a>
            )}
            <div style={{ marginTop: 4 }}>
              <button onClick={() => handleDelete(m.id)} style={{ color: 'crimson' }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {!formOpen && <button onClick={() => setFormOpen(true)}>+ New memory</button>}
      {formOpen && (
        <MemoryForm
          familyId={family.id}
          driveConnected={driveConnected}
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

function MemoryForm({
  familyId,
  driveConnected,
  onDone,
  onCancel,
  setError,
}: {
  familyId: string;
  driveConnected: boolean;
  onDone: () => void;
  onCancel: () => void;
  setError: (e: string | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MemoryType>('story');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [driveFileId, setDriveFileId] = useState('');
  const [driveFileUrl, setDriveFileUrl] = useState('');
  const [driveFileName, setDriveFileName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAttachFromDrive() {
    if (!DEVELOPER_KEY) {
      setError('Memories is missing its Google API key configuration (NEXT_PUBLIC_GOOGLE_API_KEY).');
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
        .setCallback((data: any) => {
          if (data.action !== window.google!.picker.Action.PICKED) {
            if (data.action === window.google!.picker.Action.CANCEL) setBusy(false);
            return;
          }
          const doc = data.docs[0];
          setDriveFileId(doc.id);
          setDriveFileUrl(doc.url);
          setDriveFileName(doc.name);
          if (!title) setTitle(doc.name);
          setBusy(false);
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Failed to open Drive picker');
    }
  }

  async function handleSave() {
    if (!title.trim() || !date) return;
    setBusy(true);
    setError(null);
    try {
      await api.memories.create(familyId, {
        title,
        type,
        date,
        description: description || undefined,
        driveFileId: driveFileId || undefined,
        driveFileUrl: driveFileUrl || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save memory');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, maxWidth: 480, marginBottom: 8 }}>
      <h3 style={{ marginTop: 0 }}>New memory</h3>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} />
      <br />
      <select value={type} onChange={(e) => setType(e.target.value as MemoryType)} style={{ marginTop: 8 }}>
        {MEMORY_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 8, marginLeft: 8 }} />
      <br />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        style={{ marginTop: 8, width: '100%' }}
      />
      <br />
      {driveFileName ? (
        <p style={{ margin: '8px 0', fontSize: '0.9em' }}>Attached: {driveFileName}</p>
      ) : (
        <button disabled={busy || !driveConnected} onClick={handleAttachFromDrive} style={{ marginTop: 8 }}>
          {driveConnected ? 'Attach a file from Drive (optional)' : 'Connect Drive in Settings to attach a file'}
        </button>
      )}
      <br />
      <button className="btn-primary" disabled={busy || !title.trim() || !date} onClick={handleSave} style={{ marginTop: 12 }}>
        Save
      </button>
      <button disabled={busy} onClick={onCancel} style={{ marginTop: 12, marginLeft: 8 }}>
        Cancel
      </button>
    </div>
  );
}
