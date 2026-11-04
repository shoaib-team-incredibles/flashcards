import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { stripMarkdown } from '@/components/CardText';
import { Button, EmptyState, HeaderButton, Icon, Stat } from '@/components/ui';
import { deleteDeck, getCards, getDeck, getReviewsSince, useQuery, type Card } from '@/lib/db';
import { recallProbability, STATE_LABEL } from '@/lib/fsrs';
import { haptic } from '@/lib/haptics';
import { deckQueue, doneTodayByDeck, queueCounts } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';
import { relativeTime, startOfDay } from '@/lib/utils';

type Filter = 'all' | 'due' | 'new' | 'suspended';

export default function DeckDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const deck = useQuery(() => getDeck(id), [id]);
  const cards = useQuery(() => getCards(id), [id]);
  const counts = useQuery(() => {
    const d = getDeck(id);
    if (!d) return { new: 0, learning: 0, review: 0, total: 0 };
    return queueCounts(deckQueue(d, getCards(id), doneTodayByDeck(getReviewsSince(startOfDay())).get(id)));
  }, [id]);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useQuery(() => {
    const now = Date.now();
    return getCards(id).filter((x) =>
      filter === 'all' ? true : filter === 'new' ? x.state === 0 && !x.suspended : filter === 'suspended' ? x.suspended : !x.suspended && x.state !== 0 && x.due <= now,
    );
  }, [id, filter]);

  const retention = useMemo(() => {
    const ps = cards.map((x) => recallProbability(x)).filter((p): p is number => p != null);
    return ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) : null;
  }, [cards]);

  if (!deck) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const menu = () => {
    const edit = () => router.push({ pathname: '/deck-form', params: { id } });
    const importCards = () => router.push({ pathname: '/import', params: { deck: id } });
    const remove = () =>
      Alert.alert(`Delete “${deck.name}”?`, `This permanently removes ${cards.length} cards and their review history.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            router.back();
            setTimeout(() => deleteDeck(id), 350);
            haptic.warning();
          },
        },
      ]);
    if (process.env.EXPO_OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Edit deck', 'Import cards', 'Delete deck', 'Cancel'], cancelButtonIndex: 3, destructiveButtonIndex: 2 },
        (i) => [edit, importCards, remove][i]?.(),
      );
    } else remove();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: deck.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <HeaderButton icon="plus" label="Add card" onPress={() => router.push({ pathname: '/card', params: { deck: id } })} />
              <HeaderButton icon="ellipsis" label="Deck options" onPress={menu} />
            </View>
          ),
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={filtered}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 6 }}>
            {!!deck.description && <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>{deck.description}</Text>}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat label="Due" value={counts.total} color={counts.total ? c.accent : undefined} />
              <Stat label="Cards" value={cards.length} />
              <Stat label="Recall" value={retention == null ? '—' : `${retention}%`} />
            </View>
            <Button
              title={counts.total ? `Study ${counts.total} ${counts.total === 1 ? 'card' : 'cards'}` : 'All caught up'}
              icon={counts.total ? 'play.fill' : 'checkmark'}
              size="lg"
              disabled={!counts.total}
              onPress={() => router.push({ pathname: '/study', params: { deck: id } })}
            />
            <View style={[styles.segment, { backgroundColor: c.subtle }]}>
              {(['all', 'due', 'new', 'suspended'] as Filter[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => { haptic.tap(); setFilter(f); }}
                  style={[styles.segmentItem, filter === f && { backgroundColor: c.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }]}>
                  <Text style={{ color: filter === f ? c.fg : c.muted, fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          cards.length === 0 ? (
            <EmptyState
              icon="square.stack.3d.up"
              title="No cards yet"
              body="Add cards one by one, or paste a whole list."
              action={
                <View style={{ gap: 10, alignSelf: 'stretch' }}>
                  <Button title="Add a card" icon="plus" onPress={() => router.push({ pathname: '/card', params: { deck: id } })} />
                  <Button title="Import cards" variant="secondary" onPress={() => router.push({ pathname: '/import', params: { deck: id } })} />
                </View>
              }
            />
          ) : (
            <Text style={{ color: c.faint, textAlign: 'center', marginTop: 24 }}>No {filter} cards</Text>
          )
        }
        renderItem={({ item, index }) => <CardRow card={item} first={index === 0} last={index === filtered.length - 1} />}
      />
    </>
  );
}

function CardRow({ card, first, last }: { card: Card; first: boolean; last: boolean }) {
  const c = useColors();
  const stateColor = card.suspended ? c.faint : [c.easy, c.hard, c.good, c.hard][card.state];
  return (
    <Pressable
      onPress={() => { haptic.tap(); router.push({ pathname: '/card', params: { id: card.id } }); }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.subtle : c.surface },
        first && { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
        last && { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
      ]}>
      <View style={[styles.rowInner, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: c.fg, fontSize: 16, fontWeight: '500' }} numberOfLines={1}>
            {stripMarkdown(card.front)}
          </Text>
          <Text style={{ color: c.muted, fontSize: 14 }} numberOfLines={1}>
            {stripMarkdown(card.back)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={{ color: stateColor, fontSize: 12, fontWeight: '700' }}>{card.suspended ? 'Suspended' : STATE_LABEL[card.state]}</Text>
          {card.state !== 0 && !card.suspended && <Text style={{ color: c.faint, fontSize: 12 }}>{relativeTime(card.due)}</Text>}
        </View>
        <Icon name="chevron.right" size={12} color={c.faint} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 2, marginTop: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  row: { paddingLeft: 16 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingRight: 14 },
});
