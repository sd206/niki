import { z } from 'zod';

/** PRD-defined Memory types, per PHASES.md 3.B. */
export const MEMORY_TYPES = [
  'photo',
  'video',
  'story',
  'milestone',
  'achievement',
  'voice_note',
  'document',
] as const;
export const MemoryTypeSchema = z.enum(MEMORY_TYPES);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

/**
 * A memory, stored at families/{familyId}/memories/{id}. Same Drive-reference
 * pattern as Vault — Niki never touches file bytes, driveFileId/driveFileUrl
 * just point at a file the user already owns in their own Google Drive,
 * picked client-side via the Google Picker API. driveFileId is optional
 * because a 'story' memory can be pure text (title + description), with no
 * underlying file.
 */
export const MemorySchema = z.object({
  id: z.string(),
  familyId: z.string(),
  title: z.string().min(1).max(200),
  type: MemoryTypeSchema,
  driveFileId: z.string().optional(),
  driveFileUrl: z.string().optional(),
  eventId: z.string().optional(),
  date: z.string(),
  description: z.string().max(5000).optional(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemoryInputSchema = z.object({
  title: z.string().min(1).max(200),
  type: MemoryTypeSchema,
  driveFileId: z.string().optional(),
  driveFileUrl: z.string().optional(),
  eventId: z.string().optional(),
  date: z.string(),
  description: z.string().max(5000).optional(),
});
export type CreateMemoryInput = z.infer<typeof CreateMemoryInputSchema>;

export const UpdateMemoryInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: MemoryTypeSchema.optional(),
  driveFileId: z.string().optional(),
  driveFileUrl: z.string().optional(),
  eventId: z.string().optional(),
  date: z.string().optional(),
  description: z.string().max(5000).optional(),
});
export type UpdateMemoryInput = z.infer<typeof UpdateMemoryInputSchema>;
