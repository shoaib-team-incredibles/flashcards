import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { radius, useColors } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that springs down on touch — the base for every tappable surface. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  onPress,
  haptics = true,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptics?: boolean; children?: ReactNode }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        s.set(withSpring(scaleTo, { damping: 20, stiffness: 400 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, { damping: 14, stiffness: 300 }));
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic.tap();
        onPress?.(e);
      }}
      style={[style, a]}>
      {children}
    </AnimatedPressable>
  );
}

export function Icon({ name, size = 20, color, weight = 'semibold' }: { name: SFSymbol; size?: number; color?: string; weight?: 'regular' | 'medium' | 'semibold' | 'bold' }) {
  const c = useColors();
  return <SymbolView name={name} size={size} tintColor={color ?? c.fg} weight={weight} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'danger';

export function Button({
  title,
  icon,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
}: {
  title: string;
  icon?: SFSymbol;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = { primary: c.accent, secondary: c.accentSoft, plain: 'transparent', danger: c.again }[variant];
  const fg = { primary: c.accentFg, secondary: c.accent, plain: c.accent, danger: '#fff' }[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.button, size === 'lg' && styles.buttonLg, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, style]}>
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} color={fg} />}
      <Text style={[styles.buttonText, size === 'lg' && { fontSize: 17 }, { color: fg }]}>{title}</Text>
    </PressableScale>
  );
}

/** Inset grouped section, iOS Settings style. */
export function Section({ title, footer, children, style }: { title?: string; footer?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ gap: 6 }, style]}>
      {title && <Text style={[styles.sectionTitle, { color: c.muted }]}>{title}</Text>}
      <View style={[styles.section, { backgroundColor: c.surface }]}>{children}</View>
      {footer && <Text style={[styles.sectionFooter, { color: c.faint }]}>{footer}</Text>}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  iconBg,
  value,
  onPress,
  chevron = !!onPress,
  destructive,
  right,
  last,
}: {
  title: string;
  subtitle?: string;
  icon?: SFSymbol;
  iconBg?: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  right?: ReactNode;
  last?: boolean;
}) {
  const c = useColors();
  const body = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: iconBg ?? c.accent }]}>
          <Icon name={icon} size={15} color="#fff" />
        </View>
      )}
      <View style={[styles.rowBody, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.rowTitle, { color: destructive ? c.again : c.fg }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.rowSubtitle, { color: c.muted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
        {value && <Text style={[styles.rowValue, { color: c.muted }]}>{value}</Text>}
        {right}
        {chevron && <Icon name="chevron.right" size={13} color={c.faint} />}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { haptic.tap(); onPress(); }} style={({ pressed }) => pressed && { backgroundColor: c.subtle }}>
      {body}
    </Pressable>
  );
}

export function Stat({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: SFSymbol }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Icon name={icon} size={13} color={color ?? c.muted} />}
        <Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: color ?? c.fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: SFSymbol; title: string; body: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.accentSoft }]}>
        <Icon name={icon} size={30} color={c.accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: c.fg }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.muted }]}>{body}</Text>
      {action}
    </View>
  );
}

export function CountPills({ counts, size = 'md' }: { counts: { new: number; learning: number; review: number }; size?: 'sm' | 'md' }) {
  const c = useColors();
  const fs = size === 'sm' ? 13 : 15;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ color: c.easy, fontWeight: '700', fontSize: fs, fontVariant: ['tabular-nums'] }}>{counts.new}</Text>
      <Text style={{ color: c.hard, fontWeight: '700', fontSize: fs, fontVariant: ['tabular-nums'] }}>{counts.learning}</Text>
      <Text style={{ color: c.good, fontWeight: '700', fontSize: fs, fontVariant: ['tabular-nums'] }}>{counts.review}</Text>
    </View>
  );
}

/** App logo in the header — always navigates home. */
export function HeaderLogo() {
  const c = useColors();
  return (
    <Pressable onPress={() => router.navigate('/')} accessibilityLabel="KnowDeck home" hitSlop={8} style={[styles.logo, { backgroundColor: c.accent }]}>
      <Icon name="rectangle.on.rectangle.angled" size={15} color="#fff" />
    </Pressable>
  );
}

export function HeaderButton({ icon, onPress, label }: { icon: SFSymbol; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable onPress={() => { haptic.tap(); onPress(); }} accessibilityLabel={label} hitSlop={10} style={styles.headerButton}>
      <Icon name={icon} size={18} color={c.fg} />
    </Pressable>
  );
}

export function HeaderText({ label, onPress, bold, disabled }: { label: string; onPress: () => void; bold?: boolean; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} style={{ paddingHorizontal: 6 }}>
      <Text style={{ color: disabled ? c.faint : c.accent, fontSize: 17, fontWeight: bold ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  buttonLg: { height: 56, borderRadius: radius.lg },
  buttonText: { fontSize: 16, fontWeight: '600' },
  section: { borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 16 },
  sectionFooter: { fontSize: 13, paddingHorizontal: 16, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, minHeight: 48 },
  rowIcon: { width: 29, height: 29, borderRadius: 7, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingRight: 16, minHeight: 48 },
  rowTitle: { fontSize: 17 },
  rowSubtitle: { fontSize: 14, lineHeight: 19 },
  rowValue: { fontSize: 17, fontVariant: ['tabular-nums'] },
  stat: { flex: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: 14, gap: 6 },
  statLabel: { fontSize: 13, fontWeight: '600' },
  statValue: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 8 },
  logo: { width: 30, height: 30, borderRadius: 9, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
