# Niki — Build Roadmap

This is the living reference for what's built, what's next, and how each
phase breaks down into shippable milestones. Update this file as phases
complete or scope changes — don't let it drift from reality.

## Stack note (deviation from the original PRD) — DECIDED, closed

The original PRD's "Technical Architecture" section specifies FastAPI/Python,
PostgreSQL/Cloud SQL, and pgvector. What's actually built and deployed is
**Express/Node + Firestore** (see `SETUP.md`, `apps/api`), and this is the
permanent backbone for the app, not a placeholder.

This was revisited deliberately after Phase 0 shipped (2026-06-22) and
decided against switching, for two reasons:

1. **Vector search no longer requires Postgres.** Firestore now has native
   vector search (vector indexes + `findNearest` queries) directly in the
   Admin SDK. This was the strongest original reason for pgvector, and it's
   gone — Phase 4 search/AI can be built on Firestore directly.
2. **Firestore's document/subcollection model fits this app's actual shape.**
   Family → members/tasks/events/vaultItems as subcollections is exactly
   what Firestore is good at, with less ORM ceremony than a relational
   schema would need for the same hierarchy.

The one remaining case where relational modeling is genuinely a better fit
is Finance Hub's reporting layer (Phase 2.B) — category rollups, monthly
forecasts, budget-vs-actual aggregation. If and when Firestore aggregation
queries prove insufficient there in practice, the fix is a **targeted
addition** (e.g., a Postgres or BigQuery reporting store fed from Firestore,
scoped only to Finance Hub analytics) — not a rewrite of auth, families,
tasks, events, or vault, which have no relational need and stay on
Firestore permanently. Do not re-litigate the core stack choice without a
concrete, demonstrated failure case driving it.

Everything else in this roadmap assumes the current stack: Express API on
Cloud Run, Next.js web, Expo/React Native mobile, Firestore, Secret Manager
for credentials, Firebase Auth, Firebase Hosting rewrites for same-origin
API calls.

---

## Phase 0 — Foundation (COMPLETE)

- GCP project, IAM, Cloud Build → Cloud Run → Firebase Hosting pipeline
  (including GitHub Actions CI/CD via Workload Identity Federation)
- Firebase Auth (Google Sign-In) on web + mobile
- Firestore schema: `User`, `Family`, `Member`, `Invite`
- Family creation + invite-by-code accept (API done; invite UI not yet
  built — see Phase 1 note below)
- Google Drive OAuth connect flow (per-user refresh token in Secret Manager)
- Verified end-to-end on web: sign-in → profile → Drive connect → family
  creation. Mobile sign-in verified locally; full mobile parity pending
  same-network/tunnel testing.

---

## Phase 1 — Vault, Events, Tasks

Scope decision pending with you: build order and MVP-vs-full-feature depth
per module. Proposed granular breakdown below — each milestone is sized to
be built, deployed, and manually verified independently, the same way
Phase 0 went.

### 1.A — Family Invites UI (carry-over from Phase 0) (SHIPPED)

The API (`POST /v1/families/:id/invites`, `POST /v1/invites/:code/accept`)
already exists with no UI. Small, fast, unblocks "Invite Members" being a
real flow before Vault/Events/Tasks need to reference other members.

- Web: invite form on a family page (email + role), share `invite.code`
- Web: accept-invite page/flow for the invitee
- No new data model — wires up what's already there

### 1.B — Tasks (MVP) (SHIPPED)

Simplest of the three: no file storage, no folder permission tiers.

- **Data model** (`packages/shared`): `Task` — id, familyId, title,
  description, assignedTo (uid, optional), dueDate (optional), status
  (`todo` / `in_progress` / `done`), priority (`low`/`medium`/`high`),
  createdBy, createdAt, updatedAt. Stored at `families/{familyId}/tasks/{id}`.
- **API** (`apps/api/src/routes/tasks.ts`): CRUD + list-by-family, gated by
  `requireFamilyRole()` (any member can create/view; assignee or
  owner/parent can update status)
- **Web UI**: task list view (filter by status/assignee), create/edit form
- **Deferred to a later pass**: recurring tasks, checklists, comments,
  attachments, dependencies, push notifications — all explicitly called out
  as MVP-excluded depth in the PRD's "Future" framing for this module

