'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import type { Family, Member, Invite, CreateInviteInput } from '@niki/shared';
import { hasAtLeastRole } from '@niki/shared';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, PageHeader } from '@/components/ui';
import { UsersIcon } from '@/components/icons';

type InvitableRole = CreateInviteInput['role'];

/**
 * Single static route (no [id] dynamic segment) because apps/web uses
 * `output: 'export'` (static export, served from Firebase Hosting) — a
 * dynamic route would need every family ID known at build time, which we
 * don't have. Instead this loads the signed-in user's own family by reading
 * their profile's familyIds[0], same pattern as /settings. Fine for the
 * "one family per user" MVP case; a family switcher can be added if/when
 * multi-family becomes a real need.
 */
export default function FamilyPage() {
  const { user, loading } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('member');
  const [lastInvite, setLastInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);

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
        setMembers(result.members);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load family');
      } finally {
        setLoadingFamily(false);
      }
    })();
  }, [user]);

  async function handleInvite() {
    if (!family) return;
    setBusy(true);
    setError(null);
    try {
      const invite = await api.families.invite(family.id, { email: inviteEmail, role: inviteRole });
      setLastInvite(invite);
      setInviteEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invite');
    } finally {
      setBusy(false);
    }
  }

  if (loading || loadingFamily) {
    return <div className="container">Loading…</div>;
  }
  if (!user) {
    return <div className="container">Sign in first.</div>;
  }
  if (!family) {
    // Redirect to /onboarding already fired above; render nothing meanwhile.
    return null;
  }

  const me = members.find((m) => m.uid === user.uid);
  const canInvite = me ? hasAtLeastRole(me.role, 'parent') : false;

  return (
    <AppShell>
      <PageHeader module="search" icon={<UsersIcon size={22} />} title={family.name} subtitle="Members & invites" />
      {error && (
        <Card style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</Card>
      )}

      <h3 style={{ marginBottom: 8 }}>Members</h3>
      <Card>
        {members.map((m, i) => (
          <div
            key={m.uid}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
            }}
          >
            <span>{m.displayName}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <Badge module="search">{m.role}</Badge>
              <Badge module="search">{m.status}</Badge>
            </span>
          </div>
        ))}
      </Card>

      {canInvite && (
        <>
          <h3 style={{ marginTop: 32, marginBottom: 8 }}>Invite a member</h3>
          <Card>
            <input
              placeholder="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as InvitableRole)}>
              <option value="parent">Parent</option>
              <option value="member">Member</option>
              <option value="child">Child</option>
              <option value="guest">Guest</option>
            </select>
            <button className="btn-primary" disabled={busy || !inviteEmail} onClick={handleInvite}>
              Send invite
            </button>

            {lastInvite && (
              <p style={{ marginTop: 16, marginBottom: 0 }}>
                Invite created for {lastInvite.email}. Sending the email itself is a later
                phase (Notifications module) — for now, share this code with them directly:
                <br />
                <code style={{ fontSize: '1.2em' }}>{lastInvite.code}</code>
                <br />
                They enter it on the <a href="/onboarding">onboarding page</a> under
                &quot;join with an invite code.&quot;
              </p>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
