import { Router } from 'express';
import {
  CreateExpenseInputSchema,
  UpdateExpenseInputSchema,
  hasAtLeastRole,
  type Expense,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/expenses (see index.ts) with
 * `{ mergeParams: true }`. Part of Phase 2.B.1 — manual entry only. Every
 * expense created here is written with source: 'manual' regardless of
 * request body; receipt OCR (2.B.2) and voice input (2.B.3) are deferred
 * and will set 'receipt'/'voice' once that infra exists.
 */
export const expensesRouter = Router({ mergeParams: true });
expensesRouter.use(authenticate);
expensesRouter.use(requireFamilyRole());

type ExpenseRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/expenses?budgetId=&category=&from=&to= */
expensesRouter.get('/', async (req: ExpenseRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('expenses') as FirebaseFirestore.Query;

    const { budgetId, category, from, to } = req.query as {
      budgetId?: string;
      category?: string;
      from?: string;
      to?: string;
    };
    if (typeof budgetId === 'string') query = query.where('budgetId', '==', budgetId);
    if (typeof category === 'string') query = query.where('category', '==', category);
    if (typeof from === 'string') query = query.where('date', '>=', from);
    if (typeof to === 'string') query = query.where('date', '<=', to);

    const snap = await query.get();
    const expenses = snap.docs.map((d) => d.data() as Expense).sort((a, b) => b.date.localeCompare(a.date));
    return res.json(expenses);
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/expenses — any active member can log an expense. */
expensesRouter.post('/', async (req: ExpenseRequest, res, next) => {
  try {
    const input = CreateExpenseInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const now = new Date().toISOString();

    const expenseRef = db.collection('families').doc(familyId).collection('expenses').doc();
    const expense: Expense = {
      id: expenseRef.id,
      familyId,
      amount: input.amount,
      merchant: input.merchant,
      date: input.date,
      category: input.category,
      source: 'manual',
      budgetId: input.budgetId,
      receiptVaultItemId: input.receiptVaultItemId,
      createdBy: req.uid!,
      createdAt: now,
      updatedAt: now,
    };
    await expenseRef.set(expense);

    return res.status(201).json(expense);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** PATCH /v1/families/:familyId/expenses/:expenseId — creator or role >= parent. */
expensesRouter.patch('/:expenseId', async (req: ExpenseRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const expenseRef = db.collection('families').doc(familyId).collection('expenses').doc(req.params.expenseId);
    const snap = await expenseRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Expense not found');
    }
    const expense = snap.data() as Expense;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = expense.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to update this expense');
    }

    const input = UpdateExpenseInputSchema.parse(req.body);
    const updates = { ...input, updatedAt: new Date().toISOString() };
    await expenseRef.update(updates);

    return res.json({ ...expense, ...updates });
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** DELETE /v1/families/:familyId/expenses/:expenseId — creator or role >= parent. */
expensesRouter.delete('/:expenseId', async (req: ExpenseRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const expenseRef = db.collection('families').doc(familyId).collection('expenses').doc(req.params.expenseId);
    const snap = await expenseRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Expense not found');
    }
    const expense = snap.data() as Expense;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = expense.createdBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this expense');
    }

    await expenseRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
