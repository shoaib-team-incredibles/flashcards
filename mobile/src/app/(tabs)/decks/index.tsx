import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { DeckCard } from '@/components/DeckCard';
import { Button, EmptyState, HeaderButton, HeaderLogo, Icon, PressableScale, SearchField } from '@/components/ui';
import { useQuery } from '@/lib/db';
import { setPref, usePrefs, type DeckSort } from '@/lib/prefs';
import { deckSummaries, type DeckSummary } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';
import { plural } from '@/lib/utils';

const SORTS: { value: DeckSort; label: string }[] = [
  { value: 'due', label: 'Most due first' },
  { value: 'recent', label: 'Newest first' },
  { value: 'alpha', label: 'A to Z' },
  { value: 'size', label: 'Largest first' },
];

function sortDecks(list: DeckSummary[], sort: DeckSort) {
  const byName = (a: DeckSummary, b: DeckSummary) => a.deck.name.localeCompare(b.deck.name);
  return list.slice().sort((a, b) => {
    if (sort === 'alpha') return byName(a, b);
    if (sort === 'size') return b.total - a.total || byName(a, b);
    if (sort === 'recent') return b.deck.createdAt - a.deck.createdAt;
    return b.counts.total - a.counts.total || byName(a, b);
  });
}

export default function Decks() {
  const c = useColors();
  const summaries = useQuery(deckSummaries);
  const { deckSort } = usePrefs();
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  const shown = sortDecks(
    summaries.filter((s) => !query || s.deck.name.toLowerCase().includes(query) || (s.deck.description ?? '').toLowerCase().includes(query)),
    deckSort,
  );
  const cards = summaries.reduce((n, s) => n + s.total, 0);
  const due = summaries.reduce((n, s) => n + s.counts.total, 0);

  const pickSort = () => {
    if (process.env.EXPO_OS !== 'ios') {
      setPref('deckSort', SORTS[(SORTS.findIndex((s) => s.value === deckSort) + 1) % SORTS.length].value);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Sort decks',
        options: [...SORTS.map((s) => (s.value === deckSort ? `✓ ${s.label}` : s.label)), 'Cancel'],
        cancelButtonIndex: SORTS.length,
      },
      (i) => SORTS[i] && setPref('deckSort', SORTS[i].value),
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Decks',
          headerLeft: () => <HeaderLogo />,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {summaries.length > 1 && <HeaderButton icon="arrow.up.arrow.down" label="Sort decks" onPress={pickSort} />}
              <HeaderButton icon="square.and.arrow.down" label="Import" onPress={() => router.push('/import')} />
              <HeaderButton icon="plus" label="New deck" onPress={() => router.push('/deck-form')} />
            </View>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
        {summaries.length > 3 && <SearchField value={q} onChangeText={setQ} placeholder="Search decks" />}
        {!query && (
          <>
            <FrenchBanner />
            <EnglishBanner />
          </>
        )}
        {summaries.length === 0 ? (
          <EmptyState
            icon="rectangle.stack"
            title="No decks yet"
            body="Create a deck, or paste notes and KnowDeck will turn them into cards."
            action={
              <View style={{ gap: 10, alignSelf: 'stretch' }}>
                <Button title="Create a deck" icon="plus" size="lg" onPress={() => router.push('/deck-form')} />
                <Button title="Import cards" variant="secondary" onPress={() => router.push('/import')} />
              </View>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState icon="magnifyingglass" title="No matches" body={`No deck matches “${q.trim()}”.`} />
        ) : (
          <>
            {!query && (
              <Text style={[styles.summary, { color: c.muted }]}>
                {plural(summaries.length, 'deck')} · {plural(cards, 'card')}
                {due > 0 ? ` · ${due.toLocaleString()} due today` : ''}
              </Text>
            )}
            {shown.map((s, i) => (
              <Animated.View key={s.deck.id} entering={FadeInDown.delay(Math.min(i, 8) * 30).springify().damping(18)} layout={LinearTransition.springify()}>
                <DeckCard summary={s} />
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

/** Entry to the French section: ready-made decks with audio and the mastery guide. */
function FrenchBanner() {
  const c = useColors();
  return (
    <PressableScale onPress={() => router.push('/decks/french')} style={[styles.banner, { backgroundColor: c.surface }]} accessibilityLabel="French: decks and guide">
      <View style={styles.flag}>
        <View style={{ flex: 1, backgroundColor: '#0055a4' }} />
        <View style={{ flex: 1, backgroundColor: '#ffffff' }} />
        <View style={{ flex: 1, backgroundColor: '#ef4135' }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: '600' }}>Learn French</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>1,000 words · 200 expressions · grammar · audio</Text>
      </View>
      <Icon name="chevron.right" size={14} color={c.faint} />
    </PressableScale>
  );
}

/** Entry to the ready-made English vocabulary deck. */
function EnglishBanner() {
  const c = useColors();
  return (
    <PressableScale onPress={() => router.push('/decks/english')} style={[styles.banner, { backgroundColor: c.surface }]} accessibilityLabel="English: vocabulary deck">
      <View style={[styles.flag, { backgroundColor: '#0d9488', alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="book.fill" size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: '600' }}>English vocabulary</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>Rich, uncommon words with examples</Text>
      </View>
      <Icon name="chevron.right" size={14} color={c.faint} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderCurve: 'continuous' },
  flag: { width: 44, height: 30, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.15)' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  summary: { fontSize: 13, fontWeight: '500', paddingHorizontal: 4, marginTop: 6 },
});
