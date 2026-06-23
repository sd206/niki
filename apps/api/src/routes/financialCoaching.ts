import { Router } from 'express';
import type { Budget, Expense, SavingsGoal, OverspendingAlert, SavingsRecommendation } from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { generateJson, vertexAiConfigured } from '../lib/vertexAi';

/**
 * Mounted at /v1/families/:familyId/finance/coaching (see index.ts) with
 * `{ mergeParams: true }`. Phase 4.C — financial coaching: overspending
 * alerts and savings recommendations.
 *
 * Deliberately split responsibilities: every NUMBER here (allocated, spent,
 * overBy, suggestedMonthlyContribution) is computed in plain TypeScript from
 * real Budget/Expense/SavingsGoal Firestore data — never handed to an LLM to
 * calculate, so there's no risk of a hallucinated dollar figure. Gemini (if
 * configured) is only asked to phrase a short natural-language `summary` on
 * top of the already-computed facts; if that call fails or Vertex AI isn't
 * configured, a template-generated summary is used instead. This endpoint
 * never writes anything — pure read-only report, no Tasks/Budgets created.
 */
export const financialCoachingRouter = Router({ mergeParams: true });
financialCoachingRouter.use(authenticate);
financialCoachingRouter.use(requireFamilyRole());

function computeAlerts(budgets: Budget[], expenses: Expense[]): OverspendingAlert[] {
  const alerts: OverspendingAlert[] = [];
  for (const budget of budgets) {
    const spentByCategory = new Map<string, number>();
    for (const ex of expenses) {
      if (ex.budgetId !== budget.id) continue;
      spentByCategory.set(ex.category, (spentByCategory.get(ex.category) ?? 0) + ex.amount);
    }
    for (const [category, allocated] of Object.entries(budget.categoryAllocations)) {
      const spent = spentByCategory.get(category) ?? 0;
      if (spent > allocated) {
        const overBy = Math.round((spent - allocated) * 100) / 100;
        alerts.push({
          budgetId: budget.id,
          budgetName: budget.name,
          category: category as OverspendingAlert['category'],
          allocated,
          spent,
          overBy,
          message: `"${budget.name}" is $${overBy.toFixed(2)} over its ${category} allocation ($${spent.toFixed(2)} spent vs $${allocated.toFixed(2)} budgeted).`,
        });
      }
    }
  }
  return alerts;
}

function computeRecommendations(goals: SavingsGoal[]): SavingsRecommendation[] {
  const recommendations: SavingsRecommendation[] = [];
  const now = new Date();
  for (const goal of goals) {
    const remaining = goal.targetAmount - goal.currentAmount;
    if (remaining <= 0) continue; // goal already met

    let suggestedMonthlyContribution: number | undefined;
    let message: string;

    if (goal.targetDate) {
      const target = new Date(goal.targetDate);
      const monthsRemaining = Math.max(
        1,
        (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()),
      );
      suggestedMonthlyContribution = Math.round((remaining / monthsRemaining) * 100) / 100;
      message = `To reach "${goal.name}" ($${goal.targetAmount.toFixed(2)}) by ${goal.targetDate}, save about $${suggestedMonthlyContribution.toFixed(2)}/month.`;
    } else {
      message = `"${goal.name}" is $${remaining.toFixed(2)} away from its $${goal.targetAmount.toFixed(2)} target — no target date set yet to pace contributions against.`;
    }

    recommendations.push({
      goalId: goal.id,
      goalName: goal.name,
      message,
      suggestedMonthlyContribution,
    });
  }
  return recommendations;
}

function defaultSummary(alerts: OverspendingAlert[], recommendations: SavingsRecommendation[]): string {
  if (alerts.length === 0 && recommendations.length === 0) {
    return "You're on track — no overspending detected and no savings goals need attention right now.";
  }
  const parts: string[] = [];
  if (alerts.length > 0) {
    parts.push(`${alerts.length} budget categor${alerts.length === 1 ? 'y is' : 'ies are'} over allocation`);
  }
  if (recommendations.length > 0) {
    parts.push(`${recommendations.length} savings goal${recommendations.length === 1 ? '' : 's'} could use a contribution plan`);
  }
  return `${parts.join(' and ')}.`;
}

const SUMMARY_PROMPT = (alerts: OverspendingAlert[], recommendations: SavingsRecommendation[]) => `You are a friendly
family financial coach. Below are ALREADY-COMPUTED facts (do not recalculate
or alter any numbers). Write ONLY a JSON object of the exact shape
{ "summary": string } containing a short (1-3 sentence), warm, encouraging
but honest summary of the family's financial situation based on these facts.
No markdown, no commentary, just the JSON object.

Overspending alerts:
${JSON.stringify(alerts, null, 2)}

Savings recommendations:
${JSON.stringify(recommendations, null, 2)}`;

/** GET /v1/families/:familyId/finance/coaching */
financialCoachingRouter.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const familyRef = db.collection('families').doc(familyId);

    const [budgetsSnap, expensesSnap, goalsSnap] = await Promise.all([
      familyRef.collection('budgets').get(),
      familyRef.collection('expenses').get(),
      familyRef.collection('savingsGoals').get(),
    ]);

    const budgets = budgetsSnap.docs.map((d) => d.data() as Budget);
    const expenses = expensesSnap.docs.map((d) => d.data() as Expense);
    const goals = goalsSnap.docs.map((d) => d.data() as SavingsGoal);

    const alerts = computeAlerts(budgets, expenses);
    const recommendations = computeRecommendations(goals);

    let summary = defaultSummary(alerts, recommendations);
    if (vertexAiConfigured) {
      try {
        const raw = (await generateJson(SUMMARY_PROMPT(alerts, recommendations))) as { summary?: unknown };
        if (typeof raw?.summary === 'string' && raw.summary.trim()) {
          summary = raw.summary.trim();
        }
      } catch (err) {
        console.error('[financial-coaching] Gemini summary failed, using default summary', err);
      }
    }

    return res.json({ alerts, recommendations, summary });
  } catch (err) {
    next(err);
  }
});