### 1.C — Events (MVP) (SHIPPED)

Builds on Tasks (an Event has a task list) — sequencing after 1.B so there's
something real to attach.

- **Data model**: `Event` — id, familyId, title, type (free text or one of
  the PRD templates: vacation/wedding/college/home_purchase/moving/
  birthday/custom), startDate, endDate (optional), description, createdBy,
  createdAt, updatedAt. Stored at `families/{familyId}/events/{id}`.
  Tasks reference an event via optional `eventId` field (extend the Task
  schema from 1.B).
- **API** (`apps/api/src/routes/events.ts`): CRUD + list-by-family;
  `GET /v1/events/:id` returns event + its linked tasks
- **Web UI**: events list, event detail page (shows linked tasks, basic
  info), create-event form with template picker
- **Deferred**: documents/photos/expenses/budgets/timeline/calendar-entry
  linkage on an event — those land once Vault (1.D) and Finance (Phase 2)
  exist to link to

### 1.D — Vault (MVP slice) (SHIPPED)

Most complex first slice. The PRD's full vault (4 folder tiers, biometric +
MFA, audit logs, AI categorization, client-side encryption) is Family Plus
premium-tier territory — proposing a deliberately small first cut.

- **Data model**: `VaultItem` — id, familyId, name, driveFileId,
  driveFileUrl (webViewLink from Drive API), category (one of the PRD's
  categories: home/vehicles/travel/insurance/taxes/medical/school/legal/
  financial/pets/custom), folderType (`standard` for this slice —
  `restricted`/`secure`/`vault` tiers landed in the Vault hardening pass
  below), eventId (optional, links to Phase 1.C events), addedBy,
  createdAt. Stored at `families/{familyId}/vaultItems/{id}`.
- **API** (`apps/api/src/routes/vault.ts`): list/create/delete. "Create"
  here means: user picks a file via Google Drive Picker (client-side,
  using the existing Drive OAuth connection), API just stores the
  reference — Niki never touches file bytes, consistent with the PRD's
  "families own their data" principle.
- **Web UI**: vault list (filterable by category), "Add from Drive" button
  (Google Picker API), category assignment
- **Deferred to later**: password protection, biometric auth, emergency
  access, client-side encryption, AI sensitive-document detection — all
  explicitly Premium/Family Plus tier in the PRD's monetization section,
  reasonable to defer past MVP. (Folder tiers + audit logs were promoted
  out of this deferred list — see the Vault hardening pass below.)

### Vault hardening pass (SHIPPED)

Built immediately before Phase 4.E, per the locked-in Phase 4 build order
(4.C → 4.D → hardening pass → 4.E) — 4.E's permission review/sensitive-doc
detection needs real security tiers to monitor. Scoped with the user via
two explicit questions: of the deferred 1.D items, build **only audit
logs** alongside the three folder tiers (password protection/biometric
step-up, emergency access, and client-side encryption remain explicitly
deferred Family Plus work); gate hardened-tier access to **role >= parent**
(not "any active member" or a per-tier minimum).

- **Data model** (`packages/shared/src/vault.ts`): `VAULT_FOLDER_TYPES`
  expanded to `standard`/`restricted`/`secure`/`vault`;
  `HARDENED_VAULT_FOLDER_TYPES` groups the latter three. New
  `VaultAuditLogEntry` (id, familyId, vaultItemId, vaultItemName,
  folderType, action: `view`/`create`/`delete`, actorUid, timestamp), stored
  at `families/{familyId}/vaultAuditLog/{id}` — append-only, no
  update/delete endpoint, by design: an audit trail that could be edited or
  erased isn't a trail.
- **Role gating** (`apps/api/src/routes/vault.ts`): `standard` items are
  fully unchanged (any active member create/view/delete-if-creator-or-
  parent+). `restricted`/`secure`/`vault` items require role >= parent for
  create, view, and delete — even the "whoever added it" delete exception
  is suppressed for hardened items. `GET /` with no `folderType` filter
  silently drops hardened items from the list for non-parent callers
  (rather than 403ing the whole list); explicitly requesting a hardened
  `folderType` as a non-parent still 403s.
