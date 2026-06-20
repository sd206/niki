import { OAuth2Client } from 'google-auth-library';

/**
 * Separate OAuth client from Firebase Auth's Google Sign-In. We need an
 * authorization-code flow with access_type=offline to get a refresh token
 * for background Drive access (AI indexing, etc.) — Firebase's client-side
 * sign-in only ever gives a short-lived access token, never a refresh token.
 *
 * Requires its own "Web application" OAuth client ID in the GCP project's
 * Credentials page, with this exact redirect URI registered.
 */
export function getDriveOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: process.env.DRIVE_OAUTH_CLIENT_ID,
    clientSecret: process.env.DRIVE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.DRIVE_OAUTH_REDIRECT_URI, // e.g. https://niki.app/v1/drive/callback
  });
}

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
