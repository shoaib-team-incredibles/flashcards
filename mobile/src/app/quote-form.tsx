import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';

import { HeaderText, Row, Section } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { addQuote, deleteQuote, getQuote, updateQuote } from '@/lib/quotes';
import { radius, useColors } from '@/lib/theme';

export default function QuoteForm() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? getQuote(id) : undefined;
  const [text, setText] = useState(existing?.text ?? '');
  const [author, setAuthor] = useState(existing?.author ?? '');
  const canSave = text.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (existing) updateQuote(existing.id, text, author);
    else addQuote(text, author);
    haptic.success();
    router.back();
  };

  const remove = () =>
    existing &&
    Alert.alert('Delete this quote?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteQuote(existing.id);
          haptic.warning();
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? 'Edit quote' : 'New quote',
          headerLeft: () => <HeaderText label="Cancel" onPress={() => router.back()} />,
          headerRight: () => <HeaderText label={existing ? 'Save' : 'Add'} bold disabled={!canSave} onPress={save} />,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type or paste a quote"
          placeholderTextColor={c.faint}
          autoFocus={!existing}
          multiline
          style={[styles.text, { backgroundColor: c.surface, color: c.fg }]}
        />
        <TextInput
          value={author}
          onChangeText={setAuthor}
          placeholder="Who said it? (optional)"
          placeholderTextColor={c.faint}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.author, { backgroundColor: c.surface, color: c.fg }]}
        />
        {existing && (
          <Section>
            <Row title="Delete quote" destructive onPress={remove} chevron={false} last />
          </Section>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  text: { borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, minHeight: 140, fontSize: 19, lineHeight: 26, textAlignVertical: 'top' },
  author: { borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: 14, height: 50, fontSize: 17 },
});
