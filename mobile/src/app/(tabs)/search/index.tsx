import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { stripMarkdown } from '@/components/CardText';
import { EmptyState } from '@/components/ui';
import { getDecks, searchCards, useQuery } from '@/lib/db';
import { haptic } from '@/lib/haptics';
import { useColors } from '@/lib/theme';

export default function Search() {
  const c = useColors();
  const [q, setQ] = useState('');
  const decks = useQuery(() => new Map(getDecks().map((d) => [d.id, d])));
  const results = useQuery(() => (q.trim() ? searchCards(q.trim()) : []), [q]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Search',
          headerSearchBarOptions: {
            placeholder: 'Search cards',
            onChangeText: (e) => setQ(e.nativeEvent.text),
            onCancelButtonPress: () => setQ(''),
            autoCapitalize: 'none',
          },
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        data={results}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <EmptyState
            icon="magnifyingglass"
            title={q ? 'No matches' : 'Search your cards'}
            body={q ? `Nothing matches “${q}”.` : 'Find any card by its front, back or tags.'}
          />
        }
        renderItem={({ item }) => {
          const deck = decks.get(item.deckId);
          return (
            <Pressable
              onPress={() => { haptic.tap(); router.push({ pathname: '/card', params: { id: item.id } }); }}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.subtle : 'transparent', borderBottomColor: c.line }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: c.fg, fontSize: 16, fontWeight: '500' }} numberOfLines={1}>
                  {stripMarkdown(item.front)}
                </Text>
                <Text style={{ color: c.muted, fontSize: 14 }} numberOfLines={1}>
                  {stripMarkdown(item.back)}
                </Text>
              </View>
              {deck && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 120 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: deck.color }} />
                  <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>
                    {deck.name}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
