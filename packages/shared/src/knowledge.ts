import { z } from 'zod';

/** PRD-defined Knowledge Hub content types, per PHASES.md 3.A. */
export const KNOWLEDGE_CONTENT_TYPES = [
  'recipe',
  'instructions',
  'tradition',
  'emergency_plan',
  'reference',
  'idea',
] as const;
export const KnowledgeContentTypeSchema = z.enum(KNOWLEDGE_CONTENT_TYPES);
export type KnowledgeContentType = z.infer<typeof KnowledgeContentTypeSchema>;

/**
 * A knowledge entry, stored at families/{familyId}/knowledge/{id}.
 * `body` is plain rich text (markdown-ish, rendered as-is) for this phase —
 * no linked-doc/Drive-reference variant yet, unlike Vault/Memories. Search
 * here is basic tag/title matching; AI-powered semantic search is Phase 4.D.
 */
export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  familyId: z.string(),
  title: z.string().min(1).max(200),
  contentType: KnowledgeContentTypeSchema,
  body: z.string().max(20000),
  tags: z.array(z.string().min(1).max(50)),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

export const CreateKnowledgeEntryInputSchema = z.object({
  title: z.string().min(1).max(200),
  contentType: KnowledgeContentTypeSchema.default('reference'),
  body: z.string().max(20000),
  tags: z.array(z.string().min(1).max(50)).default([]),
});
export type CreateKnowledgeEntryInput = z.infer<typeof CreateKnowledgeEntryInputSchema>;

export const UpdateKnowledgeEntryInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  contentType: KnowledgeContentTypeSchema.optional(),
  body: z.string().max(20000).optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
});
export type UpdateKnowledgeEntryInput = z.infer<typeof UpdateKnowledgeEntryInputSchema>;
