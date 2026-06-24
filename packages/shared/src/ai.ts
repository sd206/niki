import { z } from 'zod';
import { ExpenseCategorySchema } from './finance';
import { KnowledgeContentTypeSchema } from './knowledge';

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

/**
 * Phase 4.C — Financial coaching. All NUMBERS here (allocated/spent/overBy,
 * goal progress, suggestedMonthlyContribution) are computed deterministically
 * in apps/api/src/routes/financialCoaching.ts from real Budget/Expense/
 * SavingsGoal data — never invented by an LLM. Gemini (when configured) only
 * supplies the friendlier `message`/`summary` phrasing on top of those
 * already-computed facts; if Vertex AI isn't configured, default template
 * messages are used instead. Purely a read-only report — no Tasks/Budgets are
 * created or modified by this endpoint.
 */
export const OverspendingAlertSchema = z.object({
  budgetId: z.string(),
  budgetName: z.string(),
  category: ExpenseCategorySchema,
  allocated: z.number(),
  spent: z.number(),
  overBy: z.number(),
  message: z.string(),
});
export type OverspendingAlert = z.infer<typeof OverspendingAlertSchema>;

export const SavingsRecommendationSchema = z.object({
  goalId: z.string(),
  goalName: z.string(),
  message: z.string(),
  suggestedMonthlyContribution: z.number().optional(),
});
export type SavingsRecommendation = z.infer<typeof SavingsRecommendationSchema>;

export const FinancialCoachingResponseSchema = z.object({
  alerts: z.array(OverspendingAlertSchema),
  recommendations: z.array(SavingsRecommendationSchema),
  summary: z.string(),
});
export type FinancialCoachingResponse = z.infer<typeof FinancialCoachingResponseSchema>;

/**
 * Phase 4.D — Knowledge summarization. Unlike 4.C, there's no deterministic
 * "true number" to protect — summarizing free-text body content genuinely
 * requires an LLM, so both endpoints (apps/api/src/routes/knowledge.ts:
 * POST /:entryId/summarize, GET /digest) return 503 if Vertex AI isn't
 * configured, same fail-soft pattern as 4.B's plan-assist. `entryCount` on
 * the digest is the one fact computed in code (real Firestore count), not
 * asked of the model. Both are stateless — generated on demand, never
 * persisted onto the KnowledgeEntry itself (explicit decision, so summaries
 * always reflect the entry's current body with no staleness/migration
 * concerns).
 */
export const KnowledgeSummaryResponseSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  summary: z.string(),
});
export type KnowledgeSummaryResponse = z.infer<typeof KnowledgeSummaryResponseSchema>;

export const KnowledgeDigestResponseSchema = z.object({
  /** Real Firestore count of entries matching the scope — not LLM-reported. */
  entryCount: z.number(),
  tag: z.string().optional(),
  contentType: KnowledgeContentTypeSchema.optional(),
  summary: z.string(),
  highlights: z.array(z.string()),
});
export type KnowledgeDigestResponse = z.infer<typeof KnowledgeDigestResponseSchema>;

/**
 * Phase 2.B.2 — Receipt OCR. Document AI's receipt/expense processor already
 * returns typed entities (supplier name, total amount, receipt date) — this
 * is a deterministic mapping of those entities, not an LLM call (see
 * apps/api/src/lib/documentAi.ts). Every field is optional: Document AI may
 * not confidently extract all three from a given receipt, and the web/mobile
 * UI pre-fills whatever came back into the expense form for the user to
 * complete and review — it never auto-saves an Expense from this response.
 */
export const ReceiptExtractionSchema = z.object({
  merchant: z.string().optional(),
  amount: z.number().optional(),
  date: z.string().optional(),
});
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

/**
 * Phase 2.B.3 — Voice input. `transcript` is always populated (Speech-to-Text,
 * deterministic ASR) and shown verbatim to the user for transparency/review.
 * The structured fields are Gemini's best-effort extraction from that free
 * text — unlike 4.C's protected dollar figures, there's no "true number" to
 * guard here (the only source of truth is the spoken words themselves), so
 * this follows 4.D's precedent: genuinely needs an LLM, no deterministic
 * fallback. If Vertex AI isn't configured, `transcript` is still returned
 * (Speech-to-Text and Gemini are independent dependencies) with every
 * structured field omitted, so the user can still see what was heard and
 * type the rest manually rather than getting a hard error.
 */
export const VoiceExpenseDraftSchema = z.object({
  transcript: z.string(),
  amount: z.number().optional(),
  merchant: z.string().optional(),
  category: ExpenseCategorySchema.optional(),
  date: z.string().optional(),
});
export type VoiceExpenseDraft = z.infer<typeof VoiceExpenseDraftSchema>;

/** POST /expenses/extract-receipt body — an existing Vault item, not a fresh upload (see PHASES.md 2.B.2). */
export const ExtractReceiptInputSchema = z.object({
  vaultItemId: z.string(),
});
export type ExtractReceiptInput = z.infer<typeof ExtractReceiptInputSchema>;

/** POST /expenses/transcribe-voice body — a short recorded clip, base64-encoded. */
export const TranscribeVoiceInputSchema = z.object({
  audioBase64: z.string().min(1),
});
export type TranscribeVoiceInput = z.infer<typeof TranscribeVoiceInputSchema>;
