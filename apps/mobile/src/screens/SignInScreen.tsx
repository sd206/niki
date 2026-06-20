import { View, Text, Button, StyleSheet } from 'react-native';
import { useAuth } from '@/lib/useAuth';

export default function SignInScreen() {
  const { signIn, signInReady } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Niki</Text>
      <Text style={styles.subtitle}>Your family&apos;s operating system.</Text>
      <Button title="Sign in with Google" disabled={!signInReady} onPress={() => signIn()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 16, color: '#555', marginBottom: 24 },
});
