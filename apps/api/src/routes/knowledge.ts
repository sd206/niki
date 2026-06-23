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
import { indexForSearch, removeFromSearchIndex } from '../lib/searchIndexing';
import { generateJson, vertexAiConfigured } from '../lib/vertexAi';

/**
 * Mounted at /v1/families/:familyId/knowledge (see index.ts) with
 * `{ mergeParams: true }` — same pattern as budgets/expenses/vault. Part of
 * Phase 3.A. The substring `q`/`tag` filtering below is the basic in-memory
 * search from that phase (Firestore has no native text search). Phase 4.A
 * adds real semantic search on top: every create/update/delete also
 * fire-and-forget indexes (or removes) this entry's embedding via
 * indexForSearch/removeFromSearchIndex, queried from routes/search.ts.
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

/**
 * GET /v1/families/:familyId/knowledge/digest?tag=&contentType=
 *
 * Phase 4.D — registered BEFORE /:entryId below so the literal path segment
 * "digest" is never swallowed as an entryId param (Express matches routes
 * within a router in declaration order, not by specificity). No filters =
 * whole-hub digest. `entryCount` is the real Firestore count of matching
 * entries — computed in code, never asked of the model. 503s if Vertex AI
 * isn't configured, same as 4.B's plan-assist (there's no deterministic
 * fallback for summarizing free-text content the way 4.C has for numbers).
 */
knowledgeRouter.get('/digest', async (req: KnowledgeRequest, res, next) => {
  try {
    if (!vertexAiConfigured) {
      throw new ApiError(503, 'AI summarization is not configured');
    }
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('knowledge') as FirebaseFirestore.Query;

    const { contentType, tag } = req.query as { contentType?: string; tag?: string };
    if (typeof contentType === 'string') {
      query = query.where('contentType', '==', contentType);
    }

    const snap = await query.get();
    let entries = snap.docs.map((d) => d.data() as KnowledgeEntry);
    if (typeof tag === 'string') {
      entries = entries.filter((e) => e.tags.includes(tag));
    }

    if (entries.length === 0) {
      return res.json({
        entryCount: 0,
        tag,
        contentType,
        summary: 'No knowledge entries match this scope yet.',
        highlights: [],
      });
    }

    // Cap how much content goes into the prompt — 30 entries, 400 chars of
    // body each, is plenty for a digest and keeps token usage bounded
    // regardless of how large the Knowledge Hub grows.
    const capped = entries.slice(0, 30);
    const context = capped
      .map((e) => `- [${e.contentType}] "${e.title}" (tags: ${e.tags.join(', ') || 'none'}): ${e.body.slice(0, 400)}`)
      .join('\n');

    const prompt = `You are summarizing a family's shared knowledge base for a quick
digest. Below are ${capped.length} knowledge entries${entries.length > capped.length ? ` (of ${entries.length} total, truncated)` : ''}.
Write ONLY a JSON object of the exact shape
{ "summary": string, "highlights": string[] } — summary is 2-4 warm,
plain-language sentences describing what's in here overall; highlights is
3-6 short bullet-style strings, each calling out a specific notable entry by
title. No markdown, no commentary, just the JSON object.

Entries:
${context}`;

    const raw = (await generateJson(prompt)) as { summary?: unknown; highlights?: unknown };
    if (typeof raw?.summary !== 'string' || !raw.summary.trim()) {
      throw new ApiError(502, 'AI digest generation failed');
    }
    const highlights = Array.isArray(raw.highlights) ? raw.highlights.filter((h): h is string => typeof h === 'string') : [];

    return res.json({
      entryCount: entries.length,
      tag,
      contentType,
      summary: raw.summary.trim(),
      highlights,
    });
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

/**
 * POST /v1/families/:familyId/knowledge/:entryId/summarize — Phase 4.D.
 * One-off summary of a single entry's body (handy for a long recipe,
 * instructions, or emergency plan). Stateless — never written back onto the
 * KnowledgeEntry. 503s if Vertex AI isn't configured.
 */
knowledgeRouter.post('/:entryId/summarize', async (req: KnowledgeRequest, res, next) => {
  try {
    if (!vertexAiConfigured) {
      throw new ApiError(503, 'AI summarization is not configured');
    }
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
    const entry = snap.data() as KnowledgeEntry;

    const prompt = `Summarize the following ${entry.contentType} titled "${entry.title}" in 2-4
plain-language sentences. Write ONLY a JSON object of the exact shape
{ "summary": string }. No markdown, no commentary, just the JSON object.

Content:
${entry.body}`;

    const raw = (await generateJson(prompt)) as { summary?: unknown };
    if (typeof raw?.summary !== 'string' || !raw.summary.trim()) {
      throw new ApiError(502, 'AI summarization failed');
    }

    return res.json({ entryId: entry.id, title: entry.title, summary: raw.summary.trim() });
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
    indexForSearch({ type: 'knowledge', id: entry.id, familyId }, `${entry.title}\n${entry.body}`);

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

    const merged = { ...entry, ...updates };
    indexForSearch({ type: 'knowledge', id: merged.id, familyId }, `${merged.title}\n${merged.body}`);

    return res.json(merged);
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
    removeFromSearchIndex({ type: 'knowledge', id: entry.id });
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
