import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Flashcard, type FlashcardHandle } from '@/components/Flashcard';
import { Button, Icon, PressableScale } from '@/components/ui';
import { deckOptions, getCard, updateCard, useQuery, type Card, type Deck } from '@/lib/db';
import { formatInterval, previewAll, RATING_LABEL, RATINGS, type Rating } from '@/lib/fsrs';
import { haptic } from '@/lib/haptics';
import { setPref, usePrefs } from '@/lib/prefs';
import { answerCard, loadStudyQueue, pickNext, removeFrom, undoAnswer, type DeckQueue } from '@/lib/session';
import { RATING_COLOR, radius, useColors } from '@/lib/theme';
import { frenchAudio, hasFrenchFront, isFrench, italicRuns, speakEnglish, speakFrench, speakFrenchList, speakMeaning, stopSpeaking } from '@/lib/speech';
import { formatDuration, plural } from '@/lib/utils';

function intervalLabels(card: Card, deck: Deck | undefined): Record<Rating, string> {
  const now = Date.now();
  const p = previewAll(card, now, deckOptions(deck));
  return { 1: formatInterval(p[1].due - now), 2: formatInterval(p[2].due - now), 3: formatInterval(p[3].due - now), 4: formatInterval(p[4].due - now) };
}

interface HistoryEntry {
  prev: Card;
  logId: number;
  queue: DeckQueue;
  rating: Rating;
}

