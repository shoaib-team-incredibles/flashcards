import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CardText } from '@/components/CardText';
import type { Card, Deck } from '@/lib/db';
import type { Rating } from '@/lib/fsrs';
import { haptic } from '@/lib/haptics';
import { radius, useColors } from '@/lib/theme';

export interface FlashcardHandle {
  /** Animate the card off-screen in the direction of the rating, then call onRate. */
  flyOut: (rating: Rating) => void;
  reveal: () => void;
}

interface Props {
  card: Card;
  deck?: Deck;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  /** Number of cards waiting behind this one (draws the stack). */
  behind: number;
}

const FLIP_SPRING = { damping: 15, stiffness: 140, mass: 0.9 };
const SWIPE_THRESHOLD = 110;
const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export const Flashcard = forwardRef<FlashcardHandle, Props>(function Flashcard({ card, deck, revealed, onReveal, onRate, behind }, ref) {
  const c = useColors();
  const { width, height } = useWindowDimensions();

  const flip = useSharedValue(revealed ? 1 : 0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const enter = useSharedValue(0);
  const zone = useSharedValue(0); // -1 again, 0 none, 1 good — for threshold haptics
  const busy = useSharedValue(false);
  const isRevealed = useSharedValue(revealed);

  useEffect(() => {
    enter.set(withSpring(1, { damping: 18, stiffness: 180 }));
  }, [enter]);

  useEffect(() => {
    isRevealed.set(revealed);
    flip.set(withSpring(revealed ? 1 : 0, FLIP_SPRING));
  }, [revealed, flip, isRevealed]);

  const flyOut = (rating: Rating) => {
    'worklet';
    if (busy.get()) return;
    busy.set(true);
    const dx = rating === 1 ? -1 : rating >= 3 ? 1 : 0;
    const dy = rating === 4 ? -1 : rating === 2 ? 1 : 0;
    const cfg = { duration: 260, easing: Easing.in(Easing.cubic) };
    tx.set(withTiming(dx * width * 1.4 + (rating === 4 ? tx.get() : 0), cfg));
    ty.set(
      withTiming(dy * height * 0.9 + (dx ? ty.get() + 40 : 0), cfg, (done) => {
        if (done) scheduleOnRN(onRate, rating);
      }),
    );
  };

  useImperativeHandle(ref, () => ({
    flyOut: (r) => {
      haptic.light();
      flyOut(r);
    },
    reveal: () => onReveal(),
  }));

  const tap = useTapGesture({
    maxDuration: 400,
    onDeactivate: (e) => {
      if (e.canceled || busy.get()) return;
      if (!isRevealed.get()) {
        scheduleOnRN(onReveal);
      } else {
        // Peek at the front again; tap once more to flip back.
        flip.set(withSpring(flip.get() > 0.5 ? 0 : 1, FLIP_SPRING));
        scheduleOnRN(haptic.tap);
      }
    },
  });

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-24, 24],
    onUpdate: (e) => {
      if (busy.get()) return;
      if (!isRevealed.get()) {
        // Rubber-band before the answer is shown — grading needs a reveal first.
        tx.set(e.translationX * 0.18);
        ty.set(e.translationY * 0.08);
        return;
      }
      tx.set(e.translationX);
      ty.set(e.translationY * 0.4);
      const z = e.translationX > SWIPE_THRESHOLD ? 1 : e.translationX < -SWIPE_THRESHOLD ? -1 : 0;
      if (z !== zone.get()) {
        zone.set(z);
        if (z !== 0) scheduleOnRN(haptic.light);
      }
    },
    onDeactivate: (e) => {
      if (busy.get()) return;
      const vx = e.velocityX;
      if (isRevealed.get() && (tx.get() > SWIPE_THRESHOLD || vx > 1000)) {
        flyOut(3);
      } else if (isRevealed.get() && (tx.get() < -SWIPE_THRESHOLD || vx < -1000)) {
        flyOut(1);
      } else {
        tx.set(withSpring(0, { damping: 16, stiffness: 200 }));
        ty.set(withSpring(0, { damping: 16, stiffness: 200 }));
        if (!isRevealed.get() && Math.abs(e.translationX) > 30) scheduleOnRN(onReveal);
      }
      zone.set(0);
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  // ---- animated styles ----

  const container = useAnimatedStyle(() => {
    const rot = interpolate(tx.get(), [-width, 0, width], [-14, 0, 14]);
    const lift = interpolate(flip.get(), [0, 0.5, 1], [1, 1.05, 1], Extrapolation.CLAMP);
    const s = interpolate(enter.get(), [0, 1], [0.94, 1]);
    return {
      transform: [
        { translateX: tx.get() },
        { translateY: ty.get() + interpolate(enter.get(), [0, 1], [14, 0]) },
        { rotate: `${rot}deg` },
        { scale: s * lift },
      ],
    };
  });

  const front = useAnimatedStyle(() => ({
    opacity: flip.get() < 0.5 ? 1 : 0,
    transform: [{ perspective: 1400 }, { rotateY: `${interpolate(flip.get(), [0, 1], [0, 180])}deg` }],
  }));

  const back = useAnimatedStyle(() => ({
    opacity: flip.get() >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1400 }, { rotateY: `${interpolate(flip.get(), [0, 1], [180, 360])}deg` }],
  }));

  // Swipe tint on the card border/background.
  const tint = useAnimatedStyle(() => ({
    borderColor: interpolateColor(tx.get(), [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [c.again, c.line, c.good]),
  }));

  const stampAgain = useAnimatedStyle(() => ({
    opacity: interpolate(tx.get(), [-SWIPE_THRESHOLD, -30], [1, 0], Extrapolation.CLAMP),
    transform: [{ rotate: '12deg' }, { scale: interpolate(tx.get(), [-SWIPE_THRESHOLD * 1.4, -30], [1.08, 0.8], Extrapolation.CLAMP) }],
  }));
  const stampGood = useAnimatedStyle(() => ({
    opacity: interpolate(tx.get(), [30, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [{ rotate: '-12deg' }, { scale: interpolate(tx.get(), [30, SWIPE_THRESHOLD * 1.4], [0.8, 1.08], Extrapolation.CLAMP) }],
  }));

  // Light sweep across the card while it flips.
  const shine = useAnimatedStyle(() => {
    const p = flip.get();
    const mid = 1 - Math.abs(p - 0.5) * 2; // 0 → 1 → 0
    return {
      opacity: Math.max(0, mid) * 0.55,
      transform: [{ translateX: interpolate(p, [0, 1], [-width, width]) }, { rotate: '20deg' }],
    };
  });

  // Cards behind grow as the top card leaves.
  const progress = () => {
    'worklet';
    return Math.min(1, Math.max(Math.abs(tx.get()), Math.abs(ty.get())) / (width * 0.6));
  };
  const behind1 = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress(), [0, 1], [12, 0]) }, { scale: interpolate(progress(), [0, 1], [0.95, 1]) }],
    opacity: interpolate(progress(), [0, 1], [0.9, 1]),
  }));
  const behind2 = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress(), [0, 1], [24, 12]) }, { scale: interpolate(progress(), [0, 1], [0.9, 0.95]) }],
    opacity: interpolate(progress(), [0, 1], [0.6, 0.9]),
  }));

  const short = (s: string) => s.length < 120 && !s.includes('\n') && !s.includes('```');
  const faceBase = [styles.face, { backgroundColor: c.surface, boxShadow: `0 12px 32px ${c.cardShadow}` }];
  const meta = (
    <View style={styles.meta}>
      {deck ? (
        <View style={styles.deckPill}>
          <View style={[styles.dot, { backgroundColor: deck.color }]} />
          <Text style={[styles.metaText, { color: c.muted }]} numberOfLines={1}>
            {deck.name}
          </Text>
        </View>
      ) : (
        <View />
      )}
      <Text style={[styles.metaText, { color: c.faint }]}>
        {card.state === 0 ? 'New' : card.lapses > 0 ? `Lapsed ${card.lapses}×` : card.state === 2 ? 'Review' : 'Learning'}
      </Text>
    </View>
  );

  return (
    <View style={styles.wrap}>
      {behind > 1 && <Animated.View style={[styles.ghost, { backgroundColor: c.surface, borderColor: c.line }, behind2]} />}
      {behind > 0 && <Animated.View style={[styles.ghost, { backgroundColor: c.surface, borderColor: c.line }, behind1]} />}

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.fill, container]}>
          {/* Front */}
          <Animated.View style={[faceBase, tint, front]} pointerEvents={revealed ? 'none' : 'auto'}>
            {meta}
            <View style={styles.center}>
              <CardText source={card.front} center={short(card.front)} style={short(card.front) ? styles.bigText : styles.bodyText} />
            </View>
            <Text style={[styles.hint, { color: c.faint }]}>Tap to reveal</Text>
            <ShineLayer style={shine} />
          </Animated.View>

          {/* Back */}
          <Animated.View style={[faceBase, tint, back]} pointerEvents={revealed ? 'auto' : 'none'}>
            {meta}
            <ScrollView contentContainerStyle={styles.backScroll} showsVerticalScrollIndicator={false}>
              <View style={{ opacity: 0.55 }}>
                <CardText source={card.front} center={short(card.front)} style={styles.smallText} />
              </View>
              <View style={[styles.divider, { backgroundColor: c.line }]} />
              <CardText source={card.back} center={short(card.back)} style={short(card.back) ? styles.answerText : styles.bodyText} />
            </ScrollView>
            <ShineLayer style={shine} />

            <Animated.View style={[styles.stamp, styles.stampRight, { borderColor: c.again }, stampAgain]}>
              <Text style={[styles.stampText, { color: c.again }]}>AGAIN</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.stampLeft, { borderColor: c.good }, stampGood]}>
              <Text style={[styles.stampText, { color: c.good }]}>GOOD</Text>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

