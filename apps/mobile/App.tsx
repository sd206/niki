import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';
import SignInScreen from '@/screens/SignInScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import HomeScreen from '@/screens/HomeScreen';
import SettingsScreen from '@/screens/SettingsScreen';

type Screen = 'home' | 'settings';

export default function App() {
  const { user, loading } = useAuth();
  const [hasFamily, setHasFamily] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>('home');

  useEffect(() => {
    if (!user) {
      setHasFamily(null);
      return;
    }
    api.users
      .me()
      .then((profile) => setHasFamily(profile.familyIds.length > 0))
      .catch(() => setHasFamily(false));
  }, [user]);

  if (loading || (user && hasFamily === null)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <SignInScreen />
        <StatusBar style="auto" />
      </>
    );
  }

  if (!hasFamily) {
    return (
      <>
        <OnboardingScreen onDone={() => setHasFamily(true)} />
        <StatusBar style="auto" />
      </>
    );
  }

  return (
    <>
      {screen === 'home' ? (
        <HomeScreen onOpenSettings={() => setScreen('settings')} />
      ) : (
        <SettingsScreen />
      )}
      <StatusBar style="auto" />
    </>
  );
}
