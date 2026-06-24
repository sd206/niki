import { useState } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { api } from '@/lib/api';
import type { ExpenseCategory } from '@niki/shared';
import { EXPENSE_CATEGORIES } from '@niki/shared';

/**
 * Phase 2.B.3 — voice-expense capture, mobile half of the user's explicit
 * "web + mobile simultaneously" choice. Records a short clip with expo-av,
 * sends it to the existing POST /expenses/transcribe-voice (same endpoint
 * web uses), and pre-fills this draft form — never auto-creates an Expense.
 * The user reviews/edits every field and taps "Add expense" to actually
 * submit via the unchanged POST /expenses, same "always draft, never
 * auto-create" principle as web's ExpensesTab.
 */
export default function VoiceExpenseScreen({
  familyId,
  onBack,
}: {
  familyId: string;
  onBack: () => void;
}) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');

  function resetForm() {
    setAmount('');
    setMerchant('');
    setDate('');
    setCategory('other');
    setTranscript('');
  }

  async function startRecording() {
    setError(null);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission denied');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
    } catch {
      setError('Could not start recording');
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setError(null);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) {
        setError('Recording produced no audio');
        return;
      }
      await handleTranscribe(uri);
    } catch {
      setError('Could not stop recording');
    }
  }

  async function handleTranscribe(uri: string) {
    setTranscribing(true);
    setError(null);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const draft = await api.expenses.transcribeVoice(familyId, base64);
      setTranscript(draft.transcript);
      if (draft.amount !== undefined) setAmount(String(draft.amount));
      if (draft.merchant !== undefined) setMerchant(draft.merchant);
      if (draft.category !== undefined) setCategory(draft.category);
      if (draft.date !== undefined) setDate(draft.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transcribe voice input');
    } finally {
      setTranscribing(false);
    }
  }

  async function handleCreate() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || !merchant || !date) {
      setError('Amount, merchant, and date are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.expenses.create(familyId, {
        amount: amt,
        merchant,
        date,
        category,
        source: 'voice',
      });
      resetForm();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log expense');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Speak an expense</Text>
      <Text style={styles.subtitle}>
        Record a few seconds describing the expense (e.g. "Twenty three dollars at Trader Joe's
        yesterday for groceries"). Review the fields below before saving — nothing is saved
        automatically.
      </Text>

      <View style={{ marginTop: 16 }}>
        {!recording ? (
          <Button title="🎤 Start recording" onPress={startRecording} disabled={transcribing} />
        ) : (
          <Button title="⏹ Stop recording" onPress={stopRecording} color="crimson" />
        )}
      </View>

      {transcribing && <Text style={styles.hint}>Transcribing…</Text>}
      {transcript ? <Text style={styles.transcript}>Heard: "{transcript}"</Text> : null}
      {error && <Text style={styles.error}>{error}</Text>}
      {done && <Text style={styles.success}>Expense logged.</Text>}

      <View style={{ marginTop: 20 }}>
        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          value={amount}
          onChangeText={setAmount}
        />

        <Text style={styles.label}>Merchant</Text>
        <TextInput style={styles.input} placeholder="Merchant" value={merchant} onChangeText={setMerchant} />

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} placeholder="2026-06-23" value={date} onChangeText={setDate} />

        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryRow}>
          {EXPENSE_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.categoryChip, category === c && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 16 }}>
          <Button
            title={busy ? 'Saving…' : 'Add expense'}
            onPress={handleCreate}
            disabled={busy || !amount || !merchant || !date}
          />
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        <Button title="Back" onPress={onBack} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 64 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { marginTop: 8, color: '#666', fontSize: 13 },
  hint: { marginTop: 12, color: '#666', fontStyle: 'italic' },
  transcript: { marginTop: 12, color: '#444', fontStyle: 'italic' },
  error: { marginTop: 12, color: 'crimson' },
  success: { marginTop: 12, color: 'green' },
  label: { marginTop: 12, fontWeight: '600', fontSize: 13 },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
  },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  categoryChipActive: { backgroundColor: '#1a3d7c', borderColor: '#1a3d7c' },
  categoryChipText: { fontSize: 12, color: '#333' },
  categoryChipTextActive: { color: '#fff' },
});
