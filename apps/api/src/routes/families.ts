import { randomBytes } from 'crypto';
import { Router } from 'express';
import {
  CreateFamilyInputSchema,
  CreateInviteInputSchema,
  type Family,
  type Invite,
  type Member,
} from '@niki/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { requireFamilyRole } from '../middleware/requireFamilyRole';
import { ApiError } from '../middleware/errorHandler';

export const familiesRouter = Router();
familiesRouter.use(authenticate);

/** POST /v1/families — create a new family, caller becomes owner. */
familiesRouter.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const input = CreateFamilyInputSchema.parse(req.body);
    const uid = req.uid!;
    const now = new Date().toISOString();

    const familyRef = db.collection('families').doc();
    const family: Family = {
      id: familyRef.id,
      name: input.name,
      ownerId: uid,
      plan: 'free',
      createdAt: now,
      updatedAt: now,
    };

    const member: Member = {
      uid,
      familyId: familyRef.id,
      displayName: req.userEmail?.split('@')[0] ?? 'Owner',
      email: req.userEmail ?? '',
      role: 'owner',
      status: 'active',
      joinedAt: now,
    };

    const batch = db.batch();
    batch.set(familyRef, family);
    batch.set(familyRef.collection('members').doc(uid), member);
    batch.update(db.collection('users').doc(uid), {
      familyIds: FieldValue.arrayUnion(familyRef.id),
      updatedAt: now,
    });
    await batch.commit();

    return res.status(201).json(family);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
  }
});

/** GET /v1/families/:familyId — family details + member list. Any member can view. */
familiesRouter.get('/:familyId', requireFamilyRole(), async (req: AuthedRequest, res, next) => {
  try {
    const familyRef = db.collection('families').doc(req.params.familyId);
    const [familySnap, membersSnap] = await Promise.all([
      familyRef.get(),
      familyRef.collection('members').get(),
    ]);

    if (!familySnap.exists) {
      throw new ApiError(404, 'Family not found');
    }

    return res.json({
      family: familySnap.data() as Family,
      members: membersSnap.docs.map((d) => d.data() as Member),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /v1/families/:familyId/invites — owner/parent only. */
familiesRouter.post(
  '/:familyId/invites',
  requireFamilyRole('parent'),
  async (req: AuthedRequest, res, next) => {
    try {
      const input = CreateInviteInputSchema.parse(req.body);
      const familyId = req.params.familyId;
      const now = new Date();
      const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const inviteRef = db.collection('invites').doc();
      const invite: Invite = {
        id: inviteRef.id,
        familyId,
        email: input.email,
        role: input.role,
        invitedBy: req.uid!,
        status: 'pending',
        code: randomBytes(6).toString('hex'),
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };
      await inviteRef.set(invite);

      // Sending the actual invite email/SMS is wired up in a later phase
      // (Notifications module). For now the caller can share invite.code directly.
      return res.status(201).json(invite);
    } catch (err) {
      next(err instanceof Error ? err : new ApiError(400, 'Invalid input'));
    }
  },
);

/** POST /v1/invites/:code/accept — any authenticated user accepts an invite by code. */
familiesRouter.post('/invites/:code/accept', async (req: AuthedRequest, res, next) => {
  try {
    const uid = req.uid!;
    const inviteQuery = await db
      .collection('invites')
      .where('code', '==', req.params.code)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (inviteQuery.empty) {
      throw new ApiError(404, 'Invite not found or already used');
    }

    const inviteDoc = inviteQuery.docs[0];
    const invite = inviteDoc.data() as Invite;

    if (new Date(invite.expiresAt) < new Date()) {
      throw new ApiError(410, 'Invite has expired');
    }

    const now = new Date().toISOString();
    const member: Member = {
      uid,
      familyId: invite.familyId,
      displayName: req.userEmail?.split('@')[0] ?? 'Member',
      email: req.userEmail ?? invite.email,
      role: invite.role,
      status: 'active',
      joinedAt: now,
    };

    const batch = db.batch();
    batch.set(
      db.collection('families').doc(invite.familyId).collection('members').doc(uid),
      member,
    );
    batch.update(inviteDoc.ref, { status: 'accepted' });
    batch.update(db.collection('users').doc(uid), {
      familyIds: FieldValue.arrayUnion(invite.familyId),
      updatedAt: now,
    });
    await batch.commit();

    return res.json(member);
  } catch (err) {
    next(err);
  }
});
