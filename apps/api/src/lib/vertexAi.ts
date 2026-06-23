import { GoogleAuth } from 'google-auth-library';

/**
 * Thin REST wrapper around two Vertex AI publisher models — no extra SDK
 * dependency needed since google-auth-library is already a dependency
 * (used elsewhere for OAuth) and Node 20's global `fetch` covers the rest.
 *
 * - embedText(): text-embedding model, used to index Knowledge/Task content
 *   for Phase 4.A semantic search (see vectorSearch.ts).
 * - generateJson(): Gemini, used for the Phase 4.B event planning assistant.
 *
 * Auth: on Cloud Run, the attached service account + the
 * 'https://www.googleapis.com/auth/cloud-platform' scope are enough for
 * GoogleAuth to auto-discover credentials, same pattern as firebaseAdmin.ts.
 * Locally, GOOGLE_APPLICATION_CREDENTIALS must point at a service account
 * key with the Vertex AI User IAM role.
 */
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const EMBEDDING_MODEL = process.env.VERTEX_AI_EMBEDDING_MODEL || 'text-embedding-004';
const GEMINI_MODEL = process.env.VERTEX_AI_GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * False when no GCP project is configured (e.g. a bare local dev box with
 * no GOOGLE_CLOUD_PROJECT/FIREBASE_PROJECT_ID set) — callers should check
 * this before calling embedText/generateJson so Phase 4 features degrade
 * gracefully instead of throwing on every request.
 */
export const vertexAiConfigured = Boolean(PROJECT_ID);

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to obtain Vertex AI access token');
  return token.token;
}

function modelEndpoint(model: string, method: string): string {
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:${method}`;
}

/** Embeds free text into a vector via Vertex AI's text-embedding model. */
export async function embedText(text: string): Promise<number[]> {
  if (!vertexAiConfigured) {
    throw new Error('Vertex AI is not configured (set GOOGLE_CLOUD_PROJECT)');
  }
  const token = await getAccessToken();
  const res = await fetch(modelEndpoint(EMBEDDING_MODEL, 'predict'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // Vertex AI's embedding models cap input length; truncating here is a
    // pragmatic MVP choice over chunking (Knowledge bodies cap at 20k chars).
    body: JSON.stringify({ instances: [{ content: text.slice(0, 8000) }] }),
  });
  if (!res.ok) {
    throw new Error(`Vertex AI embedding request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    predictions?: Array<{ embeddings?: { values?: number[] } }>;
  };
  const values = data.predictions?.[0]?.embeddings?.values;
  if (!values) throw new Error('Vertex AI embedding response missing values');
  return values;
}

/**
 * Calls Gemini and parses its response as JSON. Caller is responsible for
 * validating the parsed shape (e.g. with a zod schema) since Gemini's JSON
 * mode is best-effort, not a hard schema guarantee.
 */
export async function generateJson(prompt: string): Promise<unknown> {
  if (!vertexAiConfigured) {
    throw new Error('Vertex AI is not configured (set GOOGLE_CLOUD_PROJECT)');
  }
  const token = await getAccessToken();
  const res = await fetch(modelEndpoint(GEMINI_MODEL, 'generateContent'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Vertex AI Gemini request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Vertex AI Gemini response missing text');
  return JSON.parse(text);
}
