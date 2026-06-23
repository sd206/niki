import { Router } from 'express';
import {
  CreateBudgetInputSchema,
  UpdateBudgetInputSchema,
  hasAtLeastRole,
  type Budget,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/budgets (see index.ts) with
 * `{ mergeParams: true }` — same pattern as tasksRouter/eventsRouter/etc.
 * Part of Phase 2.B.1 (manual-entry Finance Hub slice).
 */
export const budgetsRouter = Router({ mergeParams: true });
budgetsRouter.use(authenticate);
budgetsRouter.use(requireFamilyRole());

type BudgetRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/budgets?eventId= — any active member. */
budgetsRouter.get('/', async (req: BudgetRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('budgets') as FirebaseFirestore.Query;

    const { eventId } = req.query;
    if (typeof eventId === 'string') {
      query = query.where('eventId', '==', eventId);
    }

    const snap = await query.get();
    return res.json(snap.docs.map((d) => d.data() as Budget));
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/budgets — any active member can create. */
budgetsRouter.post('/', async (req: BudgetRequest, res, next) => {
  try {
    const input = CreateBudgetInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const now = new Date().toISOString();

    const budgetRef = db.collection('families').doc(familyId).collection('budgets').doc();
    const budget: Budget = {
      id: budgetRef.id,
      familyId,
      name: input.name,
      period: input.period,
      startDate: input.startDate,
      endDate: input.endDate,
      eventId: input.eventId,
      categoryAllocations: input.categoryAllocations,
      createdBy: req.uid!,
      createdAt: now,
      updatedAt: now,
    };
    await budgetRef.set(budget);

    return res.status(201).json(budget);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** PATCH /v1/families/:familyId/budgets/:budgetId — creator or role >= parent. */
budgetsRouter.patch('/:budgetId', async (req: BudgetRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const budgetRef = db.collection('families').doc(familyId).collection('budgets').doc(req.params.budgetId);
    const snap = await budgetRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Budget not found');
    }
    const budget = snap.data() as Budget;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = budget.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this budget');
    }

    const input = UpdateBudgetInputSchema.parse(req.body);
    const updates = { ...input, updatedAt: new Date().toISOString() };
    await budgetRef.update(updates);

    return res.json({ ...budget, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** DELETE /v1/families/:familyId/budgets/:budgetId — creator or role >= parent. */
budgetsRouter.delete('/:budgetId', async (req: BudgetRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const budgetRef = db.collection('families').doc(familyId).collection('budgets').doc(req.params.budgetId);
    const snap = await budgetRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Budget not found');
    }
    const budget = snap.data() as Budget;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = budget.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this budget');
    }

    await budgetRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
