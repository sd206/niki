import { GoogleAuth } from 'google-auth-library';

/**
 * Thin REST wrapper around a Document AI "Expense Parser" / "Receipt
 * Parser" processor — same no-extra-SDK pattern as vertexAi.ts (Node 20's
 * global `fetch` + google-auth-library ADC).
 *
 * Document AI's prebuilt receipt/expense processors already return typed,
 * structured entities (supplier_name, total_amount, receipt_date, ...) —
 * unlike 4.D's free-text summarization, there's a real "ground truth" here
 * (the receipt's printed total), so mapping those entities to our schema is
 * plain deterministic code, no LLM involved. Same "deterministic where
 * possible" principle as 4.C.
 *
 * Requires a processor created in the Document AI console (Expense Parser
 * is the recommended processor type for receipts) — see PHASES.md's 2.B.2
 * setup steps for exact gcloud/console steps.
 */
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
const LOCATION = process.env.DOCUMENT_AI_LOCATION || 'us';
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;

/** False when no processor is configured — callers should fail soft (503), not throw on every request. */
export const documentAiConfigured = Boolean(PROJECT_ID && PROCESSOR_ID);

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to obtain Document AI access token');
  return token.token;
}

export type ReceiptExtraction = {
  merchant?: string;
  amount?: number;
  date?: string; // ISO yyyy-mm-dd if Document AI normalized it, else undefined
};

type DocumentAiEntity = {
  type?: string;
  mentionText?: string;
  normalizedValue?: { text?: string; moneyValue?: { units?: string; nanos?: number } };
};

/** Pulls the first entity of `type` out of Document AI's flat entity list. */
function findEntity(entities: DocumentAiEntity[], type: string): DocumentAiEntity | undefined {
  return entities.find((e) => e.type === type);
}

function parseAmount(entity: DocumentAiEntity | undefined): number | undefined {
  if (!entity) return undefined;
  const money = entity.normalizedValue?.moneyValue;
  if (money?.units !== undefined) {
    const units = Number(money.units);
    const nanos = money.nanos ?? 0;
    return Math.round((units + nanos / 1e9) * 100) / 100;
  }
  const text = entity.normalizedValue?.text ?? entity.mentionText;
  if (!text) return undefined;
  const cleaned = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(cleaned) ? cleaned : undefined;
}

/**
 * Runs Document AI's receipt/expense processor over `content` and maps the
 * result onto our schema. Returns whichever fields Document AI was
 * confident enough to extract — partial results (e.g. amount but no
 * merchant) are expected and fine; the web/mobile UI pre-fills a draft for
 * the user to review and complete, never auto-saves (see expenses.ts).
 */
export async function parseReceipt(content: Buffer, mimeType: string): Promise<ReceiptExtraction> {
  if (!documentAiConfigured) {
    throw new Error('Document AI is not configured (set GOOGLE_CLOUD_PROJECT and DOCUMENT_AI_PROCESSOR_ID)');
  }
  const token = await getAccessToken();
  const url = `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}:process`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawDocument: { content: content.toString('base64'), mimeType },
    }),
  });
  if (!res.ok) {
    throw new Error(`Document AI request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { document?: { entities?: DocumentAiEntity[] } };
  const entities = data.document?.entities ?? [];

  const merchantEntity = findEntity(entities, 'supplier_name');
  const amountEntity = findEntity(entities, 'total_amount');
  const dateEntity = findEntity(entities, 'receipt_date');

  return {
    merchant: merchantEntity?.mentionText,
    amount: parseAmount(amountEntity),
    date: dateEntity?.normalizedValue?.text ?? undefined,
  };
}