export default function Study() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { deck: deckParam } = useLocalSearchParams<{ deck?: string }>();

  const initial = useMemo(() => loadStudyQueue(deckParam ?? null), [deckParam]);
  const decks = useMemo(() => new Map(initial.decks.map((d) => [d.id, d])), [initial]);
  const [queue, setQueue] = useState<DeckQueue>(initial.queue);
  const [currentId, setCurrentId] = useState<string | null>(() => pickNext(initial.queue, 0)?.id ?? null);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [counter, setCounter] = useState(0);
  const [ratings, setRatings] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [intervals, setIntervals] = useState<Record<Rating, string> | null>(null);

  useEffect(() => {
    shownAt.current = startedAt.current = Date.now();
  }, []);
  const cardRef = useRef<FlashcardHandle>(null);

  // Read the live card so edits made from the card sheet show up immediately.
  const current = useQuery(() => (currentId ? getCard(currentId) ?? null : null), [currentId]);
  const deck: Deck | undefined = current ? decks.get(current.deckId) : undefined;

  const remaining = queue.learning.length + queue.review.length + queue.fresh.length;
  const reviewed = history.length;
  const progress = reviewed + remaining ? reviewed / (reviewed + remaining) : 1;

  // ---- audio (French cards) ----
  // Vocab & expressions: French front, English meaning. Grammar: English question, French examples.
  const french = !!current && isFrench(current.tags);
  const frenchFront = french && hasFrenchFront(current!.tags);
  const playFront = () => current && (frenchFront ? speakFrench(current.front) : speakEnglish(current.front));
  const playBack = () => current && (frenchFront ? speakMeaning(current.back) : speakFrenchList(frenchAudio(current)));
  useEffect(() => {
    if (french && prefs.autoSpeak) playFront();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, french]);
  useEffect(() => {
    if (revealed && french && prefs.autoSpeak) playBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);
  useEffect(() => stopSpeaking, []);

  const reveal = useCallback(() => {
    if (current) setIntervals(intervalLabels(current, deck));
    setRevealed(true);
    haptic.tap();
  }, [current, deck]);

  const rate = useCallback(
    (rating: Rating) => {
      if (!current) return;
      const { updated, logId } = answerCard(current, rating, deck, Date.now() - shownAt.current);
      let next = removeFrom(queue, current.id);
      if (updated.state === 1 || updated.state === 3) {
        next = { ...next, learning: [...next.learning, updated].sort((a, b) => a.due - b.due) };
      }
      setHistory((h) => [...h, { prev: current, logId, queue, rating }]);
      setRatings((r) => ({ ...r, [rating]: r[rating] + 1 }));
      setQueue(next);
      const nc = counter + 1;
      setCounter(nc);
      let nextCard = pickNext(next, nc);
      if (nextCard?.id === current.id) {
        const alt = pickNext(removeFrom(next, current.id), nc);
        if (alt) nextCard = alt;
      }
      if (!nextCard) {
        haptic.success();
        setElapsed(Date.now() - startedAt.current);
      }
      setCurrentId(nextCard?.id ?? null);
      setRevealed(false);
      shownAt.current = Date.now();
    },
    [current, queue, deck, counter],
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    undoAnswer(last.prev, last.logId);
    setHistory((h) => h.slice(0, -1));
    setRatings((r) => ({ ...r, [last.rating]: Math.max(0, r[last.rating] - 1) }));
    setQueue(last.queue);
    setCurrentId(last.prev.id);
    setIntervals(intervalLabels(last.prev, decks.get(last.prev.deckId)));
    setRevealed(true);
    haptic.medium();
  }, [history, decks]);

  const suspend = useCallback(() => {
    if (!current) return;
    updateCard(current.id, { suspended: 1 });
    const next = removeFrom(queue, current.id);
    setQueue(next);
    setCurrentId(pickNext(next, counter)?.id ?? null);
    setRevealed(false);
    haptic.warning();
  }, [current, queue, counter]);

  const more = () => {
    if (!current) return;
    const edit = () => router.push({ pathname: '/card', params: { id: current.id } });
    const toggleAuto = () => setPref('autoSpeak', !prefs.autoSpeak);
    if (process.env.EXPO_OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Edit card', prefs.autoSpeak ? 'Turn off auto-play audio' : 'Turn on auto-play audio', 'Suspend card', 'Cancel'],
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
        },
        (i) => (i === 0 ? edit() : i === 1 ? toggleAuto() : i === 2 ? suspend() : undefined),
      );
    } else {
      Alert.alert('Card', undefined, [{ text: 'Edit', onPress: edit }, { text: 'Suspend', style: 'destructive', onPress: suspend }, { text: 'Cancel', style: 'cancel' }]);
    }
  };

  // When only learning cards remain and they become due soon, re-check periodically.
  useEffect(() => {
    if (current || !queue.learning.length) return;
    const id = setInterval(() => {
      const next = pickNext(queue, counter);
      if (next) {
        setCurrentId(next.id);
        shownAt.current = Date.now();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [current, queue, counter]);

  const pv = useSharedValue(progress);
  useEffect(() => {
    pv.set(withSpring(progress, { damping: 20, stiffness: 120 }));
  }, [progress, pv]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${pv.get() * 100}%` }));

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.top}>
        <CircleButton icon="xmark" label="Close" onPress={() => router.back()} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.progressTrack, { backgroundColor: c.subtle }]}>
            <Animated.View style={[styles.progressFill, { backgroundColor: c.accent }, progressStyle]} />
          </View>
          <View style={styles.counts}>
            <Count n={queue.fresh.length} color={c.easy} active={current?.state === 0} label="New" />
            <Count n={queue.learning.length} color={c.hard} active={current?.state === 1 || current?.state === 3} label="Learning" />
            <Count n={queue.review.length} color={c.good} active={current?.state === 2} label="Review" />
          </View>
        </View>
        <CircleButton icon="arrow.uturn.backward" label="Undo" onPress={undo} disabled={!history.length} />
        <CircleButton icon="ellipsis" label="More" onPress={more} disabled={!current} />
      </View>

      {current ? (
        <>
          <View style={styles.cardArea}>
            <Flashcard
              key={current.id + ':' + history.length}
              ref={cardRef}
              card={current}
              deck={decks.size > 1 ? deck : undefined}
              revealed={revealed}
              onReveal={reveal}
              onRate={rate}
              behind={Math.min(2, remaining - 1)}
            />
          </View>

          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {french && (
              <View style={styles.audioBar}>
                <AudioPill label={frenchFront ? 'French' : 'Question'} onPress={playFront} />
                {revealed && <AudioPill label={frenchFront ? 'Meaning' : 'Examples'} onPress={playBack} />}
                {revealed && frenchFront && examplesOf(current.back).length > 0 && (
                  <AudioPill label="Example" onPress={() => speakFrenchList(examplesOf(current.back))} />
                )}
              </View>
            )}
            {!revealed ? (
              <Animated.View key="show" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                <Button title="Show answer" size="lg" onPress={reveal} />
                {prefs.swipeHints && reviewed === 0 && (
                  <Text style={[styles.hint, { color: c.faint }]}>Tap the card to flip · swipe ← Again · swipe → Good</Text>
                )}
              </Animated.View>
            ) : (
              <View key="rate" style={styles.ratings}>
                {RATINGS.map((r, i) => (
                  <Animated.View key={r} style={{ flex: 1 }} entering={FadeInDown.delay(i * 35).springify().damping(16).stiffness(220)}>
                    <PressableScale
                      onPress={() => cardRef.current?.flyOut(r)}
                      haptics={false}
                      accessibilityLabel={`${RATING_LABEL[r]}, next in ${intervals?.[r] ?? ''}`}
                      style={[styles.rateButton, { backgroundColor: RATING_COLOR(c)[r] + '18', borderColor: RATING_COLOR(c)[r] + '40' }]}>
                      <Text style={[styles.rateLabel, { color: RATING_COLOR(c)[r] }]}>{RATING_LABEL[r]}</Text>
                      <Text style={[styles.rateIvl, { color: c.muted }]}>{intervals?.[r] ?? ''}</Text>
                    </PressableScale>
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        </>
      ) : (
        <Finished
          reviewed={reviewed}
          ratings={ratings}
          elapsed={elapsed}
          waiting={queue.learning.length}
          bottom={insets.bottom}
        />
      )}
    </View>
  );
}

function Finished({ reviewed, ratings, elapsed, waiting, bottom }: { reviewed: number; ratings: Record<Rating, number>; elapsed: number; waiting: number; bottom: number }) {
  const c = useColors();
  const total = Math.max(1, reviewed);
  return (
    <View style={[styles.finished, { paddingBottom: Math.max(bottom, 16) }]}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        <Animated.View entering={ZoomIn.springify().damping(10).stiffness(160)} style={[styles.badge, { backgroundColor: c.good + '1F' }]}>
          <Icon name={reviewed ? 'checkmark.seal.fill' : 'cup.and.saucer.fill'} size={52} color={c.good} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(120).springify()} style={[styles.doneTitle, { color: c.fg }]}>
          {reviewed ? 'Session complete' : 'Nothing due'}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(180).springify()} style={[styles.doneBody, { color: c.muted }]}>
          {reviewed
            ? `${plural(reviewed, 'card')} in ${formatDuration(elapsed)}.${waiting ? ` ${plural(waiting, 'learning card')} will be back shortly.` : ''}`
            : waiting
              ? `${plural(waiting, 'learning card')} will be ready in a few minutes.`
              : 'You’re all caught up. Come back later.'}
        </Animated.Text>
        {reviewed > 0 && (
          <Animated.View entering={FadeInDown.delay(240).springify()} style={[styles.breakdown, { backgroundColor: c.surface }]}>
            {RATINGS.map((r) => (
              <View key={r} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: RATING_COLOR(c)[r], fontWeight: '600', fontSize: 15 }}>{RATING_LABEL[r]}</Text>
                  <Text style={{ color: c.fg, fontWeight: '600', fontSize: 15, fontVariant: ['tabular-nums'] }}>{ratings[r]}</Text>
                </View>
                <View style={[styles.breakTrack, { backgroundColor: c.subtle }]}>
                  <View style={{ width: `${(ratings[r] / total) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: RATING_COLOR(c)[r] }} />
                </View>
              </View>
            ))}
          </Animated.View>
        )}
      </View>
      <Button title="Done" size="lg" onPress={() => router.back()} />
    </View>
  );
}

