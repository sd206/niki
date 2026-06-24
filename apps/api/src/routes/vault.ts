import { Router } from 'express';
import {
  CreateVaultItemInputSchema,
  MoveVaultItemInputSchema,
  hasAtLeastRole,
  detectSensitiveDocument,
  HARDENED_VAULT_FOLDER_TYPES,
  type VaultItem,
  type VaultAuditLogEntry,
  type VaultAuditAction,
  type CreateVaultItemResponse,
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
 * Per PHASES.md 1.D, list/create/delete is the only CRUD surface — category
 * is chosen at add-time in the web UI, no separate "reassign category"
 * flow. The one exception is PATCH /:itemId (added in the Phase 4.E pass
 * below), which exists solely to change folderType.
 *
 * Vault hardening pass: items in `restricted`/`secure`/`vault` folder types
 * are gated to role >= parent (standard items remain open to any active
 * member, unchanged) and every access against them is recorded in
 * vaultAuditLog. This is fire-and-forget (never blocks the response) but
 * always awaited internally before responding on writes, so a 201/204 means
 * the audit entry was at least attempted in the same request lifecycle.
 *
 * Phase 4.E (Security monitoring): sensitive-document detection on create
 * (see detectSensitiveDocument) and the PATCH /:itemId move endpoint it
 * feeds into. Permission review itself has no new endpoints — it's
 * assembled in the web UI from the existing family members list + this
 * router's /audit-log.
 */
export const vaultRouter = Router({ mergeParams: true });
vaultRouter.use(authenticate);
vaultRouter.use(requireFamilyRole());

type VaultRequest = AuthedRequest & { member?: { role: Role } };

function isHardened(folderType: string): boolean {
  return (HARDENED_VAULT_FOLDER_TYPES as readonly string[]).includes(folderType);
}

/** Writes one audit log entry. Never throws — logging failures must not break the request. */
async function writeAuditLog(
  familyId: string,
  item: VaultItem,
  action: VaultAuditAction,
  actorUid: string,
): Promise<void> {
  try {
    const ref = db.collection('families').doc(familyId).collection('vaultAuditLog').doc();
    const entry: VaultAuditLogEntry = {
      id: ref.id,
      familyId,
      vaultItemId: item.id,
      vaultItemName: item.name,
      folderType: item.folderType,
      action,
      actorUid,
      timestamp: new Date().toISOString(),
    };
    await ref.set(entry);
  } catch {
    // Audit logging is best-effort — a logging failure should never surface
    // as a user-facing error or block the underlying vault operation.
  }
}

/** GET /v1/families/:familyId/vault?category=&folderType= */
vaultRouter.get('/', async (req: VaultRequest, res, next) => {
  try {
    const familyId = req.params.familyId;
    let query = db.collection('families').doc(familyId).collection('vaultItems') as FirebaseFirestore.Query;

    const { category, folderType } = req.query;
    if (typeof category === 'string') {
      query = query.where('category', '==', category);
    }
    if (typeof folderType === 'string') {
      if (isHardened(folderType) && !hasAtLeastRole(req.member!.role, 'parent')) {
        throw new ApiError(403, 'Requires role >= parent to view this folder');
      }
      query = query.where('folderType', '==', folderType);
    }

    const snap = await query.get();
    let items = snap.docs.map((d) => d.data() as VaultItem);

    // No folderType filter was given — the query may include hardened items
    // mixed in with standard ones. A non-parent caller should never see
    // hardened items at all; filter them out rather than 403ing the whole
    // list, since most callers are listing "everything I can see."
    const role = req.member!.role;
    if (!hasAtLeastRole(role, 'parent')) {
      items = items.filter((item) => !isHardened(item.folderType));
    } else {
      // Parent+ callers viewing hardened items: record a 'view' audit entry
      // per hardened item returned. Fire-and-forget — never blocks the
      // response or fails the request if logging has a hiccup.
      const uid = req.uid!;
      for (const item of items) {
        if (isHardened(item.folderType)) {
          void writeAuditLog(familyId, item, 'view', uid);
        }
      }
    }

    return res.json(items);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/families/:familyId/vault/audit-log — parent+ only. Returns the
 * full audit trail (view/create/delete) for restricted/secure/vault items,
 * newest first. This is the data Phase 4.E's security monitoring reads.
 */
vaultRouter.get('/audit-log', async (req: VaultRequest, res, next) => {
  try {
    if (!hasAtLeastRole(req.member!.role, 'parent')) {
      throw new ApiError(403, 'Requires role >= parent to view the audit log');
    }
    const familyId = req.params.familyId;
    const snap = await db
      .collection('families')
      .doc(familyId)
      .collection('vaultAuditLog')
      .orderBy('timestamp', 'desc')
      .limit(200)
      .get();
    return res.json(snap.docs.map((d) => d.data() as VaultAuditLogEntry));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/families/:familyId/vault — any active member can add a
 * `standard` item, unchanged. Adding to `restricted`/`secure`/`vault`
 * requires role >= parent. The client has already run the Google Picker and
 * just hands us the resulting file reference (driveFileId/driveFileUrl) —
 * we never touch the file itself, consistent with "families own their
 * data."
 */
vaultRouter.post('/', async (req: VaultRequest, res, next) => {
  try {
    const input = CreateVaultItemInputSchema.parse(req.body);
    if (isHardened(input.folderType) && !hasAtLeastRole(req.member!.role, 'parent')) {
      throw new ApiError(403, `Requires role >= parent to add items to the ${input.folderType} folder`);
    }
    const familyId = req.params.familyId;

    const itemRef = db.collection('families').doc(familyId).collection('vaultItems').doc();
    const item: VaultItem = {
      id: itemRef.id,
      familyId,
      name: input.name,
      driveFileId: input.driveFileId,
      driveFileUrl: input.driveFileUrl,
      category: input.category,
      folderType: input.folderType,
      eventId: input.eventId,
      addedBy: req.uid!,
      createdAt: new Date().toISOString(),
    };
    await itemRef.set(item);

    if (isHardened(item.folderType)) {
      await writeAuditLog(familyId, item, 'create', req.uid!);
    }

    // Sensitive-document detection (Phase 4.E): only checked for items
    // landing in the standard tier — hardened items are already where a
    // sensitive document belongs, nothing to suggest. Deterministic and
    // synchronous (see detectSensitiveDocument's doc comment for why), so
    // no latency/AI-infra dependency on the create path.
    const suggestion =
      item.folderType === 'standard' ? detectSensitiveDocument(item.id, item.name, item.category) ?? undefined : undefined;

    const response: CreateVaultItemResponse = { item, suggestion };
    return res.status(201).json(response);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/**
 * PATCH /v1/families/:familyId/vault/:itemId — the only mutable field is
 * folderType. This exists so a member can accept a sensitive-document
 * suggestion (or manually re-tier an item) after creation, without giving
 * the route general update powers. Moving INTO a hardened tier requires
 * role >= parent, same bar as creating directly into one; moving OUT of a
 * hardened tier (back to standard) is allowed for anyone who could already
 * view it, i.e. also role >= parent, since only parents can see hardened
 * items in the first place.
 */
vaultRouter.patch('/:itemId', async (req: VaultRequest, res, next) => {
  try {
    const input = MoveVaultItemInputSchema.parse(req.body);
    const familyId = req.params.familyId;
    const itemRef = db.collection('families').doc(familyId).collection('vaultItems').doc(req.params.itemId);
    const snap = await itemRef.get();
    if (!snap.exists) {
      throw new ApiError(404, 'Vault item not found');
    }
    const item = snap.data() as VaultItem;
    const role = req.member!.role;

    const involvesHardened = isHardened(item.folderType) || isHardened(input.folderType);
    if (involvesHardened && !hasAtLeastRole(role, 'parent')) {
      throw new ApiError(403, 'Requires role >= parent to move items into or out of a hardened folder');
    }

    const updated: VaultItem = { ...item, folderType: input.folderType };
    await itemRef.set(updated);

    if (isHardened(updated.folderType)) {
      await writeAuditLog(familyId, updated, 'move', req.uid!);
    }

    return res.json(updated);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/**
 * DELETE /v1/families/:familyId/vault/:itemId — only removes the Firestore
 * reference, never the underlying Drive file. Allowed for: whoever added
 * it, or anyone role >= parent. Deleting a hardened item additionally
 * requires role >= parent regardless of who added it (the "whoever added
 * it" exception only applies to standard items).
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
    const hardened = isHardened(item.folderType);
    const allowed = hardened ? hasAtLeastRole(role, 'parent') : item.addedBy === uid || hasAtLeastRole(role, 'parent');
    if (!allowed) {
      throw new ApiError(403, 'Not permitted to delete this vault item');
    }

    await itemRef.delete();
    if (hardened) {
      await writeAuditLog(familyId, item, 'delete', uid);
    }
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
