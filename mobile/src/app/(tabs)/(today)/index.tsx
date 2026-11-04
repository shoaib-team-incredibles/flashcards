import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DeckCard } from '@/components/DeckCard';
import { Button, EmptyState, HeaderButton, HeaderLogo, Icon, Stat } from '@/components/ui';
import { getCards, getReviewsSince, useQuery } from '@/lib/db';
import { haptic } from '@/lib/haptics';
import { loadSampleDecks } from '@/lib/sample';
import { computeStreak, deckSummaries, loadStudyQueue, queueCounts } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';
import { addDays, greeting, plural, relativeTime, startOfDay } from '@/lib/utils';

export default function Today() {
  const c = useColors();
  const summaries = useQuery(deckSummaries);
  const counts = useQuery(() => queueCounts(loadStudyQueue(null).queue));
  const today = useQuery(() => getReviewsSince(startOfDay()));
  const streak = useQuery(() => computeStreak(getReviewsSince(addDays(startOfDay(), -400))));
  const nextDue = useQuery(() => {
    const t = getCards()
      .filter((x) => !x.suspended && x.state !== 0)
      .reduce((m, x) => Math.min(m, x.due), Infinity);
    return Number.isFinite(t) ? t : null;
  });

  const studied = today.filter((r) => r.source === 'study');
  const correct = studied.filter((r) => r.rating > 1).length;
  const accuracy = studied.length ? Math.round((correct / studied.length) * 100) : null;
  const minutes = Math.round(studied.reduce((s, r) => s + r.durationMs, 0) / 60000);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Today',
          headerLeft: () => <HeaderLogo />,
          headerRight: () => <HeaderButton icon="plus" label="New deck" onPress={() => router.push('/deck-form')} />,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {summaries.length === 0 ? (
          <EmptyState
            icon="rectangle.on.rectangle.angled"
            title="Welcome to KnowDeck"
            body="Spaced repetition that schedules every card right before you'd forget it. Start with a sample deck or make your own."
            action={
              <View style={{ gap: 10, alignSelf: 'stretch' }}>
                <Button title="Learn French" icon="globe.europe.africa.fill" size="lg" onPress={() => router.push('/decks/french')} />
                <Button title="Try sample decks" icon="sparkles" variant="secondary" onPress={() => { loadSampleDecks(); haptic.success(); }} />
                <Button title="Create a deck" variant="plain" onPress={() => router.push('/deck-form')} />
              </View>
            }
          />
        ) : (
          <>
            <Animated.View entering={FadeInDown.springify().damping(18)}>
              <Hero due={counts} nextDue={nextDue} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={styles.stats}>
              <Stat label="Streak" value={streak ? `${streak}d` : '—'} icon="flame.fill" color={streak ? c.hard : undefined} />
              <Stat label="Reviewed" value={studied.length} icon="checkmark.circle.fill" />
              <Stat label="Correct" value={accuracy == null ? '—' : `${accuracy}%`} icon="target" />
            </Animated.View>
            {minutes > 0 && (
              <Text style={[styles.caption, { color: c.faint }]}>{plural(minutes, 'minute')} studied today</Text>
            )}

            <Animated.View entering={FadeInDown.delay(120).springify().damping(18)} style={{ gap: 10 }}>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: c.fg }]}>Decks</Text>
                <Text onPress={() => router.navigate('/decks')} style={{ color: c.accent, fontSize: 15, fontWeight: '600' }}>
                  See all
                </Text>
              </View>
              {summaries
                .slice()
                .sort((a, b) => b.counts.total - a.counts.total)
                .slice(0, 5)
                .map((s) => (
                  <DeckCard key={s.deck.id} summary={s} />
                ))}
            </Animated.View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Hero({ due, nextDue }: { due: ReturnType<typeof queueCounts>; nextDue: number | null }) {
  const c = useColors();
  const done = due.total === 0;
  return (
    <LinearGradient
      colors={done ? [c.good, '#0E8F6E'] : [c.accent, '#7C3AED']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}>
      <Text style={styles.heroKicker}>{greeting()}</Text>
      {done ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="checkmark.seal.fill" size={30} color="#fff" />
            <Text style={styles.heroTitle}>All caught up</Text>
          </View>
          <Text style={styles.heroBody}>
            {nextDue ? `Next review ${relativeTime(nextDue)}.` : 'Add cards to start learning.'} Come back then — the schedule does the rest.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.heroBig}>{due.total}</Text>
          <Text style={styles.heroBody}>{due.total === 1 ? 'card is' : 'cards are'} ready for review</Text>
          <View style={styles.heroCounts}>
            <HeroCount label="New" n={due.new} />
            <HeroCount label="Learning" n={due.learning} />
            <HeroCount label="Review" n={due.review} />
          </View>
          <Button
            title="Start studying"
            icon="play.fill"
            size="lg"
            variant="secondary"
            onPress={() => router.push('/study')}
            style={{ backgroundColor: '#fff', marginTop: 6 }}
          />
        </>
      )}
    </LinearGradient>
  );
}

function HeroCount({ label, n }: { label: string; n: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{n}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  hero: { borderRadius: radius.xl, borderCurve: 'continuous', padding: 22, gap: 6, overflow: 'hidden' },
  heroKicker: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
  heroBig: { color: '#fff', fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 70, fontVariant: ['tabular-nums'] },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heroBody: { color: 'rgba(255,255,255,0.88)', fontSize: 16, lineHeight: 22 },
  heroCounts: { flexDirection: 'row', marginVertical: 10 },
  stats: { flexDirection: 'row', gap: 10 },
  caption: { fontSize: 13, textAlign: 'center', marginTop: -6 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, marginTop: 4 },
  sectionTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
});
