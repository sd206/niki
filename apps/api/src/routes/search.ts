import { Router } from 'express';
import type { KnowledgeEntry, Task, SearchResult } from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';
import { embedText, vertexAiConfigured } from '../lib/vertexAi';
import { findNeighbors, vectorSearchConfigured } from '../lib/vectorSearch';

/**
 * Mounted at /v1/families/:familyId/search (see index.ts) with
 * `{ mergeParams: true }`. Phase 4.A — semantic search over Knowledge Hub
 * entries and Tasks (the two content types indexed so far; see
 * lib/searchIndexing.ts and routes/knowledge.ts / routes/tasks.ts). Returns
 * an empty result set (not an error) if Vertex AI / Vector Search aren't
 * configured yet, so the /search web page can show a clear "not set up"
 * state instead of a 500.
 */
export const searchRouter = Router({ mergeParams: true });
searchRouter.use(authenticate);
searchRouter.use(requireFamilyRole());

/** GET /v1/families/:familyId/search?q= */
searchRouter.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      throw new ApiError(400, 'Missing required query parameter: q');
    }

    if (!vertexAiConfigured || !vectorSearchConfigured) {
      return res.json({ query: q, results: [] });
    }

    const embedding = await embedText(q);
    const neighbors = await findNeighbors(embedding, familyId, 10);

    const knowledgeIds = neighbors.filter((n) => n.type === 'knowledge').map((n) => n.id);
    const taskIds = neighbors.filter((n) => n.type === 'task').map((n) => n.id);

    const [knowledgeDocs, taskDocs] = await Promise.all([
      Promise.all(
        knowledgeIds.map((id) => db.collection('families').doc(familyId).collection('knowledge').doc(id).get()),
      ),
      Promise.all(taskIds.map((id) => db.collection('families').doc(familyId).collection('tasks').doc(id).get())),
    ]);

    const byKey = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    knowledgeDocs.forEach((d) => byKey.set(`knowledge:${d.id}`, d));
    taskDocs.forEach((d) => byKey.set(`task:${d.id}`, d));

    const results: SearchResult[] = [];
    for (const n of neighbors) {
      const snap = byKey.get(`${n.type}:${n.id}`);
      if (!snap || !snap.exists) continue; // stale datapoint (doc deleted after last index)

      if (n.type === 'knowledge') {
        const entry = snap.data() as KnowledgeEntry;
        results.push({
          id: entry.id,
          type: 'knowledge',
          title: entry.title,
          snippet: entry.body.slice(0, 200),
          distance: n.distance,
        });
      } else if (n.type === 'task') {
        const task = snap.data() as Task;
        results.push({
          id: task.id,
          type: 'task',
          title: task.title,
          snippet: (task.description ?? '').slice(0, 200),
          distance: n.distance,
        });
      }
    }

    return res.json({ query: q, results });
  } catch (err) {
    next(err);
  }
});
