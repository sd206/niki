import { z } from 'zod';

/**
 * Phase 4.A — Search. Content types currently indexed into Vertex AI Vector
 * Search for semantic search. Scoped to Knowledge Hub entries and Tasks for
 * v1 (per the Phase 4 scoping decision) — Events, Vault, Memories, Finance
 * can be added later by following the same indexForSearch() pattern used in
 * apps/api/src/routes/knowledge.ts and tasks.ts.
 */
export const SEARCH_RESULT_TYPES = ['knowledge', 'task'] as const;
export const SearchResultTypeSchema = z.enum(SEARCH_RESULT_TYPES);
export type SearchResultType = z.infer<typeof SearchResultTypeSchema>;

export const SearchResultSchema = z.object({
  id: z.string(),
  type: SearchResultTypeSchema,
  title: z.string(),
  snippet: z.string(),
  /** Vector distance from the query embedding — lower is a closer match. */
  distance: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Phase 4.B — Event planning assistant. Gemini-generated draft suggestions,
 * never auto-created — the web UI shows these as a reviewable list and the
 * user explicitly accepts individual items into real Tasks/Budget rows via
 * the existing POST /tasks and POST /budgets endpoints.
 */
export const EventPlanChecklistItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});
export type EventPlanChecklistItem = z.infer<typeof EventPlanChecklistItemSchema>;

export const EventPlanBudgetItemSchema = z.object({
  category: z.string().min(1).max(100),
  estimatedAmount: z.number().nonnegative(),
  notes: z.string().max(300).optional(),
});
export type EventPlanBudgetItem = z.infer<typeof EventPlanBudgetItemSchema>;

export const EventPlanDraftSchema = z.object({
  checklist: z.array(EventPlanChecklistItemSchema),
  budget: z.array(EventPlanBudgetItemSchema),
});
export type EventPlanDraft = z.infer<typeof EventPlanDraftSchema>;
