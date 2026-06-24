'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { UserProfile } from '@niki/shared';
import { AppShell } from '@/components/AppShell';
import { Card, IconTile } from '@/components/ui';
import {
  UsersIcon,
  TasksIcon,
  EventsIcon,
  CalendarIcon,
  VaultIcon,
  FinanceIcon,
  KnowledgeIcon,
  MemoriesIcon,
  LogOutIcon,
} from '@/components/icons';

const MODULES = [
  { href: '/family', label: 'Family', module: 'search' as const, icon: UsersIcon, desc: 'Members & invites' },
  { href: '/tasks', label: 'Tasks', module: 'tasks' as const, icon: TasksIcon, desc: 'To-dos & assignments' },
  { href: '/events', label: 'Events', module: 'events' as const, icon: EventsIcon, desc: 'Plan & track milestones' },
  { href: '/calendar', label: 'Calendar', module: 'calendar' as const, icon: CalendarIcon, desc: 'Everything, on a timeline' },
  { href: '/vault', label: 'Vault', module: 'vault' as const, icon: VaultIcon, desc: 'Important documents' },
  { href: '/finance', label: 'Finance', module: 'finance' as const, icon: FinanceIcon, desc: 'Budgets & expenses' },
  { href: '/knowledge', label: 'Knowledge', module: 'knowledge' as const, icon: KnowledgeIcon, desc: 'Recipes, plans & ideas' },
  { href: '/memories', label: 'Memories', module: 'memories' as const, icon: MemoriesIcon, desc: 'Photos & milestones' },
];

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
    return (
      <div className="container">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container" style={{ paddingTop: 96, textAlign: 'center' }}>
        <h1 style={{ fontSize: 32 }}>Niki</h1>
        <p style={{ marginBottom: 24 }}>Your family&apos;s operating system.</p>
        <button className="btn-primary" onClick={() => signIn()}>
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Welcome{profile ? `, ${profile.displayName}` : ''}</h1>
          {profile && (
            <p style={{ margin: 0, fontSize: 13 }}>
              {profile.familyIds.length === 0 ? 'No family yet' : `${profile.familyIds.length} family(ies)`}
            </p>
          )}
        </div>
        <button className="btn-secondary" onClick={() => signOutUser()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LogOutIcon size={15} />
          Sign out
        </button>
      </div>

      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</Card>
      )}

      {profile && profile.familyIds.length === 0 && (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ marginTop: 0 }}>You&apos;re not part of a family yet.</p>
          <a className="btn-primary" href="/onboarding" style={{ display: 'inline-block' }}>
            Create or join a family
          </a>
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {MODULES.map(({ href, label, module, icon: Icon, desc }) => (
          <a key={href} href={href} style={{ textDecoration: 'none' }}>
            <Card style={{ marginBottom: 0, height: '100%' }}>
              <IconTile module={module} size={36}>
                <Icon size={18} />
              </IconTile>
              <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{desc}</div>
            </Card>
          </a>
        ))}
      </div>
    </AppShell>
  );
}
