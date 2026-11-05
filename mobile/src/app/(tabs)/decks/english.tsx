import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { stripMarkdown } from '@/components/CardText';
import { Button, Icon } from '@/components/ui';
import { useQuery } from '@/lib/db';
import { ENGLISH_DECK, englishPending, findEnglishDeck, installEnglishDeck } from '@/lib/english';
import { haptic } from '@/lib/haptics';
import { radius, useColors } from '@/lib/theme';

export default function English() {
  const c = useColors();
  const d = ENGLISH_DECK;
  const [busy, setBusy] = useState(false);
  // Re-read on every DB change: the installed deck and how many cards an update would bring.
  const { deck, pending } = useQuery(() => ({ deck: findEnglishDeck(), pending: englishPending() }));

  const install = () => {
    setBusy(true);
    // Let the spinner render before the synchronous SQLite writes.
    setTimeout(() => {
      installEnglishDeck();
      haptic.success();
      setBusy(false);
    }, 30);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'English', headerLargeTitle: true }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={[styles.lede, { color: c.muted }]}>A ready-made deck of rich, uncommon English words.</Text>
        <Animated.View entering={FadeInDown.springify().damping(18)}>
          <View style={[styles.card, { backgroundColor: c.surface }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.swatch, { backgroundColor: d.color }]}>
                <Icon name="book.fill" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: c.fg }]}>{d.name.replace('English — ', '')}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>{d.cards.length.toLocaleString()} cards</Text>
              </View>
            </View>
            <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>{d.description}</Text>
            <View style={[styles.sample, { backgroundColor: c.subtle }]}>
              <Text style={{ color: c.fg, fontWeight: '600', fontSize: 15 }} numberOfLines={2}>
                {stripMarkdown(d.cards[0].front)}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
                {stripMarkdown(d.cards[0].back.split('\n')[0])}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator style={{ height: 44 }} />
            ) : !deck ? (
              <Button title="Add deck" icon="plus" variant="secondary" onPress={install} />
            ) : pending ? (
              <Button title={`Update ${pending.toLocaleString()} cards`} icon="arrow.triangle.2.circlepath" variant="secondary" onPress={install} />
            ) : (
              <Button title="Open deck" icon="checkmark" variant="secondary" onPress={() => router.push({ pathname: '/decks/[id]', params: { id: deck.id } })} />
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 60 },
  lede: { fontSize: 16, lineHeight: 22 },
  card: { padding: 16, gap: 12, borderRadius: radius.lg, borderCurve: 'continuous' },
  swatch: { width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
  sample: { gap: 2, padding: 12, borderRadius: radius.md, borderCurve: 'continuous' },
});
