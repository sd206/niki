# Niki — GCP/Firebase setup

Run these once, in order, against your **new** GCP project. Doing it in this
order avoids every failure mode that ate weeks on Fount (cross-project IAM,
Functions + VPC-SC, missing Artifact Registry repo, `allUsers` policy blocks).
The key difference from Fount: Cloud Build runs in the **same project** it
deploys to, so there's no cross-project IAM to fight, and there is no
Firebase Functions anywhere in this stack — Cloud Run only.

## 0. Create the project

```bash
gcloud projects create niki-app-prod --name="Niki"
gcloud config set project niki-app-prod
```

If your org's policy blocks `allUsers`/`allAuthenticatedUsers` bindings (the
thing that broke Fount), it doesn't matter here — Cloud Run stays
`--no-allow-unauthenticated` the whole time, by design.

## 1. Enable required APIs (do this before anything else)

```bash
gcloud services enable \
  firebase.googleapis.com \
  firestore.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  identitytoolkit.googleapis.com \
  drive.googleapis.com \
  aiplatform.googleapis.com \
  --project=niki-app-prod
```

## 2. Link Firebase

```bash
npx firebase-tools projects:addfirebase niki-app-prod
npx firebase-tools login:ci   # generates a CI token; save it as FIREBASE_TOKEN in GitHub Secrets
```

In the Firebase Console (console.firebase.google.com), project niki-app-prod:
- Authentication > Sign-in method > enable **Google**.
- Authentication > Settings > Authorized domains: add `niki-app-d035f.web.app` and
  `niki-app-d035f.firebaseapp.com` (added automatically) plus your custom domain if any.
- Project Settings > General > add a **Web app** — copy the config into
  `apps/web/.env.local` (dev) and into GitHub Secrets (CI):
  `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
  `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- Project Settings > General > add an **iOS app** (`com.niki.app`) and an
  **Android app** (`com.niki.app`) for the mobile OAuth client IDs — these land
  in `apps/mobile/.env.local` as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` /
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`. The web client ID
  (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) is the same OAuth client Firebase
  created for the web app above.

## 3. Create the Firebase Hosting site

```bash
npx firebase-tools hosting:sites:create niki-app-d035f --project=niki-app-prod
```

(`firebase.json` already targets the site name `niki-app-d035f` — rename it there
too if you pick a different site name.)

## 4. Create the Artifact Registry repo (must exist before the first Cloud Build)

```bash
gcloud artifacts repositories create niki \
  --repository-format=docker \
  --location=us-central1 \
  --project=niki-app-prod
```

## 5. Grant Cloud Build's own service account the roles it needs

Same project this time, so it's just two grants, no cross-project dance:

```bash
PROJECT_NUMBER=$(gcloud projects describe niki-app-prod --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding niki-app-prod \
  --member="serviceAccount:${CB_SA}" --role="roles/run.admin"

gcloud projects add-iam-policy-binding niki-app-prod \
  --member="serviceAccount:${CB_SA}" --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding niki-app-prod \
  --member="serviceAccount:${CB_SA}" --role="roles/secretmanager.secretAccessor"
```

(`roles/artifactregistry.writer` is included by default for Cloud Build's own
project's repos — only needed explicitly for cross-project pushes, which we're
not doing here.)

## 6. Set up the Drive OAuth client (separate from Firebase's Google Sign-In client)

Firebase's Google Sign-In gives you an identity + short-lived access token,
not a refresh token — Drive's background access needs its own
authorization-code-flow OAuth client:

1. APIs & Services > OAuth consent screen: configure it (External, add your
   support email, add scope `drive.file`).
2. APIs & Services > Credentials > Create Credentials > OAuth client ID >
   **Web application**.
   - Authorized redirect URI: `https://niki-app-d035f.web.app/v1/drive/callback`
     (this resolves to Cloud Run via the Firebase Hosting rewrite once step 8
     is deployed — Google's redirect hits Firebase Hosting just like any
     other browser request).
3. Store the client ID/secret/redirect URI in Secret Manager:

```bash
echo -n "YOUR_CLIENT_ID" | gcloud secrets create drive-oauth-client-id --data-file=- --project=niki-app-prod
echo -n "YOUR_CLIENT_SECRET" | gcloud secrets create drive-oauth-client-secret --data-file=- --project=niki-app-prod
echo -n "https://niki-app-d035f.web.app/v1/drive/callback" | gcloud secrets create drive-oauth-redirect-uri --data-file=- --project=niki-app-prod
```

## 7. First deploy — API via Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml --project=niki-app-prod .
```

This builds the Docker image, pushes it to the Artifact Registry repo from
step 4, and deploys `niki-api` to Cloud Run (`--no-allow-unauthenticated`).

## 8. First deploy — Web via Firebase Hosting

```bash
yarn workspace @niki/shared build
yarn workspace @niki/web build
npx firebase-tools deploy --only hosting,firestore --project=niki-app-prod
```

Once both are deployed, `https://niki-app-d035f.web.app/v1/**` resolves through the
Hosting rewrite to the `niki-api` Cloud Run service — same-origin, zero CORS
for the web app, with Cloud Run never exposed publicly.

## 9. CI/CD secrets (GitHub Actions)

In the repo's Settings > Secrets, add:
- `FIREBASE_TOKEN` (from step 2's `login:ci`)
- `FIREBASE_PROJECT_ID` = `niki-app-prod`
- `GCP_PROJECT_ID` = `niki-app-prod`
- `GCP_SA_KEY` — a JSON key for a service account with `roles/cloudbuild.builds.editor`
  and `roles/artifactregistry.writer` on `niki-app-prod`, used by
  `.github/workflows/deploy.yml`'s `deploy-api` job to call `gcloud builds submit`
- The six `NEXT_PUBLIC_FIREBASE_*` values from step 2

## 10. Mobile (manual, not in CI for Phase 0)

```bash
cd apps/mobile
cp .env.local.example .env.local   # fill in Firebase + Google OAuth client IDs
npx expo start
```

`EXPO_PUBLIC_API_URL` should point at the Firebase Hosting URL
(`https://niki-app-d035f.web.app/v1`), the same one web uses — **not** the raw
Cloud Run URL. Cloud Run stays `--no-allow-unauthenticated`; its IAM layer
only accepts Google-signed invoker tokens, not Firebase Auth ID tokens, so a
direct-to-Cloud-Run call from the app would be rejected before it ever
reached Express. Hosting's rewrite is already authorized to invoke Cloud Run
automatically, so routing mobile through it keeps Cloud Run private with no
extra IAM setup.

EAS Build wiring for actual App Store/Play Store builds comes later — Phase 0
just needs the Expo dev client working end-to-end against the deployed API.