- **Audit logging**: every create/delete of a hardened item, and every
  view of a hardened item by a parent+ caller, writes a
  `VaultAuditLogEntry`. Logging is fire-and-forget and best-effort — wrapped
  in try/catch that silently swallows failures, since a logging failure
  must never surface as a user-facing error or block the underlying vault
  operation. New `GET /audit-log` route (parent+ only, 200-entry limit,
  newest first) — this is the data Phase 4.E reads.
- **Web UI** (`apps/web/src/app/vault/page.tsx`): folder filter dropdown;
  🔒 lock icon + folder label on hardened items; Folder select in "Add from
  Drive" (hardened options hidden for non-parents, with an explanatory
  message); parent-only "Audit log" panel with a When/Action/Item/Folder/By
  table.

### Suggested Phase 1 order

1.A (invites) → 1.B (Tasks) → 1.C (Events) → 1.D (Vault), each deployed and
manually verified before starting the next — mirrors how Phase 0 was run.

---

## Phase 2 — Calendar, Finance Hub

### 2.A — Calendar (SHIPPED)

- **Data model**: `CalendarEntry` — id, familyId, title, date, type
  (birthday/task/appointment/trip/school/reminder/deadline), linkedTaskId /
  linkedEventId (optional). Stored at `families/{familyId}/calendarEntries/{id}`.
  Tasks with a `dueDate` and Events with `startDate`/`endDate` should
  surface here too (derived, not duplicated data, where possible).
- **API**: CRUD + range query (`?from=&to=`) for month/week/day views
- **Web UI**: month/week/day/agenda views
- **Deferred**: Google Calendar / Apple Calendar two-way sync (PRD lists
  this as an integration, not MVP-critical)

### 2.B — Finance Hub

Split per the 2.B.1/2.B.2/2.B.3 proposal below, confirmed with the user.

#### 2.B.1 — Manual expense entry (SHIPPED)

- **Data model**: `Budget` (family-level or event-level, period, category
  allocations), `Expense` (amount, merchant, date, category, source:
  manual/receipt/voice, receiptVaultItemId optional link to 1.D Vault),
  `SavingsGoal` (name, targetAmount, currentAmount, targetDate) —
  `packages/shared/src/finance.ts`
- **API**: CRUD for all three at `/v1/families/:familyId/{budgets,expenses,savings-goals}`.
  Expense creation always writes `source: 'manual'` this phase regardless of
  request body — `apps/api/src/routes/{budgets,expenses,savingsGoals}.ts`
- **Web UI**: `/finance` — budget dashboard (per-category spent-vs-allocated),
  expense list/entry form, savings goal tracker with contributions —
  `apps/web/src/app/finance/page.tsx`
- Savings goal "contributions" are a plain PATCH bumping `currentAmount` —
  no separate transaction/ledger log this phase.

#### 2.B.2 — Receipt OCR (deferred)

- Document AI wiring to extract amount/merchant/date from a photographed
  receipt, linking the source vault item via `receiptVaultItemId`.

#### 2.B.3 — Voice input (deferred)

- Speech-to-Text wiring for voice-logged expenses.

- **Deferred (all of 2.B)**: bank integrations (Plaid) — explicitly
  PRD-excluded from MVP

---

## Phase 3 — Knowledge Hub, Memories (SHIPPED)

### 3.A — Knowledge Hub (SHIPPED)

- **Data model**: `KnowledgeEntry` — id, familyId, title, contentType
  (recipe/instructions/tradition/emergency_plan/reference/idea), body (rich
  text or linked doc), tags. Stored at `families/{familyId}/knowledge/{id}`.
  `packages/shared/src/knowledge.ts`.
- **API**: CRUD + basic tag/title search (AI-powered search is Phase 4).
  `apps/api/src/routes/knowledge.ts` — `contentType` is a real Firestore
  `.where()` filter; `q` (title/tag substring) and `tag` (exact membership)
  are in-memory filters after fetch, since Firestore has no native text
  search.
- **Web UI**: list/detail/edit, simple search box. Single static route
  `apps/web/src/app/knowledge/page.tsx` (expand-in-place, no dynamic `[id]`
  route, consistent with `output: 'export'`).

