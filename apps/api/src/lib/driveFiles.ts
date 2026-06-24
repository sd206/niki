import { getDriveOAuthClient } from './driveOAuth';
import { getDriveRefreshToken } from './secretManager';

/**
 * Fetches a Drive file's actual bytes + mime type, for server-side processing
 * (Phase 2.B.2 receipt OCR is the first caller). This is a deliberate,
 * narrow exception to "Niki never touches file bytes" (see vault.ts) — the
 * bytes are fetched on demand for a single OCR call and never persisted
 * anywhere; nothing is written to Firestore or Cloud Storage.
 *
 * KNOWN LIMITATION (documented, not solved this pass): this uses `uid`'s own
 * Drive OAuth grant. If a different family member added the Vault item via
 * their own Drive Picker session, `uid` may not have read access to that
 * specific file unless it happens to be shared with them — Drive Picker's
 * `drive.file` scope only grants access to files the *picking* user opened
 * or created. Fetching by uid !== addedBy can therefore 403 upstream; the
 * caller (routes/expenses.ts) surfaces that as a clear error rather than a
 * silent failure. Properly solving this would mean either always fetching
 * with the original adder's token, or re-sharing on add — deferred.
 */
export async function fetchDriveFileBytes(
  uid: string,
  fileId: string,
): Promise<{ content: Buffer; mimeType: string }> {
  const refreshToken = await getDriveRefreshToken(uid);
  if (!refreshToken) {
    throw new Error('Drive is not connected for this user');
  }

  const client = getDriveOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error('Failed to obtain a Drive access token');
  }

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaRes.ok) {
    throw new Error(`Drive file metadata request failed: ${metaRes.status} ${await metaRes.text()}`);
  }
  const { mimeType } = (await metaRes.json()) as { mimeType: string };

  const contentRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!contentRes.ok) {
    throw new Error(`Drive file content request failed: ${contentRes.status} ${await contentRes.text()}`);
  }
  const content = Buffer.from(await contentRes.arrayBuffer());

  return { content, mimeType };
}
