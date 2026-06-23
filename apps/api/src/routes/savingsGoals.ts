import { Router } from 'express';
import {
  CreateSavingsGoalInputSchema,
  UpdateSavingsGoalInputSchema,
  hasAtLeastRole,
  type SavingsGoal,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/savings-goals (see index.ts) with
 * `{ mergeParams: true }`. Part of Phase 2.B.1. Contributions are just a
 * PATCH bumping currentAmount — no separate transaction log in this phase.
 */
export const savingsGoalsRouter = Router({ mergeParams: true });
savingsGoalsRouter.use(authenticate);
savingsGoalsRouter.use(requireFamilyRole());

type SavingsGoalRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/savings-goals?eventId= */
savingsGoalsRouter.get('/', async (req: SavingsGoalRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('savingsGoals') as FirebaseFirestore.Query;

    const { eventId } = req.query;
    if (typeof eventId === 'string') {
      query = query.where('eventId', '==', eventId);
    }

    const snap = await query.get();
    return res.json(snap.docs.map((d) => d.data() as SavingsGoal));
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/savings-goals — any active member can create. */
savingsGoalsRouter.post('/', async (req: SavingsGoalRequest, res, next) => {
  try {
    const input = CreateSavingsGoalInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const now = new Date().toISOString();

    const goalRef = db.collection('families').doc(familyId).collection('savingsGoals').doc();
    const goal: SavingsGoal = {
      id: goalRef.id,
      familyId,
      name: input.name,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      targetDate: input.targetDate,
      eventId: input.eventId,
      createdBy: req.uid!,
      createdAt: now,
      updatedAt: now,
    };
    await goalRef.set(goal);

    return res.status(201).json(goal);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** PATCH /v1/families/:familyId/savings-goals/:goalId — creator or role >= parent. */
savingsGoalsRouter.patch('/:goalId', async (req: SavingsGoalRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const goalRef = db.collection('families').doc(familyId).collection('savingsGoals').doc(req.params.goalId);
    const snap = await goalRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Savings goal not found');
    }
    const goal = snap.data() as SavingsGoal;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = goal.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this savings goal');
    }

    const input = UpdateSavingsGoalInputSchema.parse(req.body);
    const updates = { ...input, updatedAt: new Date().toISOString() };
    await goalRef.update(updates);

    return res.json({ ...goal, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** DELETE /v1/families/:familyId/savings-goals/:goalId — creator or role >= parent. */
savingsGoalsRouter.delete('/:goalId', async (req: SavingsGoalRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const goalRef = db.collection('families').doc(familyId).collection('savingsGoals').doc(req.params.goalId);
    const snap = await goalRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Savings goal not found');
    }
    const goal = snap.data() as SavingsGoal;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = goal.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this savings goal');
    }

    await goalRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
