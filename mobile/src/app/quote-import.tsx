import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, HeaderText, Icon, Section } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { addQuotes, byline, fitsNotification, NOTIFICATION_MAX_CHARS, parseQuotes } from '@/lib/quotes';
import { radius, useColors } from '@/lib/theme';
import { plural } from '@/lib/utils';

export default function QuoteImport() {
  const c = useColors();
  const [raw, setRaw] = useState('');
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const parsed = useMemo(() => parseQuotes(raw), [raw]);
  const chosen = parsed.filter((_, i) => !skipped.has(i));
  const long = chosen.filter((q) => !fitsNotification(q)).length;

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setRaw(text);
      setSkipped(new Set());
      haptic.tap();
    }
  };

  const toggle = (i: number) => {
    haptic.tap();
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const save = () => {
    if (!chosen.length) return;
    addQuotes(chosen);
    haptic.success();
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Paste quotes',
          headerLeft: () => <HeaderText label="Cancel" onPress={() => router.back()} />,
          headerRight: () => <HeaderText label={chosen.length ? `Add ${chosen.length}` : 'Add'} bold disabled={!chosen.length} onPress={save} />,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!raw ? (
          <View style={{ gap: 12 }}>
            <Text style={[styles.help, { color: c.muted }]}>
              Copy a note with your quotes, one per paragraph. A name after the quote, like “— Mark Twain”, becomes the author.
            </Text>
            <Button title="Paste from clipboard" icon="doc.on.clipboard" size="lg" onPress={() => void paste()} />
            <TextInput
              value={raw}
              onChangeText={setRaw}
              placeholder="…or type and paste here"
              placeholderTextColor={c.faint}
              multiline
              style={[styles.input, { backgroundColor: c.surface, color: c.fg }]}
            />
          </View>
        ) : (
          <>
            <Text style={[styles.help, { color: c.muted }]}>
              Found {plural(parsed.length, 'quote')}. Tap one to leave it out.
              {long ? ` ${plural(long, 'quote')} over ${NOTIFICATION_MAX_CHARS} characters will stay in the app but won’t be sent as notifications.` : ''}
            </Text>
            <Section>
              {parsed.map((q, i) => {
                const off = skipped.has(i);
                return (
                  <Pressable key={i} onPress={() => toggle(i)} style={({ pressed }) => pressed && { backgroundColor: c.subtle }}>
                    <View style={[styles.row, i < parsed.length - 1 && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                      <Icon name={off ? 'circle' : 'checkmark.circle.fill'} size={20} color={off ? c.faint : c.accent} />
                      <View style={{ flex: 1, gap: 4, opacity: off ? 0.45 : 1 }}>
                        <Text style={[styles.text, { color: c.fg }]}>{q.text}</Text>
                        {!!q.author && <Text style={{ color: c.muted, fontSize: 15 }}>{byline(q)}</Text>}
                        {!fitsNotification(q) && <Text style={{ color: c.hard, fontSize: 13, fontWeight: '600' }}>Too long for notifications</Text>}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </Section>
            <Button title="Start over" variant="plain" onPress={() => { setRaw(''); setSkipped(new Set()); }} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  help: { fontSize: 15, lineHeight: 21, paddingHorizontal: 4 },
  input: { borderRadius: radius.md, borderCurve: 'continuous', padding: 14, minHeight: 160, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  text: { fontSize: 16, lineHeight: 22 },
});
