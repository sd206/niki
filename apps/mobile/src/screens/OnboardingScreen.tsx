import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { api } from '@/lib/api';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await api.families.create({ name: familyName });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create family');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setBusy(true);
    setError(null);
    try {
      await api.families.acceptInvite(inviteCode);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join family');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set up your family</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Create a new family</Text>
      <TextInput
        style={styles.input}
        placeholder="Family name (e.g. The Dasaris)"
        value={familyName}
        onChangeText={setFamilyName}
      />
      <Button title="Create family" disabled={busy || !familyName} onPress={handleCreate} />

      <Text style={[styles.label, { marginTop: 32 }]}>Or join with an invite code</Text>
      <TextInput
        style={styles.input}
        placeholder="Invite code"
        value={inviteCode}
        onChangeText={setInviteCode}
      />
      <Button title="Join family" disabled={busy || !inviteCode} onPress={handleJoin} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  error: { color: 'crimson', marginBottom: 12 },
});
