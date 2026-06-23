import { Router } from 'express';
import { EventPlanDraftSchema, type Event } from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';
import { generateJson, vertexAiConfigured } from '../lib/vertexAi';

/**
 * Mounted at /v1/families/:familyId/events/:eventId/plan-assist (see
 * index.ts) with `{ mergeParams: true }`. Phase 4.B — Gemini-generated
 * checklist + budget draft for an event, using the event's `type` (one of
 * EVENT_TEMPLATES) as the planning context. Per the Phase 4 scoping
 * decision, this NEVER auto-creates Tasks/Budget rows — it only returns a
 * draft for the web UI to show as a reviewable list; the user explicitly
 * accepts individual items via the existing POST /tasks and POST /budgets
 * endpoints.
 */
export const eventPlanningRouter = Router({ mergeParams: true });
eventPlanningRouter.use(authenticate);
eventPlanningRouter.use(requireFamilyRole());

const PLAN_ASSIST_PROMPT = (event: Event) => `You are a family event planning assistant. Given this event, suggest a
preparation checklist and a rough budget. Respond with ONLY a JSON object
matching this exact shape, no markdown, no commentary:

{
  "checklist": [{ "title": string, "description"?: string }],
  "budget": [{ "category": string, "estimatedAmount": number, "notes"?: string }]
}

Suggest 5-10 checklist items and 3-8 budget line items, appropriate for a
family planning this. Amounts should be realistic estimates in whole
currency units (no currency symbol).

Event:
- Title: ${event.title}
- Type: ${event.type}
- Start date: ${event.startDate}
${event.endDate ? `- End date: ${event.endDate}\n` : ''}${event.description ? `- Description: ${event.description}\n` : ''}`;

/** POST /v1/families/:familyId/events/:eventId/plan-assist */
eventPlanningRouter.post('/', async (req: AuthedRequest, res, next) => {
  try {
    if (!vertexAiConfigured) {
      throw new ApiError(503, 'AI planning assistant is not configured (set GOOGLE_CLOUD_PROJECT)');
    }

    const familyId = req.params.familyId;
    const eventRef = db.collection('families').doc(familyId).collection('events').doc(req.params.eventId);
    const snap = await eventRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Event not found');
    }
    const event = snap.data() as Event;

    const raw = await generateJson(PLAN_ASSIST_PROMPT(event));
    const draft = EventPlanDraftSchema.parse(raw);

    return res.json(draft);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(502, 'AI planning assistant failed'));
  }
});
