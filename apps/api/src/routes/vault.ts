import { Router } from 'express';
import {
  CreateVaultItemInputSchema,
  hasAtLeastRole,
  type VaultItem,
  type Role,
} from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

/**
 * Mounted at /v1/families/:familyId/vault (see index.ts) with
 * `{ mergeParams: true }` — same pattern as tasksRouter/eventsRouter.
 *
 * Per PHASES.md 1.D, this slice is intentionally list/create/delete only —
 * no update endpoint. Category is chosen at add-time in the web UI; there's
 * no separate "reassign category" flow yet.
 */
export const vaultRouter = Router({ mergeParams: true });
vaultRouter.use(authenticate);
vaultRouter.use(requireFamilyRole());

type VaultRequest = AuthedRequest & { member?: { role: Role } };

/** GET /v1/families/:familyId/vault?category= */
vaultRouter.get('/', async (req: VaultRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('vaultItems') as FirebaseFirestore.Query;

    const { category } = req.query;
    if (typeof category === 'string') {
      query = query.where('category', '==', category);
    }

    const snap = await query.get();
    return res.json(snap.docs.map((d) => d.data() as VaultItem));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/families/:familyId/vault — any active member can add a vault
 * item. The client has already run the Google Picker and just hands us the
 * resulting file reference (driveFileId/driveFileUrl) — we never touch the
 * file itself, consistent with "families own their data."
 */
vaultRouter.post('/', async (req: VaultRequest, res, next) => {
  try {
    const input = CreateVaultItemInputSchema.parse(req.body);
    const familyId = req.params.familyId;

    const itemRef = db.collection('families').doc(familyId).collection('vaultItems').doc();
    const item: VaultItem = {
      id: itemRef.id,
      familyId,
      name: input.name,
      driveFileId: input.driveFileId,
      driveFileUrl: input.driveFileUrl,
      category: input.category,
      folderType: 'standard',
      eventId: input.eventId,
      addedBy: req.uid!,
      createdAt: new Date().toISOString(),
    };
    await itemRef.set(item);

    return res.status(201).json(item);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/**
 * DELETE /v1/families/:familyId/vault/:itemId — only removes the Firestore
 * reference, never the underlying Drive file. Allowed for: whoever added
 * it, or anyone role >= parent.
 */
vaultRouter.delete('/:itemId', async (req: VaultRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    const itemRef = db.collection('families').doc(familyId).collection('vaultItems').doc(req.params.itemId);
    const snap = await itemRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Vault item not found');
    }
    const item = snap.data() as VaultItem;

    const uid = req.uid!;
    const role = req.member!.role;
    const allowed = item.addedBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this vault item');
    }

    await itemRef.delete();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