function ShineLayer({ style }: { style: object }) {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: radius.xl }]} pointerEvents="none">
      <AnimatedGradient
        colors={['transparent', 'rgba(255,255,255,0.9)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[{ position: 'absolute', top: -200, bottom: -200, width: 140 }, style]}
      />
    </View>
  );
}

/** Ghost stack shown while no card is mounted (e.g. between transitions). */
export function CardPlaceholder() {
  const c = useColors();
  return <View style={[styles.face, { backgroundColor: c.surface, borderColor: c.line }]} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  fill: { flex: 1 },
  face: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    padding: 22,
    backfaceVisibility: 'hidden',
  },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.xl, borderCurve: 'continuous', borderWidth: 1 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  deckPill: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: 13, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', paddingVertical: 12 },
  bigText: { fontSize: 28, lineHeight: 36, fontWeight: '600', letterSpacing: -0.4 },
  answerText: { fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: -0.3 },
  bodyText: { fontSize: 18, lineHeight: 26 },
  smallText: { fontSize: 16, lineHeight: 22 },
  hint: { textAlign: 'center', fontSize: 13, fontWeight: '500' },
  backScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 },
  divider: { height: StyleSheet.hairlineWidth * 2, marginVertical: 20, marginHorizontal: 24 },
  stamp: { position: 'absolute', top: 54, borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  stampLeft: { left: 22 },
  stampRight: { right: 22 },
  stampText: { fontSize: 26, fontWeight: '900', letterSpacing: 2 },
});
