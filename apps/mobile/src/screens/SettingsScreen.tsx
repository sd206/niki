import { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import type { DriveConnection } from '@niki/shared';

export default function SettingsScreen() {
  const { signOutUser } = useAuth();
  const [drive, setDrive] = useState<DriveConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.drive.status().then(setDrive).catch((e) => setError(e.message));
  }, []);

  async function handleConnect() {
    try {
      const redirectTo = Linking.createURL('drive-callback');
      const { url } = await api.drive.connect(redirectTo);
      const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
      if (result.type === 'success') {
        const status = await api.drive.status();
        setDrive(status);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Drive connection');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Google Drive</Text>
      <Text>Status: {drive?.status ?? 'loading…'}</Text>
      {drive?.status !== 'connected' && (
        <Button title="Connect Google Drive" onPress={handleConnect} />
      )}

      <View style={{ marginTop: 32 }}>
        <Button title="Sign out" onPress={() => signOutUser()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 4 },
  error: { color: 'crimson', marginBottom: 12 },
});
