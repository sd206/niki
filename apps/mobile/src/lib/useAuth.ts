import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

WebBrowser.maybeCompleteAuthSession();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    // Three separate OAuth client IDs from GCP Console > Credentials —
    // Firebase creates these automatically when you add iOS/Android/Web apps.
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      const credential = GoogleAuthProvider.credential(response.params.id_token);
      signInWithCredential(auth, credential).catch((e) => console.error('Sign-in failed', e));
    }
  }, [response]);

  return {
    user,
    loading,
    signIn: () => promptAsync(),
    signInReady: !!request,
    signOutUser: () => signOut(auth),
  };
}
