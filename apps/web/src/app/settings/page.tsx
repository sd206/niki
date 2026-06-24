'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { DriveConnection } from '@niki/shared';
import { AppShell } from '@/components/AppShell';
import { Card, PageHeader } from '@/components/ui';
import { SettingsIcon } from '@/components/icons';

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
    <AppShell>
      <PageHeader module="settings" icon={<SettingsIcon size={22} />} title="Settings" />
      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</Card>
      )}
      {callbackResult === 'connected' && (
        <Card style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>Google Drive connected.</Card>
      )}
      {callbackResult === 'error' && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>Drive connection failed. Try again.</Card>
      )}

      <Card style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Google Drive</h3>
        <p>Status: {drive?.status ?? 'loading…'}</p>
        {drive?.status !== 'connected' && (
          <button className="btn-primary" onClick={handleConnect}>
            Connect Google Drive
          </button>
        )}
      </Card>
    </AppShell>
  );
}
