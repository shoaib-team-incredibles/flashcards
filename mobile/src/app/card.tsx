import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, HeaderText, Icon, Row, Section } from '@/components/ui';
import { addCards, deleteCard, getCard, getCardReviews, getDecks, resetCard, saveCard, updateCard, useQuery } from '@/lib/db';
import { formatInterval, recallProbability, STATE_LABEL } from '@/lib/fsrs';
import { haptic } from '@/lib/haptics';
import { radius, useColors } from '@/lib/theme';
import { frenchAudio, hasFrenchFront, isFrench, speakEnglish, speakFrench, speakFrenchList, speakMeaning } from '@/lib/speech';
import { relativeTime } from '@/lib/utils';

export default function CardSheet() {
  const c = useColors();
  const { id, deck: deckParam } = useLocalSearchParams<{ id?: string; deck?: string }>();
  const existing = useQuery(() => (id ? getCard(id) : undefined), [id]);
  const decks = useQuery(getDecks);
  const reviews = useQuery(() => (id ? getCardReviews(id) : []), [id]);

  const [front, setFront] = useState(existing?.front ?? '');
  const [back, setBack] = useState(existing?.back ?? '');
  const [tags, setTags] = useState(existing?.tags.join(' ') ?? '');
  const [deckId, setDeckId] = useState(existing?.deckId ?? deckParam ?? decks[0]?.id);
  const [added, setAdded] = useState(0);
  const frontRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const valid = front.trim() && back.trim() && deckId;
  const tagList = tags.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean);

  const save = (another = false) => {
    if (!valid) return;
    if (existing) {
      saveCard({ ...existing, front: front.trim(), back: back.trim(), tags: tagList, deckId: deckId! });
    } else {
      addCards(deckId!, [{ front, back, tags: tagList }]);
    }
    haptic.success();
    if (another) {
      setFront('');
      setBack('');
      setAdded((n) => n + 1);
      frontRef.current?.focus();
    } else router.back();
  };

  const remove = () =>
    Alert.alert('Delete card?', 'This also removes its review history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { router.back(); setTimeout(() => deleteCard(existing!.id), 300); } },
    ]);

  if (!decks.length)
    return (
      <View style={[styles.content, { flex: 1, backgroundColor: c.bg }]}>
        <Text style={{ color: c.muted, fontSize: 16 }}>Create a deck first.</Text>
        <Button title="New deck" onPress={() => router.replace('/deck-form')} />
      </View>
    );

  const p = existing ? recallProbability(existing) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? 'Edit card' : added ? `New card · ${added} added` : 'New card',
          headerLeft: () => <HeaderText label="Cancel" onPress={() => router.back()} />,
          headerRight: () => <HeaderText label="Save" bold disabled={!valid} onPress={() => save(false)} />,
        }}
      />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {decks.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {decks.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => { haptic.tap(); setDeckId(d.id); }}
                style={[styles.chip, { backgroundColor: deckId === d.id ? d.color : c.surface, borderColor: deckId === d.id ? d.color : c.line }]}>
                <Text style={{ color: deckId === d.id ? '#fff' : c.fg, fontWeight: '600', fontSize: 14 }}>{d.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Field label="Front" value={front} onChangeText={setFront} placeholder="Question, word or prompt" autoFocus={!existing} inputRef={frontRef} />
        <Field label="Back" value={back} onChangeText={setBack} placeholder="Answer" />
        <Field label="Tags" value={tags} onChangeText={setTags} placeholder="space separated" multiline={false} autoCapitalize="none" />
        <Text style={{ color: c.faint, fontSize: 13, paddingHorizontal: 4, marginTop: -8 }}>Supports **bold**, *italic*, `code` and - lists.</Text>

        {isFrench(tagList) && (front.trim() || back.trim()) ? (
          <View style={styles.audioRow}>
            {hasFrenchFront(tagList) ? (
              <>
                {!!front.trim() && <AudioChip label="French" onPress={() => speakFrench(front)} />}
                {!!back.trim() && <AudioChip label="Meaning" onPress={() => speakMeaning(back)} />}
                {frenchAudio({ front: '', back, tags: ['french', 'grammar'] }).length > 0 && (
                  <AudioChip label="Examples" onPress={() => speakFrenchList(frenchAudio({ front: '', back, tags: ['french', 'grammar'] }))} />
                )}
              </>
            ) : (
              <>
                {!!front.trim() && <AudioChip label="Question" onPress={() => speakEnglish(front)} />}
                {frenchAudio({ front, back, tags: tagList }).length > 0 && (
                  <AudioChip label="Examples" onPress={() => speakFrenchList(frenchAudio({ front, back, tags: tagList }))} />
                )}
              </>
            )}
          </View>
        ) : null}

        {!existing && <Button title="Save and add another" variant="secondary" disabled={!valid} onPress={() => save(true)} />}

        {existing && (
          <>
            <Section title="Schedule">
              <Row title="State" value={existing.suspended ? 'Suspended' : STATE_LABEL[existing.state]} />
              {existing.state !== 0 && <Row title="Due" value={relativeTime(existing.due)} />}
              {existing.state === 2 && <Row title="Interval" value={formatInterval(existing.due - (existing.lastReview ?? existing.due))} />}
              {p != null && <Row title="Recall chance now" value={`${Math.round(p * 100)}%`} />}
              <Row title="Reviews" value={`${reviews.length}${existing.lapses ? ` · ${existing.lapses} lapses` : ''}`} last />
            </Section>
            <Section>
              <Row
                title={existing.suspended ? 'Unsuspend' : 'Suspend'}
                onPress={() => { updateCard(existing.id, { suspended: existing.suspended ? 0 : 1 }); haptic.medium(); }}
                chevron={false}
              />
              <Row
                title="Reset progress"
                onPress={() =>
                  Alert.alert('Reset progress?', 'The card becomes new again.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Reset', style: 'destructive', onPress: () => resetCard(existing.id) },
                  ])
                }
                chevron={false}
              />
              <Row title="Delete card" destructive onPress={remove} chevron={false} last />
            </Section>
          </>
        )}
      </ScrollView>
    </>
  );
}

function AudioChip({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => { haptic.tap(); onPress(); }}
      accessibilityLabel={`Listen: ${label}`}
      style={({ pressed }) => [styles.audioChip, { backgroundColor: c.surface, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="speaker.wave.2.fill" size={13} color={c.accent} />
      <Text style={{ color: c.fg, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  inputRef,
  multiline = true,
  ...props
}: { label: string; inputRef?: React.Ref<React.ComponentRef<typeof TextInput>> } & React.ComponentProps<typeof TextInput>) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>{label}</Text>
      <TextInput
        ref={inputRef}
        multiline={multiline}
        placeholderTextColor={c.faint}
        style={[styles.input, { backgroundColor: c.surface, color: c.fg, minHeight: multiline ? 96 : 46 }]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  audioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -6 },
  audioChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  input: { borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 17, textAlignVertical: 'top' },
});
