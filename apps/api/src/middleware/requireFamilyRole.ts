import type { NextFunction, Response } from 'express';
import { hasAtLeastRole, type Role } from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import type { AuthedRequest } from './auth';

/**
 * Loads the caller's membership doc for :familyId and attaches it to
 * req.member. Optionally enforces a minimum role.
 */
export function requireFamilyRole(minimum?: Role) {
  return async (req: AuthedRequest & { member?: { role: Role } }, res: Response, next: NextFunction) => {
    const familyId = req.params.familyId;
    const uid = req.uid!;
    const memberSnap = await db
      .collection('families')
      .doc(familyId)
      .collection('members')
      .doc(uid)
      .get();

    if (!memberSnap.exists) {
      return res.status(403).json({ error: 'Not a member of this family' });
    }

    const member = memberSnap.data() as { role: Role; status: string };
    if (member.status !== 'active') {
      return res.status(403).json({ error: 'Membership is not active' });
    }
    if (minimum && !hasAtLeastRole(member.role, minimum)) {
      return res.status(403).json({ error: `Requires role >= ${minimum}` });
    }

    req.member = member;
    return next();
  };
}
