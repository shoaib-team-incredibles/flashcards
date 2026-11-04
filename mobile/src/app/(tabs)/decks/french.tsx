import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CardText, stripMarkdown } from '@/components/CardText';
import { Button, Icon, PressableScale } from '@/components/ui';
import { useQuery } from '@/lib/db';
import { FRENCH_DECKS, FRENCH_GUIDE, findFrenchDeck, installFrenchDeck, pendingChanges, type FrenchDeck } from '@/lib/french';
import { haptic } from '@/lib/haptics';
import { speakFrench } from '@/lib/speech';
import { radius, useColors } from '@/lib/theme';

const ICON = { vocab: 'book.fill', expressions: 'bubble.left.and.bubble.right.fill', grammar: 'sparkles' } as const;

export default function French() {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  // Re-read on every DB change: installed deck ids and how many cards each update would bring.
  const state = useQuery(() => FRENCH_DECKS.map((d) => ({ d, deck: findFrenchDeck(d), pending: pendingChanges(d) })));
  const todo = state.filter((s) => !s.deck || (s.pending ?? 0) > 0).map((s) => s.d);
  const allNew = todo.length === FRENCH_DECKS.length && state.every((s) => !s.deck);

  const install = (decks: FrenchDeck[], key: string) => {
    setBusy(key);
    // Let the spinner render before the synchronous SQLite writes.
    setTimeout(() => {
      decks.forEach(installFrenchDeck);
      haptic.success();
      setBusy(null);
    }, 30);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'French', headerLargeTitle: true }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.flag}>
            <View style={{ flex: 1, backgroundColor: '#0055a4' }} />
            <View style={{ flex: 1, backgroundColor: '#ffffff' }} />
            <View style={{ flex: 1, backgroundColor: '#ef4135' }} />
          </View>
          <Text style={[styles.lede, { color: c.muted }]}>Three ready-made decks with audio, and a roadmap from your first bonjour to fluency.</Text>
        </View>

        {todo.length > 0 && (
          <Button
            title={allNew ? 'Add all 3 decks' : 'Update all decks'}
            icon={allNew ? 'plus' : 'arrow.triangle.2.circlepath'}
            size="lg"
            disabled={!!busy}
            onPress={() => install(todo, 'all')}
          />
        )}

        {state.map(({ d, deck, pending }, i) => (
          <Animated.View key={d.key} entering={FadeInDown.delay(i * 40).springify().damping(18)}>
            <View style={[styles.card, { backgroundColor: c.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.swatch, { backgroundColor: d.color }]}>
                  <Icon name={ICON[d.key]} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: c.fg }]}>{d.name.replace('French — ', '')}</Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>{d.cards.length.toLocaleString()} cards</Text>
                </View>
              </View>
              <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>{d.description}</Text>
              <PressableScale
                onPress={() => d.key !== 'grammar' && speakFrench(d.cards[0].front)}
                style={[styles.sample, { backgroundColor: c.subtle }]}
                accessibilityLabel="Sample card">
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.fg, fontWeight: '600', fontSize: 15 }} numberOfLines={2}>
                    {stripMarkdown(d.cards[0].front)}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
                    {stripMarkdown(d.cards[0].back.split('\n')[0])}
                  </Text>
                </View>
                {d.key !== 'grammar' && <Icon name="speaker.wave.2.fill" size={15} color={c.accent} />}
              </PressableScale>
              {busy === d.key || (busy === 'all' && todo.includes(d)) ? (
                <ActivityIndicator style={{ height: 44 }} />
              ) : !deck ? (
                <Button title="Add deck" icon="plus" variant="secondary" disabled={!!busy} onPress={() => install([d], d.key)} />
              ) : pending ? (
                <Button title={`Update ${pending.toLocaleString()} cards`} icon="arrow.triangle.2.circlepath" variant="secondary" disabled={!!busy} onPress={() => install([d], d.key)} />
              ) : (
                <Button
                  title="Open deck"
                  icon="checkmark"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/decks/[id]', params: { id: deck.id } })}
                />
              )}
            </View>
          </Animated.View>
        ))}

        <Text style={[styles.h1, { color: c.fg }]}>How to master French</Text>
        <Text style={{ color: c.muted, fontSize: 14, marginTop: -6 }}>Tap any French in italics to hear it.</Text>
        <View style={[styles.guide, { backgroundColor: c.surface }]}>
          <CardText source={FRENCH_GUIDE} style={styles.guideText} onPressItalic={speakFrench} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 60 },
  hero: { gap: 12 },
  flag: { width: 44, height: 30, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.15)' },
  lede: { fontSize: 16, lineHeight: 22 },
  card: { padding: 16, gap: 12, borderRadius: radius.lg, borderCurve: 'continuous' },
  swatch: { width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderCurve: 'continuous' },
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 14 },
  guide: { padding: 16, borderRadius: radius.lg, borderCurve: 'continuous' },
  guideText: { fontSize: 15, lineHeight: 22 },
});
