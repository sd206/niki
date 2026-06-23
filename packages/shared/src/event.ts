import { z } from 'zod';

/**
 * PRD-defined event templates, plus 'custom' for anything else. Kept as a
 * union of literals + free text (via .or(z.string())) so the picker can
 * suggest templates without blocking arbitrary event types.
 */
export const EVENT_TEMPLATES = [
  'vacation',
  'wedding',
  'college',
  'home_purchase',
  'moving',
  'birthday',
  'custom',
] as const;
export const EventTypeSchema = z.enum(EVENT_TEMPLATES);
export type EventType = z.infer<typeof EventTypeSchema>;

/** An event document, stored at families/{familyId}/events/{id}. */
export const EventSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  title: z.string().min(1).max(200),
  type: EventTypeSchema,
  startDate: z.string(), // ISO date
  endDate: z.string().optional(), // ISO date
  description: z.string().max(2000).optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Event = z.infer<typeof EventSchema>;

export const CreateEventInputSchema = z.object({
  title: z.string().min(1).max(200),
  type: EventTypeSchema.default('custom'),
  startDate: z.string(),
  endDate: z.string().optional(),
  description: z.string().max(2000).optional(),
});
export type CreateEventInput = z.infer<typeof CreateEventInputSchema>;

export const UpdateEventInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: EventTypeSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().max(2000).optional(),
});
export type UpdateEventInput = z.infer<typeof UpdateEventInputSchema>;
