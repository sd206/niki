import { Router } from 'express';
import {
  CreateCalendarEntryInputSchema,
  UpdateCalendarEntryInputSchema,
  hasAtLeastRole,
  type CalendarEntry,
  type Task,
  type Event,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/calendar (see index.ts) with
 * `{ mergeParams: true }`, same pattern as tasksRouter/eventsRouter.
 */
export const calendarRouter = Router({ mergeParams: true });
calendarRouter.use(authenticate);
calendarRouter.use(requireFamilyRole());

type CalendarRequest = AuthedRequest & { member?: { role: Role } };

/**
 * GET /v1/families/:familyId/calendar?from=&to= — ISO date strings,
 * inclusive range. Powers all four web views (month/week/day/agenda); the
 * client narrows `from`/`to` per view and renders the same shape.
 *
 * Per PHASES.md 2.A: "Tasks with a dueDate and Events with
 * startDate/endDate should surface here too (derived, not duplicated
 * data)." We do that merge here, server-side, so every client view gets
 * one consistent list instead of re-implementing the merge per view:
 *  - Real CalendarEntry docs in range, as-is.
 *  - Tasks with a dueDate in range, as synthetic entries (id `task:{id}`,
 *    type 'task'), UNLESS a real entry already links that task
 *    (linkedTaskId) — avoids showing the same task twice.
 *  - Events with startDate (or endDate, if set) in range, as synthetic
 *    entries (id `event:{id}`, type 'event'), same de-dupe via
 *    linkedEventId.
 * Synthetic entries are never persisted and can't be PATCH/DELETEd here —
 * edit the underlying Task/Event instead.
 */
calendarRouter.get('/', async (req: CalendarRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) {
      throw new ApiError(400, 'from and to query params are required (ISO date strings)');
    }

    const familyRef = db.collection('families').doc(familyId);
    const [entriesSnap, tasksSnap, eventsSnap] = await Promise.all([
      familyRef.collection('calendarEntries').where('date', '>=', from).where('date', '<=', to).get(),
      familyRef.collection('tasks').where('dueDate', '>=', from).where('dueDate', '<=', to).get(),
      familyRef.collection('events').get(), // events: filtered in-memory below (range overlap, not a single field)
    ]);

    const realEntries = entriesSnap.docs.map((d) => d.data() as CalendarEntry);
    const linkedTaskIds = new Set(realEntries.map((e) => e.linkedTaskId).filter(Boolean));
    const linkedEventIds = new Set(realEntries.map((e) => e.linkedEventId).filter(Boolean));

    const now = new Date().toISOString();
    const taskEntries: CalendarEntry[] = tasksSnap.docs
      .map((d) => d.data() as Task)
      .filter((t) => !linkedTaskIds.has(t.id))
      .map((t) => ({
        id: `task:${t.id}`,
        familyId,
        title: t.title,
        date: t.dueDate!,
        type: 'task',
        linkedTaskId: t.id,
        createdBy: t.createdBy,
        createdAt: now,
        updatedAt: now,
      }));

    const eventEntries: CalendarEntry[] = eventsSnap.docs
      .map((d) => d.data() as Event)
      .filter((e) => !linkedEventIds.has(e.id))
      .filter((e) => {
        const start = e.startDate;
        const end = e.endDate ?? e.startDate;
        // Overlap check: event range intersects [from, to].
        return start <= to && end >= from;
      })
      .map((e) => ({
        id: `event:${e.id}`,
        familyId,
        title: e.title,
        date: e.startDate,
        type: 'event',
        linkedEventId: e.id,
        createdBy: e.createdBy,
        createdAt: now,
        updatedAt: now,
      }));

    const merged = [...realEntries, ...taskEntries, ...eventEntries].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    return res.json(merged);
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/calendar — any active member can create. */
calendarRouter.post('/', async (req: CalendarRequest, res, next) => {
  try {
    const input = CreateCalendarEntryInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const now = new Date().toISOString();

    const entryRef = db.collection('families').doc(familyId).collection('calendarEntries').doc();
    const entry: CalendarEntry = {
      id: entryRef.id,
      familyId,
      title: input.title,
      date: input.date,
      type: input.type,
      linkedTaskId: input.linkedTaskId,
      linkedEventId: input.linkedEventId,
      createdBy: req.uid!,
      createdAt: now,
      updatedAt: now,
    };
    await entryRef.set(entry);

    return res.status(201).json(entry);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/**
 * PATCH /v1/families/:familyId/calendar/:entryId — creator or role >=
 * parent. Synthetic ids (task:X or event:X) 404 here by construction, since
 * they were never written to calendarEntries.
 */
calendarRouter.patch('/:entryId', async (req: CalendarRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const entryRef = db.collection('families').doc(familyId).collection('calendarEntries').doc(req.params.entryId);
    const snap = await entryRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Calendar entry not found');
    }
    const entry = snap.data() as CalendarEntry;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = entry.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this calendar entry');
    }

    const input = UpdateCalendarEntryInputSchema.parse(req.body);
    const updates = { ...input, updatedAt: new Date().toISOString() };
    await entryRef.update(updates);

    return res.json({ ...entry, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** DELETE /v1/families/:familyId/calendar/:entryId — creator or role >= parent. */
calendarRouter.delete('/:entryId', async (req: CalendarRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const entryRef = db.collection('families').doc(familyId).collection('calendarEntries').doc(req.params.entryId);
    const snap = await entryRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Calendar entry not found');
    }
    const entry = snap.data() as CalendarEntry;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = entry.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this calendar entry');
    }

    await entryRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
