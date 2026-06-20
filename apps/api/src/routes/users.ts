import { Router } from 'express';
import type { UserProfile } from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { authenticate, type AuthedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

export const usersRouter = Router();
usersRouter.use(authenticate);

/**
 * GET /v1/users/me
 * Returns the caller's profile, creating it on first sign-in
 * (Firebase Auth has no "user created in our system" hook here —
 * this lazy-create-on-first-call pattern keeps onboarding simple).
 */
usersRouter.get('/me', async (req: AuthedRequest, res, next) => {
  try {
    const uid = req.uid!;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();

    if (snap.exists) {
      return res.json(snap.data() as UserProfile);
    }

    const now = new Date().toISOString();
    const profile: UserProfile = {
      uid,
      email: req.userEmail ?? '',
      displayName: req.userEmail?.split('@')[0] ?? 'New User',
      familyIds: [],
      driveConnected: false,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(profile);
    return res.status(201).json(profile);
  } catch (err) {
    next(err instanceof Error ? err : new ApiError(500, 'Failed to load profile'));
  }
});
