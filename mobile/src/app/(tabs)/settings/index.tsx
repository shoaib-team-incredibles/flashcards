import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { HeaderLogo, Row, Section } from '@/components/ui';
import { exportBackup, getCards, getDecks, isBackup, restoreBackup, useQuery, wipeAll } from '@/lib/db';
import { haptic } from '@/lib/haptics';
import { setPref, usePrefs, type ThemePref } from '@/lib/prefs';
import { loadSampleDecks } from '@/lib/sample';
import { sync, useSyncStatus } from '@/lib/sync';
import { useColors } from '@/lib/theme';
import { checkForUpdates, currentRelease, restartToUpdate, updatesEnabled, useUpdates } from '@/lib/updates';
import { dayKey, plural, relativeTime } from '@/lib/utils';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'Match system' },
];

export default function Settings() {
  const c = useColors();
  const prefs = usePrefs();
  const counts = useQuery(() => ({ decks: getDecks().length, cards: getCards().length }));
  const syncStatus = useSyncStatus();
  const { isUpdatePending, isChecking, isDownloading } = useUpdates();

  const backup = async () => {
    try {
      const file = new File(Paths.cache, `recall-backup-${dayKey(Date.now())}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(exportBackup()));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save KnowDeck backup' });
    } catch (e) {
      Alert.alert('Backup failed', String(e));
    }
  };

  const restore = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
    if (res.canceled) return;
    try {
      const data = JSON.parse(await new File(res.assets[0].uri).text());
      if (!isBackup(data)) throw new Error('This file isn’t a KnowDeck backup.');
      Alert.alert('Restore backup', `${plural(data.decks.length, 'deck')} and ${plural(data.cards.length, 'card')}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: () => { restoreBackup(data, 'merge'); haptic.success(); } },
        { text: 'Replace everything', style: 'destructive', onPress: () => { restoreBackup(data, 'replace'); haptic.success(); } },
      ]);
    } catch (e) {
      Alert.alert('Couldn’t restore', e instanceof Error ? e.message : String(e));
    }
  };

  const erase = () =>
    Alert.alert(
      'Erase all data?',
      syncStatus.email
        ? 'Every deck, card and review will be deleted here and on your other synced devices. Back up first if you want to keep them.'
        : 'Every deck, card and review on this device will be deleted. Back up first if you want to keep them.',
      [
      { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: () => { wipeAll(); haptic.warning(); } },
      ],
    );

  const signOut = () =>
    Alert.alert('Sign out of sync?', 'Your decks stay on this device. They stop syncing until you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => sync.signOut() },
    ]);

  const syncSubtitle =
    syncStatus.state === 'error'
      ? syncStatus.error
      : syncStatus.state === 'syncing'
        ? 'Syncing…'
        : syncStatus.lastSync
          ? `Up to date · ${relativeTime(syncStatus.lastSync) === 'now' ? 'just now' : relativeTime(syncStatus.lastSync)}`
          : 'Waiting for first sync';

  return (
    <>
      <Stack.Screen options={{ title: 'Settings', headerLeft: () => <HeaderLogo /> }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Section>
          <Row title="Stats" subtitle="Reviews, retention and what’s coming up" icon="chart.bar.fill" iconBg="#FF9500" onPress={() => router.push('/settings/stats')} last />
        </Section>

        <Section title="Appearance">
          {THEMES.map((t, i) => (
            <Row
              key={t.key}
              title={t.label}
              onPress={() => setPref('theme', t.key)}
              chevron={false}
              last={i === THEMES.length - 1}
              right={prefs.theme === t.key ? <Text style={{ color: c.accent, fontSize: 17, fontWeight: '600' }}>✓</Text> : null}
            />
          ))}
        </Section>

        {syncStatus.state === 'off' ? (
          <Section title="Sync" footer="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile/.env.local to sync with KnowDeck on the web.">
            <Row title="Sync isn’t set up" icon="icloud.slash.fill" iconBg="#8E8E93" last />
          </Section>
        ) : syncStatus.state === 'signed-out' ? (
          <Section title="Sync" footer="Sign in with email and password to keep decks, cards and progress in step with KnowDeck on the web.">
            <Row title="Sign in to sync" icon="arrow.triangle.2.circlepath.icloud.fill" iconBg={c.accent} onPress={() => router.push('/sync')} last />
          </Section>
        ) : (
          <Section title="Sync">
            <Row title={syncStatus.email ?? 'Signed in'} subtitle={syncSubtitle} icon={syncStatus.state === 'error' ? 'exclamationmark.icloud.fill' : 'checkmark.icloud.fill'} iconBg={syncStatus.state === 'error' ? c.again : '#34C759'} />
            <Row title="Sync now" icon="arrow.clockwise" iconBg="#007AFF" onPress={() => sync.syncNow()} chevron={false} />
            <Row title="Sign out" destructive onPress={signOut} chevron={false} last />
          </Section>
        )}

        <Section title="Study" footer="Swipe right for Good, left for Again. Hard and Easy are on the buttons.">
          <Row title="Haptics" icon="iphone.radiowaves.left.and.right" iconBg="#FF2D55" right={<Switch value={prefs.haptics} onValueChange={(v) => setPref('haptics', v)} />} />
          <Row title="Gesture hints" icon="hand.draw.fill" iconBg="#FF9500" right={<Switch value={prefs.swipeHints} onValueChange={(v) => setPref('swipeHints', v)} />} />
          <Row
            title="Read French aloud"
            subtitle="Plays French cards as they appear"
            icon="speaker.wave.2.fill"
            iconBg="#5856D6"
            last
            right={<Switch value={prefs.autoSpeak} onValueChange={(v) => setPref('autoSpeak', v)} />}
          />
        </Section>

        <Section title="Cards" footer={`${plural(counts.decks, 'deck')} · ${plural(counts.cards, 'card')} stored on this device.`}>
          <Row title="Import cards" icon="square.and.arrow.down.fill" iconBg="#34C759" onPress={() => router.push('/import')} />
          <Row title="Add sample decks" icon="sparkles" iconBg="#AF52DE" onPress={() => { loadSampleDecks(); haptic.success(); }} last />
        </Section>

        <Section title="Backup" footer="Backups use the same format as KnowDeck on the web, so you can move decks between devices.">
          <Row title="Export backup" icon="square.and.arrow.up.fill" iconBg="#007AFF" onPress={backup} />
          <Row title="Restore from file" icon="arrow.clockwise.icloud.fill" iconBg="#5AC8FA" onPress={restore} last />
        </Section>

        <Section
          title="App updates"
          footer={updatesEnabled ? 'New versions download automatically and apply the next time you open KnowDeck.' : 'Over-the-air updates are off in development builds.'}>
          <Row title="Running" value={currentRelease()} icon="shippingbox.fill" iconBg="#8E8E93" />
          {isUpdatePending ? (
            <Row title="Update ready — restart now" icon="arrow.clockwise.circle.fill" iconBg="#34C759" onPress={() => void restartToUpdate()} chevron={false} last />
          ) : (
            <Row
              title={isChecking || isDownloading ? 'Checking…' : 'Check for updates'}
              icon="arrow.down.circle.fill"
              iconBg="#007AFF"
              onPress={() => void checkForUpdates()}
              chevron={false}
              last
            />
          )}
        </Section>

        <Section>
          <Row title="Erase all data" destructive onPress={erase} chevron={false} last />
        </Section>

        <View style={{ alignItems: 'center', gap: 4, marginTop: 8 }}>
          <Text style={{ color: c.faint, fontSize: 13 }}>KnowDeck {Constants.expoConfig?.version}</Text>
          <Text style={{ color: c.faint, fontSize: 12 }}>{syncStatus.email ? 'FSRS-5 scheduling · synced with your account' : 'FSRS-5 scheduling · everything stays on your device'}</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24, paddingBottom: 48 },
});
