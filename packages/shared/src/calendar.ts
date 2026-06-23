import { z } from 'zod';

/**
 * PRD-defined calendar entry types, plus 'event' — not in the PRD's literal
 * list, but needed here because Phase 1.C Events are surfaced on the
 * calendar as derived entries (see GET /calendar in apps/api) and need a
 * type distinct from 'task'/'appointment' to render correctly.
 */
export const CALENDAR_ENTRY_TYPES = [
  'birthday',
  'task',
  'event',
  'appointment',
  'trip',
  'school',
  'reminder',
  'deadline',
] as const;
export const CalendarEntryTypeSchema = z.enum(CALENDAR_ENTRY_TYPES);
export type CalendarEntryType = z.infer<typeof CalendarEntryTypeSchema>;

/**
 * A real (user-created) calendar entry, stored at
 * families/{familyId}/calendarEntries/{id}.
 *
 * Tasks (dueDate) and Events (startDate/endDate) are NOT duplicated into
 * this collection — they're merged in at read time by the API (derived,
 * not stored, per PHASES.md 2.A). Derived entries use a synthetic id of
 * the form `task:{taskId}` / `event:{eventId}` and are not persisted here.
 */
export const CalendarEntrySchema = z.object({
  id: z.string(),
  familyId: z.string(),
  title: z.string().min(1).max(200),
  date: z.string(), // ISO date — this model has no time-of-day, matching Task.dueDate/Event.startDate
  type: CalendarEntryTypeSchema,
  linkedTaskId: z.string().optional(),
  linkedEventId: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;

export const CreateCalendarEntryInputSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string(),
  type: CalendarEntryTypeSchema.default('reminder'),
  linkedTaskId: z.string().optional(),
  linkedEventId: z.string().optional(),
});
export type CreateCalendarEntryInput = z.infer<typeof CreateCalendarEntryInputSchema>;

export const UpdateCalendarEntryInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  date: z.string().optional(),
  type: CalendarEntryTypeSchema.optional(),
  linkedTaskId: z.string().optional(),
  linkedEventId: z.string().optional(),
});
export type UpdateCalendarEntryInput = z.infer<typeof UpdateCalendarEntryInputSchema>;
