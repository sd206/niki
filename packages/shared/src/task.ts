import { z } from 'zod';

export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/** A task document, stored at families/{familyId}/tasks/{id}. */
export const TaskSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assignedTo: z.string().optional(), // uid, optional
  dueDate: z.string().optional(), // ISO date
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  // Optional link to a Phase 1.C Event this task belongs to (e.g. a
  // vacation's packing list). Unset for standalone tasks.
  eventId: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  priority: TaskPrioritySchema.default('medium'),
  eventId: z.string().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

/**
 * Any field may be updated by a caller with permission (see requireFamilyRole
 * gate in apps/api/src/routes/tasks.ts: assignee or role >= parent).
 */
export const UpdateTaskInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  eventId: z.string().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;
