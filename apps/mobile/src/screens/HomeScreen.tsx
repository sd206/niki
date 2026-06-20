import { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { api } from '@/lib/api';
import type { UserProfile } from '@niki/shared';

export default function HomeScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    api.users.me().then(setProfile).catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome{profile ? `, ${profile.displayName}` : ''}</Text>
      <Text>
        {profile?.familyIds.length ?? 0} family(ies). Modules (Vault, Events, Tasks…) land in
        later phases.
      </Text>
      <View style={{ marginTop: 32 }}>
        <Button title="Settings" onPress={onOpenSettings} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
});
