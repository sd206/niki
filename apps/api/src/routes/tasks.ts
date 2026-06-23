import { Router } from 'express';
import {
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  hasAtLeastRole,
  type Task,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/tasks (see index.ts) with
 * `{ mergeParams: true }` so req.params.familyId is visible here and to
 * requireFamilyRole(), exactly like the nested invites route in families.ts.
 */
export const tasksRouter = Router({ mergeParams: true });
tasksRouter.use(authenticate);
// Any active member can list/create. Per-action checks (update/delete)
// re-check role against the specific task below.
tasksRouter.use(requireFamilyRole());

type TaskRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/tasks?status=&assignedTo= */
tasksRouter.get('/', async (req: TaskRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('tasks') as FirebaseFirestore.Query;

    const { status, assignedTo } = req.query;
    if (typeof status === 'string') {
      query = query.where('status', '==', status);
    }
    if (typeof assignedTo === 'string') {
      query = query.where('assignedTo', '==', assignedTo);
    }

    const snap = await query.get();
    return res.json(snap.docs.map((d) => d.data() as Task));
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/tasks — any active member can create. */
tasksRouter.post('/', async (req: TaskRequest, res, next) => {
  try {
    const input = CreateTaskInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const now = new Date().toISOString();

    const taskRef = db.collection('families').doc(familyId).collection('tasks').doc();
    const task: Task = {
      id: taskRef.id,
      familyId,
      title: input.title,
      description: input.description,
      assignedTo: input.assignedTo,
      dueDate: input.dueDate,
      status: 'todo',
      priority: input.priority,
      createdBy: req.uid!,
      createdAt: now,
      updatedAt: now,
    };
    await taskRef.set(task);

    return res.status(201).json(task);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/**
 * PATCH /v1/families/:familyId/tasks/:taskId
 * Allowed for: the assignee, the creator, or anyone role >= parent.
 * (Per PHASES.md: "assignee or owner/parent can update status" — extended
 * here to the creator too, since locking a member out of editing their own
 * just-created task would be a confusing MVP gap.)
 */
tasksRouter.patch('/:taskId', async (req: TaskRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const taskRef = db.collection('families').doc(familyId).collection('tasks').doc(req.params.taskId);
    const snap = await taskRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Task not found');
    }
    const task = snap.data() as Task;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = task.assignedTo === uid || task.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this task');
    }

    const input = UpdateTaskInputSchema.parse(req.body);
    const updates = { ...input, updatedAt: new Date().toISOString() };
    await taskRef.update(updates);

    return res.json({ ...task, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** DELETE /v1/families/:familyId/tasks/:taskId — creator or role >= parent. */
tasksRouter.delete('/:taskId', async (req: TaskRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const taskRef = db.collection('families').doc(familyId).collection('tasks').doc(req.params.taskId);
    const snap = await taskRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Task not found');
    }
    const task = snap.data() as Task;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = task.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this task');
    }

    await taskRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
