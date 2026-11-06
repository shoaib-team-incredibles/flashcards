import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { stripMarkdown } from '@/components/CardText';
import { Button, HeaderText } from '@/components/ui';
import { addCards, createDeck, getCards, getDecks, isBackup, restoreBackup, useQuery } from '@/lib/db';
import { haptic } from '@/lib/haptics';
import { AI_PROMPT, FORMAT_LABELS, parseImport } from '@/lib/importers';
import { radius, useColors } from '@/lib/theme';
import { plural } from '@/lib/utils';

const NEW = '__new__';

export default function Import() {
  const c = useColors();
  const { deck: deckParam } = useLocalSearchParams<{ deck?: string }>();
  const decks = useQuery(getDecks);
  const [text, setText] = useState('');
  const [deckId, setDeckId] = useState<string>(deckParam ?? decks[0]?.id ?? NEW);
  const [newName, setNewName] = useState('');

  const parsed = useMemo(() => (text.trim() ? parseImport(text) : null), [text]);
  const existing = useMemo(() => new Set(deckId === NEW ? [] : getCards(deckId).map((x) => x.front.trim().toLowerCase())), [deckId]);
  const fresh = parsed?.cards.filter((x) => !existing.has(x.front.trim().toLowerCase())) ?? [];
  const dupes = (parsed?.cards.length ?? 0) - fresh.length;

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    const content = await new File(res.assets[0].uri).text();
    try {
      const json = JSON.parse(content);
      if (isBackup(json)) {
        Alert.alert('This is a KnowDeck backup', 'Merge it into your library?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', onPress: () => { restoreBackup(json, 'merge'); haptic.success(); router.back(); } },
        ]);
        return;
      }
    } catch {}
    setText(content);
  };

  const run = () => {
    if (!fresh.length) return;
    const target = deckId === NEW ? createDeck({ name: newName || 'Imported deck' }).id : deckId;
    addCards(target, fresh);
    haptic.success();
    router.back();
    setTimeout(() => router.push({ pathname: '/decks/[id]', params: { id: target } }), 300);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderText label="Cancel" onPress={() => router.back()} />,
          headerRight: () => <HeaderText label="Import" bold disabled={!fresh.length} onPress={run} />,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>
          Paste cards in almost any format — <Text style={{ fontWeight: '600' }}>front :: back</Text>, tab or CSV, Anki or Quizlet exports, Q:/A: blocks, Markdown headings or JSON.
        </Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Paste" icon="doc.on.clipboard" variant="secondary" style={{ flex: 1 }} onPress={async () => setText(await Clipboard.getStringAsync())} />
          <Button title="Open file" icon="folder" variant="secondary" style={{ flex: 1 }} onPress={pickFile} />
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={'Capital of France :: Paris\nCapital of Japan :: Tokyo'}
          placeholderTextColor={c.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { backgroundColor: c.surface, color: c.fg }]}
        />

        {parsed && (
          <Text style={{ color: parsed.cards.length ? c.good : c.again, fontSize: 14, fontWeight: '600', paddingHorizontal: 4 }}>
            {parsed.error
              ? parsed.error
              : `${plural(fresh.length, 'card')} · ${FORMAT_LABELS[parsed.format]}${dupes ? ` · ${dupes} duplicates skipped` : ''}${parsed.skipped ? ` · ${parsed.skipped} incomplete` : ''}`}
          </Text>
        )}

        <View style={{ gap: 8 }}>
          <Text style={[styles.label, { color: c.muted }]}>Into deck</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[...decks.map((d) => ({ id: d.id, name: d.name, color: d.color })), { id: NEW, name: '+ New deck', color: c.accent }].map((d) => (
              <Pressable
                key={d.id}
                onPress={() => { haptic.tap(); setDeckId(d.id); }}
                style={[styles.chip, { backgroundColor: deckId === d.id ? d.color : c.surface, borderColor: deckId === d.id ? d.color : c.line }]}>
                <Text style={{ color: deckId === d.id ? '#fff' : c.fg, fontWeight: '600', fontSize: 14 }}>{d.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {deckId === NEW && (
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="New deck name"
              placeholderTextColor={c.faint}
              style={[styles.input, { backgroundColor: c.surface, color: c.fg, minHeight: 46, fontFamily: undefined, fontSize: 17 }]}
            />
          )}
        </View>

        {fresh.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: c.muted }]}>Preview</Text>
            <View style={[styles.preview, { backgroundColor: c.surface }]}>
              {fresh.slice(0, 6).map((x, i) => (
                <View key={i} style={[styles.previewRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                  <Text style={{ color: c.fg, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{stripMarkdown(x.front)}</Text>
                  <Text style={{ color: c.muted, fontSize: 14 }} numberOfLines={1}>{stripMarkdown(x.back)}</Text>
                </View>
              ))}
              {fresh.length > 6 && <Text style={{ color: c.faint, fontSize: 13, padding: 12 }}>and {fresh.length - 6} more…</Text>}
            </View>
            <Button title={`Import ${plural(fresh.length, 'card')}`} size="lg" onPress={run} />
          </View>
        )}

        <Pressable
          onPress={async () => { await Clipboard.setStringAsync(AI_PROMPT); haptic.success(); Alert.alert('Prompt copied', 'Paste it into any AI chat with your notes, then paste the result back here.'); }}
          style={[styles.tip, { backgroundColor: c.accentSoft }]}>
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 15 }}>Turn notes into cards with AI</Text>
          <Text style={{ color: c.muted, fontSize: 14, lineHeight: 19 }}>Tap to copy a prompt that converts your notes into this format.</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  input: { borderRadius: radius.md, borderCurve: 'continuous', padding: 14, minHeight: 160, fontSize: 15, textAlignVertical: 'top', fontFamily: 'Menlo' },
  label: { fontSize: 13, fontWeight: '600', paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  preview: { borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' },
  previewRow: { padding: 12, gap: 2 },
  tip: { borderRadius: radius.md, borderCurve: 'continuous', padding: 14, gap: 4 },
});
