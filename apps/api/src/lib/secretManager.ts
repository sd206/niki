import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';

function secretName(uid: string) {
  return `drive-refresh-${uid}`;
}

/** Creates the secret if needed, then adds a new version with `value`. */
export async function storeDriveRefreshToken(uid: string, value: string): Promise<void> {
  const name = secretName(uid);
  const parent = `projects/${projectId}`;
  const fullName = `${parent}/secrets/${name}`;

  try {
    await client.getSecret({ name: fullName });
  } catch {
    await client.createSecret({
      parent,
      secretId: name,
      secret: { replication: { automatic: {} } },
    });
  }

  await client.addSecretVersion({
    parent: fullName,
    payload: { data: Buffer.from(value, 'utf8') },
  });
}

export async function getDriveRefreshToken(uid: string): Promise<string | null> {
  const name = `projects/${projectId}/secrets/${secretName(uid)}/versions/latest`;
  try {
    const [version] = await client.accessSecretVersion({ name });
    return version.payload?.data?.toString() ?? null;
  } catch {
    return null;
  }
}
