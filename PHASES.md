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
  financial/pets/custom), folderType (`standard` only for this slice —
  `restricted`/`secure`/`vault` tiers deferred), eventId (optional, links to
  Phase 1.C events), addedBy, createdAt. Stored at
  `families/{familyId}/vaultItems/{id}`.
- **API** (`apps/api/src/routes/vault.ts`): list/create/delete. "Create"
  here means: user picks a file via Google Drive Picker (client-side,
  using the existing Drive OAuth connection), API just stores the
  reference — Niki never touches file bytes, consistent with the PRD's
  "families own their data" principle.
- **Web UI**: vault list (filterable by category), "Add from Drive" button
  (Google Picker API), category assignment
- **Deferred to later**: restricted/secure/vault folder tiers, password
  protection, biometric auth, audit logs, emergency access, client-side
  encryption, AI sensitive-document detection — all explicitly Premium/
  Family Plus tier in the PRD's monetization section, reasonable to defer
  past MVP

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

## Phase 3 — Knowledge Hub, Memories

### 3.A — Knowledge Hub

- **Data model**: `KnowledgeEntry` — id, familyId, title, contentType
  (recipe/instructions/tradition/emergency_plan/reference/idea), body (rich
  text or linked doc), tags. Stored at `families/{familyId}/knowledge/{id}`.
- **API**: CRUD + basic tag/title search (AI-powered search is Phase 4)
- **Web UI**: list/detail/edit, simple search box

### 3.B — Memories

- **Data model**: `Memory` — id, familyId, title, type
  (photo/video/story/milestone/achievement/voice_note/document), driveFileId
  (optional, same Drive-reference pattern as Vault), eventId (optional
  link), date, description
- **API**: CRUD + list-by-event, list-by-date-range
- **Web UI**: timeline/gallery view, "add memory" flow (Drive picker, same
  as Vault)

---

## Phase 4 — AI Assistant

Comes last because every prior phase's data (Vault metadata, Events, Tasks,
Finance, Knowledge, Memories) is what the assistant searches/reasons over —
building this earlier would mean indexing against a schema still in flux.

- **4.A — Search**: natural-language query over Firestore data + Drive file
  metadata. Needs an embeddings/vector search decision (see Stack Note
  above) before this can start for real.
- **4.B — Event planning assistant**: checklist/budget suggestions, using
  Vertex AI (Gemini) against the Event Templates already modeled in 1.C
- **4.C — Financial coaching**: overspending alerts, savings recommendations
  — depends on Phase 2.B Finance data existing first
- **4.D — Knowledge search & summarization**: depends on Phase 3.A
- **4.E — Security monitoring**: permission review, sensitive-document
  detection — depends on Vault's deferred security tiers (1.D) actually
  being built first, so likely re-sequences after a Vault hardening pass

---

## Open decisions to revisit before each phase starts

- **Phase 1**: confirm build order (proposed: 1.A → 1.B → 1.C → 1.D) and
  MVP-vs-full-depth per module
- **Phase 2.B**: resolved — manual entry (2.B.1) shipped first; receipt OCR
  (2.B.2) and voice input (2.B.3) deferred to separate follow-up milestones
- **Phase 4.A**: pick the vector search approach (Postgres+pgvector as a
  second datastore vs. Vertex AI Vector Search vs. a Firestore extension)
  before any embedding-generation code gets written
