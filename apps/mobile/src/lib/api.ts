/**
 * API client — mobile calls the *Firebase Hosting* URL
 * (https://niki-app-d035f.web.app/v1), the same one web uses, NOT the raw Cloud Run
 * URL. Cloud Run stays `--no-allow-unauthenticated`: its IAM layer only
 * accepts Google-signed invoker tokens, not Firebase Auth user ID tokens, so
 * a direct-to-Cloud-Run request with a Firebase ID token would be rejected
 * by Google's front end before ever reaching this app's auth middleware.
 * Hosting's rewrite is already authorized to invoke Cloud Run (Firebase CLI
 * grants this automatically on deploy), so routing mobile through it keeps
 * Cloud Run private with no extra plumbing. There's still no CORS concern
 * here either way — native fetch() doesn't send a browser Origin header.
 */
import { auth } from './firebase';
import type {
  Family,
  Member,
  Invite,
  UserProfile,
  DriveConnection,
  CreateFamilyInput,
  CreateInviteInput,
  Expense,
  CreateExpenseInput,
  VoiceExpenseDraft,
} from '@niki/shared';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://niki-app-d035f.web.app/v1';

async function getToken(): Promise<string> {
  const user = await new Promise<import('firebase/auth').User | null>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      unsubscribe();
      resolve(u);
    });
  });
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'API error');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  users: {
    me: () => request<UserProfile>('GET', '/users/me'),
  },
  families: {
    create: (input: CreateFamilyInput) => request<Family>('POST', '/families', input),
    get: (familyId: string) =>
      request<{ family: Family; members: Member[] }>('GET', `/families/${familyId}`),
    invite: (familyId: string, input: CreateInviteInput) =>
      request<Invite>('POST', `/families/${familyId}/invites`, input),
    acceptInvite: (code: string) =>
      request<Member>('POST', `/families/invites/${code}/accept`),
  },
  drive: {
    status: () => request<DriveConnection>('GET', '/drive/status'),
    connect: (redirectTo?: string) =>
      request<{ url: string }>('POST', '/drive/connect', redirectTo ? { redirectTo } : undefined),
  },
  // Phase 2.B.3 — mobile only needs voice-expense capture today (the user's
  // explicit choice to ship web + mobile simultaneously); other Finance Hub
  // screens (budgets, savings goals, full expense list) stay web-only until
  // the mobile app grows beyond this minimal skeleton.
  expenses: {
    create: (familyId: string, input: CreateExpenseInput) =>
      request<Expense>('POST', `/families/${familyId}/expenses`, input),
    transcribeVoice: (familyId: string, audioBase64: string) =>
      request<VoiceExpenseDraft>('POST', `/families/${familyId}/expenses/transcribe-voice`, { audioBase64 }),
  },
};
