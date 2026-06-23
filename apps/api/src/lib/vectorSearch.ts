import { GoogleAuth } from 'google-auth-library';

/**
 * Thin REST wrapper around a Vertex AI Vector Search (Matching Engine)
 * index + deployed index endpoint. Set up via the GCP console/gcloud (see
 * the Phase 4 setup notes in PHASES.md) — this module only talks to
 * resources that already exist; it does not create them.
 *
 * Datapoint IDs are namespaced as `${type}:${id}` (e.g. `knowledge:abc123`)
 * so a single shared index can hold multiple Firestore collections' worth
 * of embeddings. Each datapoint also carries a `familyId` restrict so
 * findNeighbors() never returns another family's data.
 */
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const INDEX_ID = process.env.VECTOR_SEARCH_INDEX_ID;
const INDEX_ENDPOINT_ID = process.env.VECTOR_SEARCH_INDEX_ENDPOINT_ID;
const DEPLOYED_INDEX_ID = process.env.VECTOR_SEARCH_DEPLOYED_INDEX_ID;

/**
 * False until all four Vector Search env vars are set. Callers (see
 * searchIndexing.ts) use this to no-op gracefully rather than throwing, so
 * Knowledge/Task CRUD and the rest of the app keep working before this
 * infra is provisioned.
 */
export const vectorSearchConfigured = Boolean(PROJECT_ID && INDEX_ID && INDEX_ENDPOINT_ID && DEPLOYED_INDEX_ID);

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to obtain Vector Search access token');
  return token.token;
}

function aiplatformUrl(path: string): string {
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}${path}`;
}

export interface IndexableItem {
  type: string;
  id: string;
  familyId: string;
}

/**
 * Upserts (inserts or replaces) a single embedding datapoint. Throws on
 * failure — callers in searchIndexing.ts catch and log rather than letting
 * an indexing failure break the Knowledge/Task write that triggered it.
 */
export async function upsertEmbedding(item: IndexableItem, embedding: number[]): Promise<void> {
  if (!vectorSearchConfigured) return;
  const token = await getAccessToken();
  const res = await fetch(aiplatformUrl(`/indexes/${INDEX_ID}:upsertDatapoints`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      datapoints: [
        {
          datapointId: `${item.type}:${item.id}`,
          featureVector: embedding,
          restricts: [
            { namespace: 'familyId', allowList: [item.familyId] },
            { namespace: 'type', allowList: [item.type] },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Vector Search upsert failed: ${res.status} ${await res.text()}`);
  }
}

/** Removes a single datapoint, e.g. when its source Knowledge entry/Task is deleted. */
export async function removeEmbedding(item: Pick<IndexableItem, 'type' | 'id'>): Promise<void> {
  if (!vectorSearchConfigured) return;
  const token = await getAccessToken();
  const res = await fetch(aiplatformUrl(`/indexes/${INDEX_ID}:removeDatapoints`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ datapointIds: [`${item.type}:${item.id}`] }),
  });
  if (!res.ok) {
    throw new Error(`Vector Search remove failed: ${res.status} ${await res.text()}`);
  }
}

export interface NeighborResult {
  type: string;
  id: string;
  distance: number;
}

/**
 * Finds the nearest neighbors to a query embedding, restricted to one
 * family via the same 'familyId' restrict namespace used in upsertEmbedding.
 * Returns [] (rather than throwing) if Vector Search isn't configured, so
 * the search route can fall back to "no results yet" instead of erroring.
 */
export async function findNeighbors(
  embedding: number[],
  familyId: string,
  neighborCount = 10,
): Promise<NeighborResult[]> {
  if (!vectorSearchConfigured) return [];
  const token = await getAccessToken();
  const res = await fetch(aiplatformUrl(`/indexEndpoints/${INDEX_ENDPOINT_ID}:findNeighbors`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deployedIndexId: DEPLOYED_INDEX_ID,
      queries: [
        {
          datapoint: { datapointId: 'query', featureVector: embedding },
          neighborCount,
          restricts: [{ namespace: 'familyId', allowList: [familyId] }],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Vector Search findNeighbors failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    nearestNeighbors?: Array<{
      neighbors?: Array<{ datapoint?: { datapointId?: string }; distance?: number }>;
    }>;
  };
  const neighbors = data.nearestNeighbors?.[0]?.neighbors ?? [];
  const results: NeighborResult[] = [];
  for (const n of neighbors) {
    const datapointId = n.datapoint?.datapointId;
    if (!datapointId) continue;
    const separatorIndex = datapointId.indexOf(':');
    if (separatorIndex < 0) continue;
    results.push({
      type: datapointId.slice(0, separatorIndex),
      id: datapointId.slice(separatorIndex + 1),
      distance: n.distance ?? 0,
    });
  }
  return results;
}