### 3.B — Memories (SHIPPED)

- **Data model**: `Memory` — id, familyId, title, type
  (photo/video/story/milestone/achievement/voice_note/document), driveFileId
  (optional, same Drive-reference pattern as Vault), eventId (optional
  link), date, description. `packages/shared/src/memories.ts`. Unlike
  Vault, has a real `updatedAt`-free PATCH endpoint since the PRD calls
  for full CRUD here.
- **API**: CRUD + list-by-event, list-by-date-range.
  `apps/api/src/routes/memories.ts` — `eventId`/`from`/`to` are Firestore
  `.where()` filters; results sorted by date desc. DELETE only removes the
  Firestore reference, never the underlying Drive file (same as Vault).
- **Web UI**: timeline view, "add memory" flow (Drive picker, same as
  Vault, but optional — a 'story' memory can be pure text).
  `apps/web/src/app/memories/page.tsx`.

### Open decisions to revisit

- Knowledge search is substring-match only; AI-powered semantic search is
  explicitly deferred to Phase 4.D.
- Memories' web UI doesn't yet expose the API's `eventId`/date-range
  filters — the timeline just lists everything sorted by date. Revisit if
  family memory volume makes that unwieldy.

---

## Phase 4 — AI Assistant

Comes last because every prior phase's data (Vault metadata, Events, Tasks,
Finance, Knowledge, Memories) is what the assistant searches/reasons over —
building this earlier would mean indexing against a schema still in flux.

Scoped with the user to **4.A + 4.B** for the first pass (shipped). The user
then chose to build out the remaining deferred items too, in order
**4.C → 4.D → 4.E**, with a Vault hardening pass before 4.E specifically
(to build the `restricted`/`secure`/`vault` folder tiers 4.E depends on,
deferred back in 1.D).

### 4.A — Search (SHIPPED)

Semantic search over Knowledge Hub entries and Tasks, via **Vertex AI
Vector Search** (Matching Engine) — chosen over Postgres/pgvector and over
Firestore's native vector search, per explicit user decision.

- **Data model**: no new Firestore collection. `packages/shared/src/ai.ts`
  defines `SearchResult`/`SearchResponse` (id, type `'knowledge'|'task'`,
  title, snippet, distance) — a read-only projection, not stored data.
- **Embeddings/vector infra**:
  `apps/api/src/lib/vertexAi.ts` (`embedText`, `generateJson` — REST calls
  via `google-auth-library` ADC, no new SDK dependency) and
  `apps/api/src/lib/vectorSearch.ts` (`upsertEmbedding`, `removeEmbedding`,
  `findNeighbors` against a single shared Vector Search index, namespaced
  by `familyId` + `type` restricts so cross-family leakage is impossible at
  the index layer). Both gate on a `*Configured` boolean computed from env
  vars, so the app degrades gracefully (empty results) where this infra
  isn't provisioned — see setup steps below.
- **Indexing**: `apps/api/src/lib/searchIndexing.ts` — fire-and-forget
  `indexForSearch`/`removeFromSearchIndex`, called from
  `routes/knowledge.ts` and `routes/tasks.ts` on create/update/delete.
  Events and Memories are NOT indexed this pass (explicit scope decision —
  extend the same pattern later if needed).
- **API**: `GET /v1/families/:familyId/search?q=` —
  `apps/api/src/routes/search.ts`. Embeds the query, finds nearest
  neighbors, hydrates the matching Knowledge/Task docs, returns them
  distance-ranked. Returns `{ results: [] }` rather than erroring if Vertex
  AI / Vector Search aren't configured.
- **Web UI**: `/search` — `apps/web/src/app/search/page.tsx`. Single static
  route, same reason as `/knowledge`, `/memories`.

### 4.B — Event planning assistant (SHIPPED)

