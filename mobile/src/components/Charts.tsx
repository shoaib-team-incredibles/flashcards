import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { useColors } from '@/lib/theme';
import { addDays, dayKey, startOfDay } from '@/lib/utils';

/** GitHub-style activity heatmap for the last `weeks` weeks. */
export function Heatmap({ counts, weeks = 17 }: { counts: Map<string, number>; weeks?: number }) {
  const c = useColors();
  const today = startOfDay();
  const dow = new Date(today).getDay();
  const start = addDays(today, -(weeks - 1) * 7 - dow);
  const max = Math.max(4, ...counts.values());
  const cols: { key: string; n: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const t = addDays(start, w * 7 + d);
      const key = dayKey(t);
      col.push({ key, n: counts.get(key) ?? 0, future: t > today });
    }
    cols.push(col);
  }
  const level = (n: number) => (n === 0 ? 0 : n < max * 0.25 ? 1 : n < max * 0.5 ? 2 : n < max * 0.75 ? 3 : 4);
  const shades = [c.subtle, c.accent + '40', c.accent + '75', c.accent + 'B0', c.accent];
  return (
    <View style={styles.heat}>
      {cols.map((col, i) => (
        <View key={i} style={styles.heatCol}>
          {col.map((d) => (
            <View key={d.key} style={[styles.heatCell, { backgroundColor: d.future ? 'transparent' : shades[level(d.n)] }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Vertical bar chart with spring-in bars. */
export function Bars({ data, color, height = 120 }: { data: { label: string; value: number; highlight?: boolean }[]; color?: string; height?: number }) {
  const c = useColors();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      <View style={[styles.bars, { height }]}>
        {data.map((d, i) => (
          <Bar key={i} index={i} pct={d.value / max} color={d.highlight ? c.accent : color ?? c.accent + '90'} />
        ))}
      </View>
      <View style={styles.barLabels}>
        {data.map((d, i) => (
          <Text key={i} style={[styles.barLabel, { color: d.highlight ? c.fg : c.faint }]} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Bar({ pct, color, index }: { pct: number; color: string; index: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.set(withDelay(index * 25, withSpring(pct, { damping: 16, stiffness: 120 })));
  }, [pct, h, index]);
  const a = useAnimatedStyle(() => ({ height: `${Math.max(pct > 0 ? 3 : 1.5, h.get() * 100)}%` }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.bar, { backgroundColor: pct > 0 ? color : 'rgba(127,127,127,0.18)' }, a]} />
    </View>
  );
}

/** Horizontal stacked bar (e.g. new / learning / young / mature). */
export function StackBar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const c = useColors();
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.stack, { backgroundColor: c.subtle }]}>
        {total > 0 && parts.map((p, i) => p.value > 0 && <View key={i} style={{ flex: p.value, backgroundColor: p.color }} />)}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: p.color }]} />
            <Text style={{ color: c.muted, fontSize: 13 }}>
              {p.label} <Text style={{ color: c.fg, fontWeight: '600' }}>{p.value}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heat: { flexDirection: 'row', gap: 3, justifyContent: 'space-between' },
  heatCol: { flex: 1, gap: 3 },
  heatCell: { aspectRatio: 1, borderRadius: 3 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: 4, borderCurve: 'continuous', width: '100%' },
  barLabels: { flexDirection: 'row', gap: 4, marginTop: 6 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600' },
  stack: { height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
