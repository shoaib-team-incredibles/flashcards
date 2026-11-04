import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CountPills, Icon, PressableScale } from '@/components/ui';
import type { DeckSummary } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';
import { plural } from '@/lib/utils';

export function DeckCard({ summary }: { summary: DeckSummary }) {
  const c = useColors();
  const { deck, counts, total, mature } = summary;
  const pct = total ? mature / total : 0;
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/decks/[id]', params: { id: deck.id } })}
      style={[styles.card, { backgroundColor: c.surface }]}
      accessibilityLabel={`${deck.name}, ${counts.total} due`}>
      <View style={[styles.swatch, { backgroundColor: deck.color + '22' }]}>
        <Icon name="rectangle.stack.fill" size={18} color={deck.color} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.name, { color: c.fg }]} numberOfLines={1}>
          {deck.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: c.muted, fontSize: 13 }}>{plural(total, 'card')}</Text>
          <View style={[styles.track, { backgroundColor: c.subtle }]}>
            <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: deck.color, borderRadius: 2 }} />
          </View>
        </View>
      </View>
      {counts.total > 0 ? (
        <CountPills counts={counts} size="sm" />
      ) : (
        <Icon name="checkmark.circle.fill" size={20} color={c.good} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderCurve: 'continuous' },
  swatch: { width: 44, height: 44, borderRadius: 13, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '600' },
  track: { width: 48, height: 4, borderRadius: 2, overflow: 'hidden' },
});