Gemini-generated checklist + budget draft for an event, using the event's
`type`/title/dates/description (the same `EVENT_TEMPLATES` enum from 1.C —
there's no separate template collection) as planning context.

- **Data model**: `packages/shared/src/ai.ts` — `EventPlanDraft`
  (`checklist: {title, description?}[]`, `budget: {category,
  estimatedAmount, notes?}[]`). Stateless — never persisted.
- **API**: `POST /v1/families/:familyId/events/:eventId/plan-assist` —
  `apps/api/src/routes/eventPlanning.ts`. Calls Gemini via
  `generateJson`, validates the response against `EventPlanDraftSchema`,
  returns it. Returns 503 if Vertex AI isn't configured.
- **Critical design decision (explicit, locked in with the user): always
  draft, never auto-create.** This endpoint NEVER writes a `Task` or
  `Budget` document. It only returns a draft for the web UI to render as a
  reviewable list — the user must explicitly accept each item.
- **Web UI**: `apps/web/src/app/events/page.tsx` — inside the expanded
  event view, a "Get checklist + budget suggestions" button calls
  plan-assist and renders the draft. Each checklist item has its own
  "Add as task" button (calls the existing `POST /tasks`, unmodified).
  Budget items are aggregated and offered as a single "Create event budget
  from these suggestions" action, which best-effort maps Gemini's freeform
  `category` strings onto the fixed `ExpenseCategory` enum (case-insensitive
  substring match, falling back to `'other'`) before calling the existing
  `POST /budgets` with `period: 'event'`.

### GCP setup for 4.A/4.B (do this before either feature does anything beyond
returning empty/503)

1. **Enable the API** (one-time per project):
   ```
   gcloud services enable aiplatform.googleapis.com --project=<PROJECT_ID>
   ```
2. **Grant the existing API service account Vertex AI access** — reuse the
   same service account `apps/api`'s Cloud Run service already runs as
   (see `SETUP.md` for which one that is):
   ```
   gcloud projects add-iam-policy-binding <PROJECT_ID> \
     --member="serviceAccount:<API_SERVICE_ACCOUNT_EMAIL>" \
     --role="roles/aiplatform.user"
   ```
3. **Create a Vector Search index** (embedding dimension 768 to match
   `text-embedding-004`; adjust if you pick a different embedding model):
   ```
   gcloud ai indexes create \
     --display-name=niki-search-index \
     --project=<PROJECT_ID> --region=us-central1 \
     --metadata-file=index_metadata.json
   ```
   where `index_metadata.json` is:
   ```json
   {
     "contentsDeltaUri": "",
     "config": {
       "dimensions": 768,
       "approximateNeighborsCount": 10,
       "distanceMeasureType": "COSINE_DISTANCE",
       "algorithmConfig": { "treeAhConfig": {} }
     }
   }
   ```
   (Console UI is simpler for this one-time step if you'd rather avoid
   hand-rolling the metadata file: Vertex AI → Vector Search → Create
   Index → Update method "Streaming".) **Streaming update method is
   required** — this app calls `upsertDatapoints`/`removeDatapoints`
   directly, not batch updates.
4. **Create an Index Endpoint and deploy the index to it**:
   ```
   gcloud ai index-endpoints create \
     --display-name=niki-search-endpoint \
     --project=<PROJECT_ID> --region=us-central1 \
     --public-endpoint-enabled

   gcloud ai index-endpoints deploy-index <INDEX_ENDPOINT_ID> \
     --index=<INDEX_ID> \
     --deployed-index-id=niki_search_deployed \
     --display-name=niki-search-deployed \
     --project=<PROJECT_ID> --region=us-central1
   ```
   Deployment takes ~20-30 minutes the first time.
