import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { HeaderText, Icon, Section } from '@/components/ui';
import { createDeck, getDeck, updateDeck } from '@/lib/db';
import { haptic } from '@/lib/haptics';
import { radius, useColors } from '@/lib/theme';
import { DECK_COLORS } from '@/lib/utils';

export default function DeckForm() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? getDeck(id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [color, setColor] = useState(existing?.color ?? DECK_COLORS[0]);
  const [newPerDay, setNewPerDay] = useState(existing?.newPerDay ?? 20);
  const [retention, setRetention] = useState(existing?.retention ?? 0.9);

  const save = () => {
    if (!name.trim()) return;
    const data = { name: name.trim(), description: description.trim(), color, newPerDay, retention };
    if (existing) {
      updateDeck(existing.id, data);
      router.back();
    } else {
      const d = createDeck(data);
      router.back();
      setTimeout(() => router.push({ pathname: '/decks/[id]', params: { id: d.id } }), 250);
    }
    haptic.success();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? 'Edit deck' : 'New deck',
          headerLeft: () => <HeaderText label="Cancel" onPress={() => router.back()} />,
          headerRight: () => <HeaderText label={existing ? 'Save' : 'Create'} bold disabled={!name.trim()} onPress={save} />,
        }}
      />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, { backgroundColor: color + '1F' }]}>
          <Icon name="rectangle.stack.fill" size={30} color={color} />
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Deck name"
          placeholderTextColor={c.faint}
          autoFocus={!existing}
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.name, { backgroundColor: c.surface, color: c.fg }]}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description (optional)"
          placeholderTextColor={c.faint}
          multiline
          style={[styles.desc, { backgroundColor: c.surface, color: c.fg }]}
        />

        <View style={styles.colors}>
          {DECK_COLORS.map((col) => (
            <Pressable
              key={col}
              onPress={() => { haptic.tap(); setColor(col); }}
              accessibilityLabel={`Color ${col}`}
              style={[styles.swatch, { backgroundColor: col, borderColor: color === col ? c.fg : 'transparent' }]}
            />
          ))}
        </View>

        <Section title="Daily limits" footer="Desired retention is the recall probability FSRS aims for. Higher means more reviews.">
          <Stepper label="New cards per day" value={newPerDay} step={5} min={0} max={200} onChange={setNewPerDay} format={(v) => String(v)} />
          <Stepper
            label="Desired retention"
            value={retention}
            step={0.01}
            min={0.75}
            max={0.97}
            onChange={(v) => setRetention(Math.round(v * 100) / 100)}
            format={(v) => `${Math.round(v * 100)}%`}
            last
          />
        </Section>
      </ScrollView>
    </>
  );
}

function Stepper({ label, value, step, min, max, onChange, format, last }: { label: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void; format: (v: number) => string; last?: boolean }) {
  const c = useColors();
  const set = (v: number) => {
    const n = Math.min(max, Math.max(min, v));
    if (n !== value) haptic.tap();
    onChange(n);
  };
  return (
    <View style={[styles.stepRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      <Text style={{ color: c.fg, fontSize: 17, flex: 1 }}>{label}</Text>
      <Text style={{ color: c.muted, fontSize: 17, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' }}>{format(value)}</Text>
      <View style={[styles.stepper, { backgroundColor: c.subtle }]}>
        <Pressable onPress={() => set(value - step)} hitSlop={4} style={styles.stepBtn}>
          <Icon name="minus" size={14} />
        </Pressable>
        <View style={{ width: StyleSheet.hairlineWidth, height: 18, backgroundColor: c.line }} />
        <Pressable onPress={() => set(value + step)} hitSlop={4} style={styles.stepBtn}>
          <Icon name="plus" size={14} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  preview: { width: 72, height: 72, borderRadius: 22, borderCurve: 'continuous', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  name: { borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: 14, height: 52, fontSize: 20, fontWeight: '600' },
  desc: { borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 12, minHeight: 72, fontSize: 16, textAlignVertical: 'top' },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingVertical: 4 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 52 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 8 },
  stepBtn: { width: 44, height: 32, alignItems: 'center', justifyContent: 'center' },
});
