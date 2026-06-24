'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';

export default function OnboardingPage() {
  const { user } = useAuth();
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return <div className="container">Sign in first.</div>;
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await api.families.create({ name: familyName });
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create family');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setBusy(true);
    setError(null);
    try {
      await api.families.acceptInvite(inviteCode);
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join family');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 480, marginTop: 48 }}>
      <h1>Set up your family</h1>
      {error && (
        <div className="card" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Create a new family</h3>
        <input
          placeholder="Family name (e.g. The Dasaris)"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !familyName} onClick={handleCreate}>
          Create family
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Or join with an invite code</h3>
        <input
          placeholder="Invite code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !inviteCode} onClick={handleJoin}>
          Join family
        </button>
      </div>
    </div>
  );
}