5. **Set these env vars on the API's Cloud Run service** (Secret Manager
   not required — none of these are secrets, just config):
   - `GOOGLE_CLOUD_PROJECT` (or reuse existing `FIREBASE_PROJECT_ID` if
     it's the same project — the code falls back to that)
   - `VERTEX_AI_LOCATION` (defaults to `us-central1` if unset)
   - `VERTEX_AI_EMBEDDING_MODEL` (defaults to `text-embedding-004`)
   - `VERTEX_AI_GEMINI_MODEL` (defaults to `gemini-1.5-flash`)
   - `VECTOR_SEARCH_INDEX_ID` (the `<INDEX_ID>` from step 3)
   - `VECTOR_SEARCH_INDEX_ENDPOINT_ID` (the `<INDEX_ENDPOINT_ID>` from
     step 4)
   - `VECTOR_SEARCH_DEPLOYED_INDEX_ID` (`niki_search_deployed`, matching
     the `--deployed-index-id` used in step 4)
6. **Backfill existing data** (optional, one-time): existing Knowledge
   entries and Tasks created before this phase was deployed won't be
   indexed automatically — only future creates/updates trigger indexing.
   If you want existing content searchable immediately, the simplest
   backfill is a one-off script that lists every `families/*/knowledge` and
   `families/*/tasks` doc and calls the same `indexForSearch` logic; not
   built this pass since it's a one-time operational task, not app code.

Until steps 1-5 are done, `/search` returns empty results (not an error)
and the events page's "Get suggestions" button surfaces a clear 503 error
message — both fail soft by design.

### 4.C — Financial coaching (SHIPPED)

Overspending alerts and savings pacing recommendations, computed from real
Phase 2.B Finance Hub data (`Budget`, `Expense`, `SavingsGoal`).

- **Design decision (locked in): deterministic numbers, AI phrasing only.**
  Unlike 4.B's full Gemini-drafted plan, every dollar figure here (allocated,
  spent, overBy, suggestedMonthlyContribution) is computed in plain
  TypeScript from real Firestore data — never handed to an LLM to calculate,
  so there's no risk of a hallucinated number. Gemini (if configured) is
  only asked to phrase a short natural-language `summary` on top of those
  already-computed facts, with an explicit prompt instruction not to alter
  any numbers. If Gemini fails or Vertex AI isn't configured, a
  template-generated `defaultSummary()` is used instead — so this feature is
  fully functional even with zero AI infra provisioned (unlike 4.A/4.B,
  which degrade to empty results/503).
- **Data model**: `packages/shared/src/ai.ts` — `OverspendingAlert`
  (budgetId, budgetName, category, allocated, spent, overBy, message),
  `SavingsRecommendation` (goalId, goalName, message,
  suggestedMonthlyContribution?), `FinancialCoachingResponse` (alerts,
  recommendations, summary). Stateless — never persisted.
- **API**: `GET /v1/families/:familyId/finance/coaching` —
  `apps/api/src/routes/financialCoaching.ts`. Read-only; fetches
  budgets/expenses/savingsGoals in parallel, computes alerts (spend per
  category vs. allocation, scoped via `Expense.budgetId`) and
  recommendations (monthly pacing against `targetDate` where set)
  deterministically, then layers an optional Gemini summary on top. Never
  writes to Firestore.
- **Web UI**: `/finance` — new "Coaching" tab (`CoachingTab` in
  `apps/web/src/app/finance/page.tsx`). Button-triggered fetch (not
  auto-loaded), shows the summary plus alert/recommendation cards.

### 4.D — Knowledge summarization (SHIPPED)

Superseded in part by 4.A (Knowledge entries are now semantically
searchable) — this phase covers the summarization piece specifically.
Scoped with the user via two explicit questions: build all three variants
(single-entry summary, tag/category digest, family-wide digest), and keep
generation stateless (never persisted on the entry) — the recommended
option.

- **Design decision (locked in): no deterministic fallback, unlike 4.C.**
  Summarizing free-text body content genuinely requires an LLM — there's no
  "true number" to protect the way 4.C protects dollar figures. Both
  endpoints below return 503 if Vertex AI isn't configured, same fail-soft
  pattern as 4.B's plan-assist.
- **Data model**: `packages/shared/src/ai.ts` — `KnowledgeSummaryResponse`
  (entryId, title, summary) and `KnowledgeDigestResponse` (entryCount, tag?,
  contentType?, summary, highlights). `entryCount` is always the real
  Firestore count of matching entries, computed in code — never asked of
  the model, same "never let the LLM report a fact code can compute"
  principle as 4.C. Both stateless — never persisted onto the
  `KnowledgeEntry` itself.
