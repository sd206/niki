/**
 * API client — wraps all calls to the Niki API and attaches the Firebase
 * ID token automatically.
 *
 * Production: Firebase Hosting rewrites /v1/** -> Cloud Run niki-api
 * (same origin, no CORS involved at all).
 * Development: set NEXT_PUBLIC_API_URL=http://localhost:8080/v1 in .env.local.
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
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  Event,
  CreateEventInput,
  UpdateEventInput,
  VaultItem,
  CreateVaultItemInput,
  VaultCategory,
  CalendarEntry,
  CreateCalendarEntryInput,
  UpdateCalendarEntryInput,
} from '@niki/shared';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/v1';

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
    pickerToken: () =>
      request<{ accessToken: string; expiresAt: number }>('POST', '/drive/picker-token'),
  },
  tasks: {
    list: (familyId: string, filter?: { status?: TaskStatus; assignedTo?: string }) => {
      const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.assignedTo) params.set('assignedTo', filter.assignedTo);
      const qs = params.toString();
      return request<Task[]>('GET', `/families/${familyId}/tasks${qs ? `?${qs}` : ''}`);
    },
    create: (familyId: string, input: CreateTaskInput) =>
      request<Task>('POST', `/families/${familyId}/tasks`, input),
    update: (familyId: string, taskId: string, input: UpdateTaskInput) =>
      request<Task>('PATCH', `/families/${familyId}/tasks/${taskId}`, input),
    remove: (familyId: string, taskId: string) =>
      request<void>('DELETE', `/families/${familyId}/tasks/${taskId}`),
  },
  events: {
    list: (familyId: string) => request<Event[]>('GET', `/families/${familyId}/events`),
    get: (familyId: string, eventId: string) =>
      request<{ event: Event; tasks: Task[] }>('GET', `/families/${familyId}/events/${eventId}`),
    create: (familyId: string, input: CreateEventInput) =>
      request<Event>('POST', `/families/${familyId}/events`, input),
    update: (familyId: string, eventId: string, input: UpdateEventInput) =>
      request<Event>('PATCH', `/families/${familyId}/events/${eventId}`, input),
    remove: (familyId: string, eventId: string) =>
      request<void>('DELETE', `/families/${familyId}/events/${eventId}`),
  },
  vault: {
    list: (familyId: string, category?: VaultCategory) =>
      request<VaultItem[]>('GET', `/families/${familyId}/vault${category ? `?category=${category}` : ''}`),
    create: (familyId: string, input: CreateVaultItemInput) =>
      request<VaultItem>('POST', `/families/${familyId}/vault`, input),
    remove: (familyId: string, itemId: string) =>
      request<void>('DELETE', `/families/${familyId}/vault/${itemId}`),
  },
  calendar: {
    range: (familyId: string, from: string, to: string) =>
      request<CalendarEntry[]>('GET', `/families/${familyId}/calendar?from=${from}&to=${to}`),
    create: (familyId: string, input: CreateCalendarEntryInput) =>
      request<CalendarEntry>('POST', `/families/${familyId}/calendar`, input),
    update: (familyId: string, entryId: string, input: UpdateCalendarEntryInput) =>
      request<CalendarEntry>('PATCH', `/families/${familyId}/calendar/${entryId}`, input),
    remove: (familyId: string, entryId: string) =>
      request<void>('DELETE', `/families/${familyId}/calendar/${entryId}`),
  },
};
