import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-expect-error — getReactNativePersistence ships under @firebase/auth's
// "react-native" package.json export condition. tsc's node10 module
// resolution (required by Expo/Metro's bundler) doesn't evaluate export
// conditions at all, so this named export is invisible to static types even
// though it exists and works correctly at runtime via Metro's RN-aware
// resolver. This is a known Firebase + Expo/TypeScript gap, not a bug here.
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same Firebase project as the web app — values come from Firebase Console
// > Project Settings > General > Your apps > Web app config (Firebase web
// config works fine for the JS SDK on React Native too).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const alreadyInitialized = getApps().length > 0;
export const firebaseApp = alreadyInitialized ? getApp() : initializeApp(firebaseConfig);

// initializeAuth() may only be called once per app (throws on a second call,
// e.g. during Expo's fast-refresh) — fall back to getAuth() in that case.
export const auth = alreadyInitialized
  ? getAuth(firebaseApp)
  : initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