- **API** (`apps/api/src/routes/knowledge.ts`):
  - `POST /:entryId/summarize` — summarizes a single entry's body in 2-4
    sentences.
  - `GET /digest?tag=&contentType=` — covers both the tag/category digest
    and the whole-hub digest with one endpoint (no filters = whole-hub).
    Registered before `GET /:entryId` in the router so the literal path
    segment `digest` isn't swallowed as an `entryId` param (Express matches
    routes in declaration order, not by specificity). Caps prompt context to
    30 entries × 400 chars of body each to bound token usage regardless of
    Knowledge Hub size; `entryCount` returned is always the real, uncapped
    count.
- **Web UI**: `/knowledge` — a "Summarize" button on each expanded entry
  (inline summary display) and a "Knowledge digest" panel above the entry
  list (content-type + tag filters, "Generate digest" button, shows
  summary/entryCount/highlights). `apps/web/src/app/knowledge/page.tsx`.

### 4.E — Security monitoring (SHIPPED)

Permission review, sensitive-document detection — depends on Vault's
security tiers, which the Vault hardening pass (see Phase 1 section above)
shipped: `restricted`/`secure`/`vault` folder tiers, role gating, and the
`vaultAuditLog` this phase reads. Scoped with the user via two explicit
questions: detection should **suggest, never auto-move**; permission review
means a **parent-facing access summary** (who has access + a recent-activity
rollup), not automated stale-access alerts.

- **Design decision (locked in): sensitive-document detection is
  deterministic, not LLM-based.** Vault item names are short (<=200 chars)
  and the signal is just "does this name/category suggest a sensitive
  document" — a keyword match handles that reliably and instantly, with no
  AI-infra dependency or latency/cost on the vault-create path. Same
  "deterministic where possible" principle as 4.C/4.D.
- **Data model** (`packages/shared/src/vault.ts`): `CreateVaultItemResponse`
  (`{ item, suggestion? }`) — `suggestion` is only present when a newly
  created `standard`-tier item's name/category matches a keyword.
  `SensitiveDocumentSuggestion` (vaultItemId, vaultItemName,
  suggestedFolderType, reason). `detectSensitiveDocument()` checks three
  keyword tiers (most-sensitive first: `vault` — ssn/passport/driver
  license/ein/tax id/birth certificate; `secure` — bank account/routing
  number/credit card/medical record/prescription/diagnosis/account number;
  `restricted` — insurance policy/will/trust/deed/mortgage/lease/contract/
  tax return/w-2/1099), first match wins. Only ever called for `standard`-
  tier creates — hardened items are already where a sensitive document
  belongs. `MoveVaultItemInput` (`{ folderType }`) and a new `'move'`
  `VaultAuditAction` (alongside view/create/delete).
- **API** (`apps/api/src/routes/vault.ts`): `POST /` now computes the
  suggestion (if any) and returns it alongside the created item. New
  `PATCH /:itemId` — the only mutable field is `folderType`, so a member can
  accept a suggestion (or manually re-tier an item) without a general update
  endpoint. Moving into or out of a hardened tier both require role >=
  parent. Writes a `'move'` audit entry when the resulting folderType is
  hardened.
- **Permission review has no new API surface** — assembled entirely
  client-side from data already available: the family members list
  (filtered to role >= parent) plus the existing `GET /audit-log` response,
  aggregated into a per-actor activity count.
- **Web UI** (`apps/web/src/app/vault/page.tsx`): a one-time suggestion
  banner after "Add from Drive" creates a flagged item ("X looks sensitive
  — move it to the Y folder?" with Move/Dismiss buttons; dismissing has no
  persisted effect, it's not re-offered). A parent-only "Permission review"
  panel above the audit log: lists members with access to hardened tiers,
  and — once the audit log is loaded — a per-member recent-activity count
  rollup.

---

## Open decisions to revisit before each phase starts

- **Phase 1**: confirm build order (proposed: 1.A → 1.B → 1.C → 1.D) and
  MVP-vs-full-depth per module
- **Phase 2.B**: resolved — manual entry (2.B.1) shipped first; receipt OCR
  (2.B.2) and voice input (2.B.3) deferred to separate follow-up milestones
- **Phase 4.A**: resolved — Vertex AI Vector Search chosen over
  Postgres+pgvector and Firestore's native vector search; shipped indexing
  Knowledge entries + Tasks only (Events/Memories deferred to a later
  extension of the same pattern)
