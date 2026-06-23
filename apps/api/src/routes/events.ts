import { Router } from 'express';
import {
  CreateEventInputSchema,
  UpdateEventInputSchema,
  hasAtLeastRole,
  type Event,
  type Task,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/events (see index.ts) with
 * `{ mergeParams: true }`, same pattern as tasksRouter.
 */
export const eventsRouter = Router({ mergeParams: true });
eventsRouter.use(authenticate);
// Any active member can list/create/view. Update/delete re-check below.
eventsRouter.use(requireFamilyRole());

type EventRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/events — list all events for the family. */
eventsRouter.get('/', async (req: EventRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const snap = await db.collection('families').doc(familyId).collection('events').get();
    return res.json(snap.docs.map((d) => d.data() as Event));
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/events — any active member can create. */
eventsRouter.post('/', async (req: EventRequest, res, next) => {
  try {
    const input = CreateEventInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const now = new Date().toISOString();

    const eventRef = db.collection('families').doc(familyId).collection('events').doc();
    const event: Event = {
      id: eventRef.id,
      familyId,
      title: input.title,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      description: input.description,
      createdBy: req.uid!,
      createdAt: now,
      updatedAt: now,
    };
    await eventRef.set(event);

    return res.status(201).json(event);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/**
 * GET /v1/families/:familyId/events/:eventId — event details + its linked
 * tasks (tasks where task.eventId === eventId).
 */
eventsRouter.get('/:eventId', async (req: EventRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const eventRef = db.collection('families').doc(familyId).collection('events').doc(req.params.eventId);
    const [eventSnap, tasksSnap] = await Promise.all([
      eventRef.get(),
      db
        .collection('families')
        .doc(familyId)
        .collection('tasks')
        .where('eventId', '==', req.params.eventId)
        .get(),
    ]);

    if (!eventSnap.exists) {
      throw new ApiError(404, 'Event not found');
    }

    return res.json({
      event: eventSnap.data() as Event,
      tasks: tasksSnap.docs.map((d) => d.data() as Task),
    });
  } catch (err) {
    next(err);
  }
});

/** PATCH /v1/families/:familyId/events/:eventId — creator or role >= parent. */
eventsRouter.patch('/:eventId', async (req: EventRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const eventRef = db.collection('families').doc(familyId).collection('events').doc(req.params.eventId);
    const snap = await eventRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Event not found');
    }
    const event = snap.data() as Event;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = event.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this event');
    }

    const input = UpdateEventInputSchema.parse(req.body);
    const updates = { ...input, updatedAt: new Date().toISOString() };
    await eventRef.update(updates);

    return res.json({ ...event, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** DELETE /v1/families/:familyId/events/:eventId — creator or role >= parent. */
eventsRouter.delete('/:eventId', async (req: EventRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const eventRef = db.collection('families').doc(familyId).collection('events').doc(req.params.eventId);
    const snap = await eventRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Event not found');
    }
    const event = snap.data() as Event;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = event.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this event');
    }

    await eventRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
