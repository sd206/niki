'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type {
  Family,
  Member,
  VaultItem,
  VaultCategory,
  VaultFolderType,
  VaultAuditLogEntry,
  SensitiveDocumentSuggestion,
  DriveConnection,
} from '@niki/shared';
import { VAULT_CATEGORIES, VAULT_FOLDER_TYPES, HARDENED_VAULT_FOLDER_TYPES, hasAtLeastRole } from '@niki/shared';

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
  const [members, setMembers] = useState<Member[]>([]);
  const [canManageHardened, setCanManageHardened] = useState(false);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [drive, setDrive] = useState<DriveConnection | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VaultCategory | ''>('');
  const [folderFilter, setFolderFilter] = useState<VaultFolderType | ''>('');
  const [pickerCategory, setPickerCategory] = useState<VaultCategory>('custom');
  const [pickerFolderType, setPickerFolderType] = useState<VaultFolderType>('standard');
  const [busy, setBusy] = useState(false);

  const [auditLog, setAuditLog] = useState<VaultAuditLogEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Phase 4.E: sensitive-document detection surfaces at most one suggestion
  // at a time, right after the create that triggered it. Dismissing or
  // acting on it clears it — it is never re-offered for the same item.
  const [suggestion, setSuggestion] = useState<SensitiveDocumentSuggestion | null>(null);
  const [movingItem, setMovingItem] = useState(false);

  async function loadItems(familyId: string, category?: VaultCategory, folderType?: VaultFolderType) {
    const result = await api.vault.list(familyId, { category: category || undefined, folderType: folderType || undefined });
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
        setMembers(familyResult.members);
        setDrive(driveStatus);
        const me = familyResult.members.find((m) => m.uid === user.uid);
        setCanManageHardened(me ? hasAtLeastRole(me.role, 'parent') : false);
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
      await loadItems(family.id, category || undefined, folderFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to filter vault');
    }
  }

  async function handleFolderFilterChange(folderType: VaultFolderType | '') {
    if (!family) return;
    setFolderFilter(folderType);
    setError(null);
    try {
      await loadItems(family.id, filter || undefined, folderType || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to filter vault');
    }
  }

  async function handleViewAuditLog() {
    if (!family) return;
    setAuditLoading(true);
    setError(null);
    try {
      const result = await api.vault.auditLog(family.id);
      setAuditLog(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setAuditLoading(false);
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
            const { suggestion: newSuggestion } = await api.vault.create(family.id, {
              name: doc.name,
              driveFileId: doc.id,
              driveFileUrl: doc.url,
              category: pickerCategory,
              folderType: pickerFolderType,
            });
            setSuggestion(newSuggestion ?? null);
            await loadItems(family.id, filter || undefined, folderFilter || undefined);
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
      await loadItems(family.id, filter || undefined, folderFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete vault item');
    }
  }

  async function handleAcceptSuggestion() {
    if (!family || !suggestion) return;
    setMovingItem(true);
    setError(null);
    try {
      await api.vault.move(family.id, suggestion.vaultItemId, { folderType: suggestion.suggestedFolderType });
      setSuggestion(null);
      await loadItems(family.id, filter || undefined, folderFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move vault item');
    } finally {
      setMovingItem(false);
    }
  }

  function handleDismissSuggestion() {
    setSuggestion(null);
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

      {suggestion && (
        <div
          style={{
            border: '1px solid #f0c36d',
            background: '#fff8e6',
            borderRadius: 8,
            padding: 12,
            marginTop: 16,
          }}
        >
          <p style={{ margin: '0 0 8px' }}>
            <strong>{suggestion.vaultItemName}</strong> looks sensitive. {suggestion.reason} Move it to the{' '}
            <strong>{suggestion.suggestedFolderType}</strong> folder?
          </p>
          <button onClick={handleAcceptSuggestion} disabled={movingItem} style={{ marginRight: 8 }}>
            {movingItem ? 'Moving…' : `Move to ${suggestion.suggestedFolderType}`}
          </button>
          <button onClick={handleDismissSuggestion} disabled={movingItem}>
            Dismiss
          </button>
        </div>
      )}

      {!driveConnected && (
        <p>
          Connect Google Drive in <a href="/settings">Settings</a> before adding vault items.
        </p>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
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
        <label>
          Filter by folder{' '}
          <select value={folderFilter} onChange={(e) => handleFolderFilterChange(e.target.value as VaultFolderType | '')}>
            <option value="">All</option>
            {VAULT_FOLDER_TYPES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {items.map((item) => {
          const hardened = (HARDENED_VAULT_FOLDER_TYPES as readonly string[]).includes(item.folderType);
          return (
            <li key={item.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <a href={item.driveFileUrl} target="_blank" rel="noreferrer">
                <strong>{item.name}</strong>
              </a>
              <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#666' }}>
                {item.category}
                {hardened && (
                  <span style={{ marginLeft: 8, color: '#a15c00', fontWeight: 600 }}>🔒 {item.folderType}</span>
                )}
              </p>
              {(!hardened || canManageHardened) && (
                <button onClick={() => handleDelete(item)} style={{ color: 'crimson' }}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
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
      </label>{' '}
      <label>
        Folder{' '}
        <select value={pickerFolderType} onChange={(e) => setPickerFolderType(e.target.value as VaultFolderType)}>
          {VAULT_FOLDER_TYPES.filter(
            (f) => f === 'standard' || canManageHardened,
          ).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      {!canManageHardened && (
        <p style={{ fontSize: '0.85em', color: '#888', margin: '4px 0' }}>
          Restricted/secure/vault folders require the parent role or higher.
        </p>
      )}
      <br />
      <button
        className="btn-primary"
        disabled={busy || !driveConnected}
        onClick={handleAddFromDrive}
        style={{ marginTop: 8 }}
      >
        {busy ? 'Opening Drive…' : 'Add from Drive'}
      </button>

      {canManageHardened && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 32, maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>Permission review</h3>
          <p style={{ color: '#666', fontSize: '0.9em', margin: '4px 0 8px' }}>
            These members can view, add to, and delete from restricted/secure/vault folders.
          </p>
          <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
            {members
              .filter((m) => hasAtLeastRole(m.role, 'parent'))
              .map((m) => (
                <li key={m.uid} style={{ fontSize: '0.9em' }}>
                  {m.displayName} ({m.role}){m.uid === user.uid ? ' — you' : ''}
                </li>
              ))}
          </ul>
          {auditLog && (
            <>
              <p style={{ color: '#666', fontSize: '0.9em', margin: '8px 0 4px' }}>
                Recent hardened-vault activity, by member (from the {auditLog.length} entries loaded below):
              </p>
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                {Object.entries(
                  auditLog.reduce<Record<string, number>>((acc, entry) => {
                    acc[entry.actorUid] = (acc[entry.actorUid] ?? 0) + 1;
                    return acc;
                  }, {}),
                ).map(([uid, count]) => {
                  const m = members.find((mm) => mm.uid === uid);
                  return (
                    <li key={uid} style={{ fontSize: '0.9em' }}>
                      {m ? m.displayName : uid}
                      {uid === user.uid ? ' (you)' : ''}: {count} action{count === 1 ? '' : 's'}
                    </li>
                  );
                })}
                {auditLog.length === 0 && <li style={{ fontSize: '0.9em' }}>No activity yet.</li>}
              </ul>
            </>
          )}
          {!auditLog && (
            <p style={{ color: '#888', fontSize: '0.85em', margin: '8px 0 0' }}>
              Load the audit log below to see a recent-activity rollup here.
            </p>
          )}
        </div>
      )}

      {canManageHardened && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16, maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>Audit log</h3>
          <p style={{ color: '#666', fontSize: '0.9em', margin: '4px 0 8px' }}>
            Every view/create/delete against restricted, secure, or vault items — most recent first.
          </p>
          <button onClick={handleViewAuditLog} disabled={auditLoading}>
            {auditLoading ? 'Loading…' : 'View audit log'}
          </button>
          {auditLog && (
            <table style={{ marginTop: 12, width: '100%', fontSize: '0.85em', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th>When</th>
                  <th>Action</th>
                  <th>Item</th>
                  <th>Folder</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td>{entry.action}</td>
                    <td>{entry.vaultItemName}</td>
                    <td>{entry.folderType}</td>
                    <td>{entry.actorUid === user.uid ? 'you' : entry.actorUid}</td>
                  </tr>
                ))}
                {auditLog.length === 0 && (
                  <tr>
                    <td colSpan={5}>No audit entries yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}
