'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { UserProfile } from '@niki/shared';

export default function HomePage() {
  const { user, loading, signIn, signOutUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.users
      .me()
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, [user]);

  if (loading) {
    return <div className="container">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="container">
        <h1>Niki</h1>
        <p>Your family&apos;s operating system.</p>
        <button className="btn-primary" onClick={() => signIn()}>
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Welcome{profile ? `, ${profile.displayName}` : ''}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {profile && profile.familyIds.length === 0 ? (
        <>
          <p>You&apos;re not part of a family yet.</p>
          <a className="btn-primary" href="/onboarding" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Create or join a family
          </a>
        </>
      ) : (
        <p>{profile?.familyIds.length} family(ies). Modules (Vault, Events, Tasks…) land in later phases.</p>
      )}
      <p style={{ marginTop: 32 }}>
        <a href="/family">Family</a>
        {' · '}
        <a href="/settings">Settings</a>
      </p>
      <button onClick={() => signOutUser()} style={{ marginTop: 16 }}>
        Sign out
      </button>
    </div>
  );
}
