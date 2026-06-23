import { Router } from 'express';
import {
  CreateMemoryInputSchema,
  UpdateMemoryInputSchema,
  hasAtLeastRole,
  type Memory,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/memories (see index.ts) with
 * `{ mergeParams: true }`. Part of Phase 3.B. Same Drive-reference pattern
 * as vault.ts — the client runs the Google Picker and hands us the
 * resulting file reference; we never touch file bytes.
 */
export const memoriesRouter = Router({ mergeParams: true });
memoriesRouter.use(authenticate);
memoriesRouter.use(requireFamilyRole());

type MemoryRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/memories?eventId=&from=&to= */
memoriesRouter.get('/', async (req: MemoryRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('memories') as FirebaseFirestore.Query;

    const { eventId, from, to } = req.query as { eventId?: string; from?: string; to?: string };
    if (typeof eventId === 'string') query = query.where('eventId', '==', eventId);
    if (typeof from === 'string') query = query.where('date', '>=', from);
    if (typeof to === 'string') query = query.where('date', '<=', to);

    const snap = await query.get();
    const memories = snap.docs.map((d) => d.data() as Memory).sort((a, b) => b.date.localeCompare(a.date));
    return res.json(memories);
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/memories — any active member can add a memory. */
memoriesRouter.post('/', async (req: MemoryRequest, res, next) => {
  try {
    const input = CreateMemoryInputSchema.parse(req.body);
    const familyId = req.params.familyId;

    const memoryRef = db.collection('families').doc(familyId).collection('memories').doc();
    const memory: Memory = {
      id: memoryRef.id,
      familyId,
      title: input.title,
      type: input.type,
      driveFileId: input.driveFileId,
      driveFileUrl: input.driveFileUrl,
      eventId: input.eventId,
      date: input.date,
      description: input.description,
      createdBy: req.uid!,
      createdAt: new Date().toISOString(),
    };
    await memoryRef.set(memory);

    return res.status(201).json(memory);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** PATCH /v1/families/:familyId/memories/:memoryId — creator or role >= parent. */
memoriesRouter.patch('/:memoryId', async (req: MemoryRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const memoryRef = db.collection('families').doc(familyId).collection('memories').doc(req.params.memoryId);
    const snap = await memoryRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Memory not found');
    }
    const memory = snap.data() as Memory;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = memory.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this memory');
    }

    const input = UpdateMemoryInputSchema.parse(req.body);
    const updates = { ...input };
    await memoryRef.update(updates);

    return res.json({ ...memory, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/**
 * DELETE /v1/families/:familyId/memories/:memoryId — only removes the
 * Firestore reference, never the underlying Drive file (same as vault.ts).
 * Allowed for: whoever added it, or anyone role >= parent.
 */
memoriesRouter.delete('/:memoryId', async (req: MemoryRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const memoryRef = db.collection('families').doc(familyId).collection('memories').doc(req.params.memoryId);
    const snap = await memoryRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Memory not found');
    }
    const memory = snap.data() as Memory;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = memory.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this memory');
    }

    await memoryRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
