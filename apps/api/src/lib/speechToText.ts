import { GoogleAuth } from 'google-auth-library';

/**
 * Thin REST wrapper around Cloud Speech-to-Text **v2** (not v1) — chosen
 * specifically because v2's `autoDecodingConfig` auto-detects the audio
 * container/codec from the file itself. That matters here because web and
 * mobile record in genuinely different formats with no easy common ground:
 * browsers' MediaRecorder defaults to WebM/Opus, while Expo's default
 * recording preset produces an M4A/AAC container on both iOS and Android
 * (and Android's MediaRecorder has no built-in WAV/PCM option, so forcing a
 * single shared format would mean fragile custom native config). v2
 * explicitly supports both WEBM_OPUS and MP4_AAC/M4A_AAC, so one code path
 * handles both clients without per-platform encoding logic.
 *
 * No pre-created "recognizer" resource is needed — `recognizers/_` is the
 * implicit/default recognizer for ad-hoc requests like this.
 */
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
const LOCATION = 'global';

/** False when no GCP project is configured — callers should return 503, not throw. */
export const speechToTextConfigured = Boolean(PROJECT_ID);

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to obtain Speech-to-Text access token');
  return token.token;
}

/**
 * Transcribes a short voice clip (expense logging is a few seconds, well
 * under the ~60s sync-recognize limit — no need for the async/streaming
 * APIs here). Returns the empty string if Speech-to-Text heard nothing
 * intelligible, rather than throwing, so the caller can fall back to "please
 * type it instead" without treating silence as a hard error.
 */
export async function transcribeAudio(content: Buffer): Promise<string> {
  if (!speechToTextConfigured) {
    throw new Error('Speech-to-Text is not configured (set GOOGLE_CLOUD_PROJECT)');
  }
  const token = await getAccessToken();
  const url = `https://speech.googleapis.com/v2/projects/${PROJECT_ID}/locations/${LOCATION}/recognizers/_:recognize`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        autoDecodingConfig: {},
        languageCodes: ['en-US'],
        model: 'long',
      },
      content: content.toString('base64'),
    }),
  });
  if (!res.ok) {
    throw new Error(`Speech-to-Text request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
  };
  return (data.results ?? [])
    .map((r) => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();
}
