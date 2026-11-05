import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { DeckCard } from '@/components/DeckCard';
import { Button, EmptyState, HeaderButton, HeaderLogo, Icon, PressableScale } from '@/components/ui';
import { useQuery } from '@/lib/db';
import { deckSummaries } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';

export default function Decks() {
  const summaries = useQuery(deckSummaries);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Decks',
          headerLeft: () => <HeaderLogo />,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <HeaderButton icon="square.and.arrow.down" label="Import" onPress={() => router.push('/import')} />
              <HeaderButton icon="plus" label="New deck" onPress={() => router.push('/deck-form')} />
            </View>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <FrenchBanner />
        <EnglishBanner />
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
        ) : (
          summaries.map((s, i) => (
            <Animated.View key={s.deck.id} entering={FadeInDown.delay(i * 30).springify().damping(18)} layout={LinearTransition.springify()}>
              <DeckCard summary={s} />
            </Animated.View>
          ))
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
});
