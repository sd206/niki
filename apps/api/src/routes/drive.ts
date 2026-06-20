import { randomBytes } from 'crypto';
import { Router } from 'express';
import type { DriveConnection } from '@niki/shared';
import { db } from '../lib/firebaseAdmin';
import { getDriveOAuthClient, DRIVE_SCOPES } from '../lib/driveOAuth';
import { storeDriveRefreshToken } from '../lib/secretManager';
import { authenticate, type AuthedRequest } from '../middleware/auth';

export const driveRouter = Router();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * NOTE: unlike usersRouter/familiesRouter, we do NOT call
 * `driveRouter.use(authenticate)` here. /callback is hit by a plain browser
 * redirect from Google with no Authorization header, so it can't go through
 * the auth middleware. /connect and /status apply `authenticate` individually
 * below instead.
 */

/**
 * POST /v1/drive/connect — authenticated. Returns the Google consent URL.
 *
 * Google's redirect back to /v1/drive/callback has no Firebase Authorization
 * header (it's a plain browser redirect), so we can't rely on auth middleware
 * there. Instead we mint a one-time `state` token now, while we still know
 * who the caller is, and store {state -> uid} so callback can recover it.
 */
driveRouter.post('/connect', authenticate, async (req: AuthedRequest, res, next) => {
  try {
    const uid = req.uid!;
    const state = randomBytes(16).toString('hex');
    // Mobile passes its own deep-link redirect (e.g. niki://drive-callback) since
    // it can't land on the web app's /settings page after the OAuth round trip.
    const redirectTo = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo : undefined;
    await db.collection('oauthStates').doc(state).set({
      uid,
      createdAt: Date.now(),
      redirectTo: redirectTo ?? null,
    });

    const client = getDriveOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: DRIVE_SCOPES,
      state,
    });

    return res.json({ url });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/drive/callback — NOT behind the auth middleware (see above).
 * Google redirects here with ?code=...&state=...
 */
driveRouter.get('/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const webOrigin = process.env.WEB_ORIGIN ?? 'https://niki.app';

  if (!code || !state) {
    return res.redirect(`${webOrigin}/settings?drive=error`);
  }

  const stateDoc = await db.collection('oauthStates').doc(state).get();
  if (!stateDoc.exists) {
    return res.redirect(`${webOrigin}/settings?drive=error`);
  }
  const { uid, createdAt, redirectTo } = stateDoc.data() as {
    uid: string;
    createdAt: number;
    redirectTo: string | null;
  };
  await stateDoc.ref.delete(); // one-time use
  const target = redirectTo || `${webOrigin}/settings`;
  const sep = target.includes('?') ? '&' : '?';

  if (Date.now() - createdAt > STATE_TTL_MS) {
    return res.redirect(`${target}${sep}drive=expired`);
  }

  try {
    const client = getDriveOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      // Happens if the user had already granted consent before and Google
      // skips re-issuing a refresh token. Re-prompting with prompt=consent
      // (already set above) should prevent this in normal flow.
      return res.redirect(`${target}${sep}drive=error`);
    }

    await storeDriveRefreshToken(uid, tokens.refresh_token);

    const connection: DriveConnection = {
      uid,
      status: 'connected',
      scopes: tokens.scope?.split(' ') ?? [],
      connectedAt: new Date().toISOString(),
    };
    await db.collection('driveConnections').doc(uid).set(connection);
    await db.collection('users').doc(uid).update({ driveConnected: true });

    return res.redirect(`${target}${sep}drive=connected`);
  } catch (err) {
    console.error('Drive OAuth callback failed', err);
    return res.redirect(`${target}${sep}drive=error`);
  }
});

/** GET /v1/drive/status — authenticated. */
driveRouter.get('/status', authenticate, async (req: AuthedRequest, res, next) => {
  try {
    const snap = await db.collection('driveConnections').doc(req.uid!).get();
    if (!snap.exists) {
      return res.json({ uid: req.uid, status: 'disconnected', scopes: [] } satisfies DriveConnection);
    }
    return res.json(snap.data() as DriveConnection);
  } catch (err) {
    next(err);
  }
});
