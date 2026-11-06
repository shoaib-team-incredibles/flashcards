import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Bars, Heatmap, StackBar } from '@/components/Charts';
import { EmptyState, Stat } from '@/components/ui';
import { getAllReviews, getCards, useQuery } from '@/lib/db';
import { recallProbability } from '@/lib/fsrs';
import { computeStreak } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';
import { addDays, dayKey, startOfDay } from '@/lib/utils';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Stats() {
  const c = useColors();
  const reviews = useQuery(getAllReviews);
  const cards = useQuery(() => getCards());

  const data = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of reviews) byDay.set(dayKey(r.ts), (byDay.get(dayKey(r.ts)) ?? 0) + 1);
    const today = startOfDay();
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const t = addDays(today, i - 13);
      return { label: WD[new Date(t).getDay()], value: byDay.get(dayKey(t)) ?? 0, highlight: i === 13 };
    });
    const live = cards.filter((x) => !x.suspended);
    const forecast = Array.from({ length: 14 }, (_, i) => {
      const s = addDays(today, i);
      const e = addDays(today, i + 1);
      const n = live.filter((x) => x.state !== 0 && (i === 0 ? x.due < e : x.due >= s && x.due < e)).length;
      return { label: i === 0 ? 'Now' : WD[new Date(s).getDay()], value: n, highlight: i === 0 };
    });
    const month = reviews.filter((r) => r.ts >= addDays(today, -30));
    const graded = month.filter((r) => r.prevState === 2);
    const trueRetention = graded.length ? Math.round((graded.filter((r) => r.rating > 1).length / graded.length) * 100) : null;
    const ps = cards.map((x) => recallProbability(x)).filter((p): p is number => p != null);
    const avgRecall = ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) : null;
    return {
      byDay,
      last14,
      forecast,
      trueRetention,
      avgRecall,
      streak: computeStreak(reviews),
      total: reviews.length,
      maturity: {
        new: cards.filter((x) => x.state === 0).length,
        learning: cards.filter((x) => x.state === 1 || x.state === 3).length,
        young: cards.filter((x) => x.state === 2 && x.stability < 21).length,
        mature: cards.filter((x) => x.state === 2 && x.stability >= 21).length,
      },
    };
  }, [reviews, cards]);

  return (
    <>
      <Stack.Screen options={{ title: 'Stats' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {cards.length === 0 ? (
          <EmptyState icon="chart.bar" title="No stats yet" body="Study a few cards and your progress will show up here." />
        ) : (
          <>
            <View style={styles.row}>
              <Stat label="Streak" value={data.streak ? `${data.streak}d` : '—'} icon="flame.fill" color={data.streak ? c.hard : undefined} />
              <Stat label="Reviews" value={data.total.toLocaleString()} icon="arrow.triangle.2.circlepath" />
            </View>
            <View style={styles.row}>
              <Stat label="True retention" value={data.trueRetention == null ? '—' : `${data.trueRetention}%`} icon="target" color={c.good} />
              <Stat label="Avg. recall now" value={data.avgRecall == null ? '—' : `${data.avgRecall}%`} icon="brain.head.profile" />
            </View>

            <Panel title="Activity" subtitle="Last 17 weeks">
              <Heatmap counts={data.byDay} />
            </Panel>
            <Panel title="Reviews" subtitle="Last 14 days">
              <Bars data={data.last14} />
            </Panel>
            <Panel title="Forecast" subtitle="Cards due over the next 2 weeks">
              <Bars data={data.forecast} color={c.good + 'A0'} />
            </Panel>
            <Panel title="Card maturity" subtitle="Mature = interval of 21 days or more">
              <StackBar
                parts={[
                  { label: 'New', value: data.maturity.new, color: c.easy },
                  { label: 'Learning', value: data.maturity.learning, color: c.hard },
                  { label: 'Young', value: data.maturity.young, color: c.good + '90' },
                  { label: 'Mature', value: data.maturity.mature, color: c.good },
                ]}
              />
            </Panel>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.panel, { backgroundColor: c.surface }]}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: '700' }}>{title}</Text>
        {subtitle && <Text style={{ color: c.faint, fontSize: 13 }}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 10 },
  panel: { borderRadius: radius.lg, borderCurve: 'continuous', padding: 16, gap: 14 },
});
