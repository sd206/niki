import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * On Cloud Run, the attached service account + GOOGLE_CLOUD_PROJECT env var
 * are enough for initializeApp() to auto-discover credentials and project.
 * Locally, set GOOGLE_APPLICATION_CREDENTIALS to a service account key file.
 */
if (!getApps().length) {
  initializeApp(
    process.env.FIREBASE_PROJECT_ID
      ? { projectId: process.env.FIREBASE_PROJECT_ID }
      : undefined,
  );
}

export const auth = getAuth();
export const db = getFirestore();
