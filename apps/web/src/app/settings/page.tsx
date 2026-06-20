'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { DriveConnection } from '@niki/shared';

export default function SettingsPage() {
  const { user } = useAuth();
  const [drive, setDrive] = useState<DriveConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callbackResult, setCallbackResult] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('drive');
    if (result) setCallbackResult(result);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.drive.status().then(setDrive).catch((e) => setError(e.message));
  }, [user, callbackResult]);

  if (!user) {
    return <div className="container">Sign in first.</div>;
  }

  async function handleConnect() {
    try {
      const { url } = await api.drive.connect();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Drive connection');
    }
  }

  return (
    <div className="container">
      <h1>Settings</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {callbackResult === 'connected' && <p style={{ color: 'green' }}>Google Drive connected.</p>}
      {callbackResult === 'error' && <p style={{ color: 'crimson' }}>Drive connection failed. Try again.</p>}

      <h3>Google Drive</h3>
      <p>Status: {drive?.status ?? 'loading…'}</p>
      {drive?.status !== 'connected' && (
        <button className="btn-primary" onClick={handleConnect}>
          Connect Google Drive
        </button>
      )}

      <p style={{ marginTop: 32 }}>
        <a href="/">Back home</a>
      </p>
    </div>
  );
}
