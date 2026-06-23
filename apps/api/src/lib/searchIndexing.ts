import { embedText, vertexAiConfigured } from './vertexAi';
import { upsertEmbedding, removeEmbedding, vectorSearchConfigured, type IndexableItem } from './vectorSearch';

/**
 * Best-effort, fire-and-forget: embeds `text` and upserts it into Vector
 * Search for Phase 4.A semantic search. Deliberately not awaited by callers
 * (see routes/knowledge.ts, routes/tasks.ts) so a Vertex AI/Vector Search
 * hiccup — or it simply not being configured yet in this environment —
 * never delays or breaks the Knowledge/Task write that triggered it.
 * Errors are logged, not thrown.
 */
export function indexForSearch(item: IndexableItem, text: string): void {
  if (!vertexAiConfigured || !vectorSearchConfigured) return;
  embedText(text)
    .then((embedding) => upsertEmbedding(item, embedding))
    .catch((err) => {
      console.error(`[search-index] Failed to index ${item.type}:${item.id}`, err);
    });
}

/** Best-effort removal counterpart, called on delete. */
export function removeFromSearchIndex(item: Pick<IndexableItem, 'type' | 'id'>): void {
  if (!vectorSearchConfigured) return;
  removeEmbedding(item).catch((err) => {
    console.error(`[search-index] Failed to remove ${item.type}:${item.id}`, err);
  });
}
