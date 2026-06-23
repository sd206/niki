import { z } from 'zod';

/**
 * Per PHASES.md 2.B, this phase (2.B.1) ships manual expense entry only.
 * Receipt OCR (2.B.2, Document AI) and voice input (2.B.3, Speech-to-Text)
 * are deferred follow-up phases. The `source` enum is modeled per the PRD's
 * full data shape now so Expense.source doesn't need a breaking migration
 * later — but CreateExpenseInputSchema (below) only allows 'manual', and
 * the API only ever writes 'manual' for now.
 */
export const EXPENSE_SOURCES = ['manual', 'receipt', 'voice'] as const;
export const ExpenseSourceSchema = z.enum(EXPENSE_SOURCES);
export type ExpenseSource = z.infer<typeof ExpenseSourceSchema>;

export const EXPENSE_CATEGORIES = [
  'housing', 'transportation', 'food', 'utilities', 'healthcare',
  'childcare', 'education', 'entertainment', 'shopping', 'travel',
  'debt', 'savings', 'insurance', 'gifts', 'other',
] as const;
export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const BUDGET_PERIODS = ['monthly', 'yearly', 'custom', 'event'] as const;
export const BudgetPeriodSchema = z.enum(BUDGET_PERIODS);
export type BudgetPeriod = z.infer<typeof BudgetPeriodSchema>;

/**
 * A budget, stored at families/{familyId}/budgets/{id}. Either a recurring
 * family budget (period 'monthly'/'yearly', no eventId) or a one-off
 * budget scoped to a Phase 1.C Event (period 'event', eventId required) —
 * e.g. a vacation budget. 'custom' covers an arbitrary date range that
 * isn't tied to an event (startDate/endDate required).
 *
 * categoryAllocations maps ExpenseCategory -> allocated amount (in the
 * family's currency's smallest display unit is NOT used here — this is a
 * plain decimal number, e.g. 450.00, matching Expense.amount).
 */
export const BudgetSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  name: z.string().min(1).max(200),
  period: BudgetPeriodSchema,
  startDate: z.string().optional(), // ISO date — required for 'custom'/'event' periods, validated in API
  endDate: z.string().optional(),
  eventId: z.string().optional(), // required when period === 'event'
  categoryAllocations: z.record(ExpenseCategorySchema, z.number().nonnegative()),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const CreateBudgetInputSchema = z.object({
  name: z.string().min(1).max(200),
  period: BudgetPeriodSchema,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  eventId: z.string().optional(),
  categoryAllocations: z.record(ExpenseCategorySchema, z.number().nonnegative()).default({}),
});
export type CreateBudgetInput = z.infer<typeof CreateBudgetInputSchema>;

export const UpdateBudgetInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  period: BudgetPeriodSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  eventId: z.string().optional(),
  categoryAllocations: z.record(ExpenseCategorySchema, z.number().nonnegative()).optional(),
});
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetInputSchema>;

/**
 * An expense, stored at families/{familyId}/expenses/{id}. This phase
 * (2.B.1) only supports source: 'manual' — see note above EXPENSE_SOURCES.
 * `receiptVaultItemId` optionally links to a Phase 1.D Vault item (e.g. a
 * photographed receipt the user separately added to Vault); it's not
 * populated automatically since OCR isn't wired up yet.
 */
export const ExpenseSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  amount: z.number().positive(),
  merchant: z.string().min(1).max(200),
  date: z.string(), // ISO date
  category: ExpenseCategorySchema,
  source: ExpenseSourceSchema,
  budgetId: z.string().optional(),
  receiptVaultItemId: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const CreateExpenseInputSchema = z.object({
  amount: z.number().positive(),
  merchant: z.string().min(1).max(200),
  date: z.string(),
  category: ExpenseCategorySchema.default('other'),
  budgetId: z.string().optional(),
  receiptVaultItemId: z.string().optional(),
  // No `source` field here — the API always writes 'manual' for this phase.
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseInputSchema>;

export const UpdateExpenseInputSchema = z.object({
  amount: z.number().positive().optional(),
  merchant: z.string().min(1).max(200).optional(),
  date: z.string().optional(),
  category: ExpenseCategorySchema.optional(),
  budgetId: z.string().optional(),
  receiptVaultItemId: z.string().optional(),
});
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseInputSchema>;

/**
 * A savings goal, stored at families/{familyId}/savingsGoals/{id}.
 * currentAmount is updated via PATCH (e.g. after a manual contribution) —
 * there's no separate "contribute" transaction log in this phase.
 */
export const SavingsGoalSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  name: z.string().min(1).max(200),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative(),
  targetDate: z.string().optional(),
  eventId: z.string().optional(), // e.g. saving toward a Phase 1.C trip/event
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavingsGoal = z.infer<typeof SavingsGoalSchema>;

export const CreateSavingsGoalInputSchema = z.object({
  name: z.string().min(1).max(200),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative().default(0),
  targetDate: z.string().optional(),
  eventId: z.string().optional(),
});
export type CreateSavingsGoalInput = z.infer<typeof CreateSavingsGoalInputSchema>;

export const UpdateSavingsGoalInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().nonnegative().optional(),
  targetDate: z.string().optional(),
  eventId: z.string().optional(),
});
export type UpdateSavingsGoalInput = z.infer<typeof UpdateSavingsGoalInputSchema>;
