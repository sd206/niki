import { Router } from 'express';
import {
  CreateKnowledgeEntryInputSchema,
  UpdateKnowledgeEntryInputSchema,
  hasAtLeastRole,
  type KnowledgeEntry,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/knowledge (see index.ts) with
 * `{ mergeParams: true }` — same pattern as budgets/expenses/vault. Part of
 * Phase 3.A. Search here is basic tag/title substring matching done
 * in-memory after fetch (Firestore has no native text search); AI-powered
 * semantic search is deferred to Phase 4.D per PHASES.md.
 */
export const knowledgeRouter = Router({ mergeParams: true });
knowledgeRouter.use(authenticate);
knowledgeRouter.use(requireFamilyRole());

type KnowledgeRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/knowledge?q=&tag=&contentType= */
knowledgeRouter.get('/', async (req: KnowledgeRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('knowledge') as FirebaseFirestore.Query;

    const { contentType } = req.query as { contentType?: string };
    if (typeof contentType === 'string') {
      query = query.where('contentType', '==', contentType);
    }

    const snap = await query.get();
    let entries = snap.docs.map((d) => d.data() as KnowledgeEntry);

    const { q, tag } = req.query as { q?: string; tag?: string };
    if (typeof tag === 'string') {
      entries = entries.filter((e) => e.tags.includes(tag));
    }
    if (typeof q === 'string' && q.trim()) {
      const needle = q.trim().toLowerCase();
      entries = entries.filter(
        (e) =>
          e.title.toLowerCase().includes(needle) ||
          e.tags.some((t) => t.toLowerCase().includes(needle)),
      );
    }

    return res.json(entries);
  } catch (err) {
    next(err);
  }
});

/** GET /v1/families/:familyId/knowledge/:entryId */
knowledgeRouter.get('/:entryId', async (req: KnowledgeRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const snap = await db
      .collection('families')
      .doc(familyId)
      .collection('knowledge')
      .doc(req.params.entryId)
      .get();
    if (!snap.exists) {
      throw new ApiError(404, 'Knowledge entry not found');
    }
    return res.json(snap.data() as KnowledgeEntry);
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/knowledge — any active member can create. */
knowledgeRouter.post('/', async (req: KnowledgeRequest, res, next) => {
  try {
    const input = CreateKnowledgeEntryInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const now = new Date().toISOString();

    const entryRef = db.collection('families').doc(familyId).collection('knowledge').doc();
    const entry: KnowledgeEntry = {
      id: entryRef.id,
      familyId,
      title: input.title,
      contentType: input.contentType,
      body: input.body,
      tags: input.tags,
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

/** PATCH /v1/families/:familyId/knowledge/:entryId — creator or role >= parent. */
knowledgeRouter.patch('/:entryId', async (req: KnowledgeRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const entryRef = db.collection('families').doc(familyId).collection('knowledge').doc(req.params.entryId);
    const snap = await entryRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Knowledge entry not found');
    }
    const entry = snap.data() as KnowledgeEntry;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = entry.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this knowledge entry');
    }

    const input = UpdateKnowledgeEntryInputSchema.parse(req.body);
    const updates = { ...input, updatedAt: new Date().toISOString() };
    await entryRef.update(updates);

    return res.json({ ...entry, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** DELETE /v1/families/:familyId/knowledge/:entryId — creator or role >= parent. */
knowledgeRouter.delete('/:entryId', async (req: KnowledgeRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const entryRef = db.collection('families').doc(familyId).collection('knowledge').doc(req.params.entryId);
    const snap = await entryRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Knowledge entry not found');
    }
    const entry = snap.data() as KnowledgeEntry;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = entry.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this knowledge entry');
    }

    await entryRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
