import type { NextFunction, Request, Response } from 'express';
import { auth } from '../lib/firebaseAdmin';

export interface AuthedRequest extends Request {
  uid?: string;
  userEmail?: string;
}

/**
 * Verifies the Firebase ID token sent in the Authorization header.
 * This is the ONLY thing protecting this API — Cloud Run itself stays
 * --no-allow-unauthenticated, but Firebase Hosting's rewrite (web) and
 * direct Cloud Run calls (mobile) both still need a real user identity,
 * which is what this checks.
 */
export async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