/** The example sentence on a vocab/expression back: the first paragraph after the meaning that starts in italics. */
function examplesOf(back: string) {
  const p = back.split(/\n\s*\n/).slice(1).find((x) => x.trim().startsWith('*'));
  return p ? italicRuns(p) : [];
}

function AudioPill({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => { haptic.tap(); onPress(); }}
      accessibilityLabel={`Listen: ${label}`}
      hitSlop={4}
      style={({ pressed }) => [styles.audioPill, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="speaker.wave.2.fill" size={13} color={c.accent} />
      <Text style={{ color: c.fg, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Count({ n, color, active, label }: { n: number; color: string; active: boolean; label: string }) {
  return (
    <View style={styles.count} accessibilityLabel={`${n} ${label}`}>
      <View style={[styles.countDot, { backgroundColor: color, opacity: active ? 1 : 0.4 }]} />
      <Text style={{ color, fontWeight: active ? '800' : '600', fontSize: 13, fontVariant: ['tabular-nums'] }}>{n}</Text>
    </View>
  );
}

function CircleButton({ icon, label, onPress, disabled }: { icon: 'xmark' | 'arrow.uturn.backward' | 'ellipsis'; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => { haptic.tap(); onPress(); }}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.circle, { backgroundColor: c.surface, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={15} color={c.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  counts: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countDot: { width: 6, height: 6, borderRadius: 3 },
  cardArea: { flex: 1, marginHorizontal: 20, marginTop: 12, marginBottom: 34 },
  bottom: { paddingHorizontal: 16, minHeight: 100 },
  hint: { textAlign: 'center', fontSize: 13, marginTop: 10 },
  audioBar: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  audioPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth },
  ratings: { flexDirection: 'row', gap: 8 },
  rateButton: { height: 64, borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  rateLabel: { fontSize: 16, fontWeight: '700' },
  rateIvl: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  finished: { flex: 1, paddingHorizontal: 20 },
  badge: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  doneBody: { fontSize: 16, lineHeight: 22, textAlign: 'center', paddingHorizontal: 12 },
  breakdown: { alignSelf: 'stretch', borderRadius: radius.lg, borderCurve: 'continuous', padding: 18, gap: 14, marginTop: 10 },
  breakTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
