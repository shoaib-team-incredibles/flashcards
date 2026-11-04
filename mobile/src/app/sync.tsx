import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, HeaderText, Icon } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { sync } from '@/lib/sync';
import { radius, useColors } from '@/lib/theme';

/** Sign in with email and password so decks sync with KnowDeck on the web. */
export default function SyncSignIn() {
  const c = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'in' | 'up' | null>(null);
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const submit = async (mode: 'in' | 'up') => {
    if (busy) return;
    const problem = !/.+@.+\..+/.test(email.trim())
      ? 'Enter your email address.'
      : password.length < 6
        ? 'Use a password with at least 6 characters.'
        : null;
    if (problem) {
      haptic.warning();
      Alert.alert(mode === 'in' ? 'Can’t sign in yet' : 'Can’t create the account yet', problem);
      return;
    }
    setBusy(mode);
    try {
      if (mode === 'in') {
        await sync.signIn(email, password);
      } else if (!(await sync.signUp(email, password))) {
        haptic.light();
        Alert.alert('Confirm your email', 'Your account was created. Confirm your email address, then sign in here.');
        return;
      }
      haptic.success();
      router.back();
    } catch (e) {
      haptic.warning();
      Alert.alert(mode === 'in' ? 'Couldn’t sign in' : 'Couldn’t create the account', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const field = [styles.input, { backgroundColor: c.surface, color: c.fg }];

  return (
    <>
      <Stack.Screen options={{ title: 'Sync', headerLeft: () => <HeaderText label="Cancel" onPress={() => router.back()} /> }} />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.badge, { backgroundColor: c.accent + '1A' }]}>
          <Icon name="arrow.triangle.2.circlepath.icloud.fill" size={34} color={c.accent} />
        </View>
        <Text style={[styles.title, { color: c.fg }]}>Sync with KnowDeck on the web</Text>
        <Text style={[styles.body, { color: c.muted }]}>
          Use the same email and password on each device. Decks, cards and review history stay in step.
        </Text>

        <View style={[styles.group, { backgroundColor: c.surface }]}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={c.faint}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            style={field}
          />
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            placeholder="Password (6+ characters)"
            placeholderTextColor={c.faint}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => submit('in')}
            style={field}
          />
        </View>

        <Button title={busy === 'in' ? 'Signing in…' : 'Sign in'} size="lg" disabled={!!busy} onPress={() => submit('in')} />
        <Button title={busy === 'up' ? 'Creating account…' : 'Create account'} variant="secondary" size="lg" disabled={!!busy} onPress={() => submit('up')} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  badge: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8, borderCurve: 'continuous' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  group: { borderRadius: radius.md, overflow: 'hidden', borderCurve: 'continuous' },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
