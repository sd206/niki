import { Router } from 'express';
import {
  CreateExpenseInputSchema,
  UpdateExpenseInputSchema,
  ExtractReceiptInputSchema,
  TranscribeVoiceInputSchema,
  hasAtLeastRole,
  type Expense,
  type Role,
  type VaultItem,
  type ReceiptExtraction,
  type VoiceExpenseDraft,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';
import { fetchDriveFileBytes } from '../lib/driveFiles';
import { documentAiConfigured, parseReceipt } from '../lib/documentAi';
import { speechToTextConfigured, transcribeAudio } from '../lib/speechToText';
import { vertexAiConfigured, generateJson } from '../lib/vertexAi';
import { EXPENSE_CATEGORIES } from '@niki/shared';

/**
 * Mounted at /v1/families/:familyId/expenses (see index.ts) with
 * `{ mergeParams: true }`. 2.B.1 (manual entry) is unchanged below.
 * 2.B.2 (receipt OCR) and 2.B.3 (voice input) add two stateless POST
 * routes — extract-receipt and transcribe-voice — that never write an
 * Expense themselves; they only return a draft for the web/mobile UI to
 * pre-fill into the existing expense form, which the user reviews and
 * submits through the unchanged POST / below (now optionally tagging
 * `source: 'receipt' | 'voice'`).
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
      source: input.source ?? 'manual',
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

/**
 * POST /v1/families/:familyId/expenses/extract-receipt — body { vaultItemId }.
 * Runs Document AI over an *existing* Vault item's Drive bytes (fetched on
 * demand, never persisted — see fetchDriveFileBytes's doc comment for the
 * known same-family-different-uploader limitation). Returns whatever fields
 * Document AI extracted; never writes an Expense. 503 if Document AI isn't
 * configured (DOCUMENT_AI_PROCESSOR_ID unset), matching 4.B/4.D's fail-soft
 * pattern for optional AI infra.
 */
expensesRouter.post('/extract-receipt', async (req: ExpenseRequest, res, next) => {
  try {
    if (!documentAiConfigured) {
      throw new ApiError(503, 'Receipt scanning is not configured');
    }
    const { vaultItemId } = ExtractReceiptInputSchema.parse(req.body);
    const familyId = req.params.familyId;

    const itemSnap = await db.collection('families').doc(familyId).collection('vaultItems').doc(vaultItemId).get();
    if (!itemSnap.exists) {
      throw new ApiError(404, 'Vault item not found');
    }
    const item = itemSnap.data() as VaultItem;

    const { content, mimeType } = await fetchDriveFileBytes(req.uid!, item.driveFileId);
    const extraction: ReceiptExtraction = await parseReceipt(content, mimeType);
    return res.json(extraction);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Failed to extract receipt'));
  }
});

/**
 * POST /v1/families/:familyId/expenses/transcribe-voice — body { audioBase64 }.
 * Speech-to-Text gives the transcript (always returned, even if empty);
 * Gemini then best-effort extracts amount/merchant/category/date from that
 * transcript, same generateJson + zod-validate pattern as 4.B/4.C. Never
 * writes an Expense. 503 only if Speech-to-Text itself isn't configured —
 * if Vertex AI isn't configured, degrades to transcript-only rather than
 * failing the whole request, since transcription and structured-field
 * extraction are independent capabilities.
 */
expensesRouter.post('/transcribe-voice', async (req: ExpenseRequest, res, next) => {
  try {
    if (!speechToTextConfigured) {
      throw new ApiError(503, 'Voice input is not configured');
    }
    const { audioBase64 } = TranscribeVoiceInputSchema.parse(req.body);
    const transcript = await transcribeAudio(Buffer.from(audioBase64, 'base64'));

    const draft: VoiceExpenseDraft = { transcript };
    if (transcript && vertexAiConfigured) {
      try {
        const prompt = `Extract expense details from this voice transcript of someone logging a personal/family expense out loud. Transcript: "${transcript}"

Return ONLY a JSON object with these optional fields (omit any you can't confidently determine):
- amount (number, no currency symbol)
- merchant (string, who they paid)
- category (one of: ${EXPENSE_CATEGORIES.join(', ')})
- date (ISO yyyy-mm-dd — only if a specific date was mentioned, e.g. "yesterday"; omit if not mentioned, the user will default to today)`;
        const parsed = (await generateJson(prompt)) as Partial<VoiceExpenseDraft>;
        if (typeof parsed.amount === 'number') draft.amount = parsed.amount;
        if (typeof parsed.merchant === 'string') draft.merchant = parsed.merchant;
        if (typeof parsed.category === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(parsed.category)) {
          draft.category = parsed.category as VoiceExpenseDraft['category'];
        }
        if (typeof parsed.date === 'string') draft.date = parsed.date;
      } catch {
        // Structured extraction is a bonus on top of the transcript, which
        // the user can always read and act on manually — a Gemini failure
        // here must not turn into a failed request.
      }
    }
    return res.json(draft);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Failed to transcribe voice input'));
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
