import DateTimePicker from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, EmptyState, HeaderButton, HeaderLogo, Icon, PressableScale, Row, Section } from '@/components/ui';
import { useQuery } from '@/lib/db';
import { haptic } from '@/lib/haptics';
import { setPref, usePrefs } from '@/lib/prefs';
import { formatTime, sendQuoteNow, setDailyQuote } from '@/lib/quote-notifications';
import { byline, fitsNotification, getQuotes, NOTIFICATION_MAX_CHARS, shuffledRun, type Quote } from '@/lib/quotes';
import { radius, useColors } from '@/lib/theme';
import { plural } from '@/lib/utils';

export default function Quotes() {
  const c = useColors();
  const prefs = usePrefs();
  const quotes = useQuery(getQuotes);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const featured = quotes.find((q) => q.id === featuredId) ?? quotes[0];

  const shuffle = () => {
    const others = quotes.filter((q) => q.id !== featured?.id);
    const [next] = shuffledRun(others.length ? others : quotes, 1);
    if (next) setFeaturedId(next.id);
  };

  const toggle = async (on: boolean) => {
    const ok = await setDailyQuote(on);
    if (!ok) {
      Alert.alert('Notifications are off', 'Allow notifications for KnowDeck in the Settings app to get a daily quote.');
      return;
    }
    haptic.success();
  };

  const preview = async () => {
    const res = await sendQuoteNow();
    if (res === 'denied') Alert.alert('Notifications are off', 'Allow notifications for KnowDeck in the Settings app to get quotes.');
    else if (res === 'hidden') Alert.alert('Banners are off', 'KnowDeck can send notifications, but alerts are turned off. Turn on Lock Screen, Notification Center or Banners for KnowDeck in Settings → Notifications.');
    else if (res === 'no-quotes') Alert.alert('No short quotes yet', `Only quotes of ${NOTIFICATION_MAX_CHARS} characters or less are sent as notifications. Add one and try again.`);
    else {
      haptic.success();
      Alert.alert('On its way', 'Your quote arrives in a few seconds. If it doesn’t, check that Focus or Do Not Disturb isn’t silencing KnowDeck.');
    }
  };

  const time = new Date(2000, 0, 1, Math.floor(prefs.dailyQuoteTime / 60), prefs.dailyQuoteTime % 60);
  const add = () => router.push('/quote-form');
  const pasteMany = () => router.push('/quote-import');
  const sendable = quotes.filter(fitsNotification).length;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Quotes',
          headerLeft: () => <HeaderLogo />,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <HeaderButton icon="doc.on.clipboard" label="Paste quotes" onPress={pasteMany} />
              <HeaderButton icon="plus" label="Add quote" onPress={add} />
            </View>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {!quotes.length ? (
          <EmptyState
            icon="quote.opening"
            title="Your quotes live here"
            body="Save lines that move you. KnowDeck can send you one at random every day."
            action={
              <View style={{ gap: 10, alignSelf: 'stretch' }}>
                <Button title="Paste quotes from a note" icon="doc.on.clipboard" onPress={pasteMany} />
                <Button title="Add one quote" icon="plus" variant="secondary" onPress={add} />
              </View>
            }
          />
        ) : (
          featured && (
            <PressableScale onPress={shuffle} accessibilityLabel="Show another quote" style={[styles.hero, { backgroundColor: c.accent }]}>
              <Icon name="quote.opening" size={26} color="rgba(255,255,255,0.55)" />
              <Text style={styles.heroText}>{featured.text}</Text>
              <View style={styles.heroFoot}>
                <Text style={styles.heroAuthor} numberOfLines={1}>
                  {byline(featured)}
                </Text>
                {quotes.length > 1 && (
                  <View style={styles.heroShuffle}>
                    <Icon name="shuffle" size={13} color="#fff" />
                    <Text style={styles.heroShuffleText}>Tap for another</Text>
                  </View>
                )}
              </View>
            </PressableScale>
          )
        )}

        <Section
          title="Daily quote"
          footer={
            prefs.dailyQuote
              ? sendable
                ? `A random quote arrives every day at ${formatTime(prefs.dailyQuoteTime)}. ${sendable === quotes.length ? '' : `Picked from the ${plural(sendable, 'quote')} short enough to read in a notification (${NOTIFICATION_MAX_CHARS} characters or less).`}`.trim()
                : `Add a quote of ${NOTIFICATION_MAX_CHARS} characters or less and it starts arriving every day.`
              : 'Get one of your quotes, picked at random, as a notification each day.'
          }>
          <Row
            title="Send me a quote every day"
            icon="bell.badge.fill"
            iconBg="#FF3B30"
            last={!prefs.dailyQuote}
            right={<Switch value={prefs.dailyQuote} onValueChange={(v) => void toggle(v)} />}
          />
          {prefs.dailyQuote && (
            <Row
              title="Time"
              icon="clock.fill"
              iconBg="#007AFF"
              right={
                <DateTimePicker
                  value={time}
                  mode="time"
                  display="compact"
                  accentColor={c.accent}
                  onValueChange={(_, d) => setPref('dailyQuoteTime', d.getHours() * 60 + d.getMinutes())}
                />
              }
            />
          )}
          {prefs.dailyQuote && (
            <Row title="Send one now" icon="paperplane.fill" iconBg="#34C759" onPress={() => void preview()} chevron={false} last />
          )}
        </Section>

        {quotes.length > 0 && (
          <Section title={plural(quotes.length, 'quote')}>
            {quotes.map((q, i) => (
              <QuoteRow key={q.id} quote={q} last={i === quotes.length - 1} />
            ))}
          </Section>
        )}
      </ScrollView>
    </>
  );
}

function QuoteRow({ quote, last }: { quote: Quote; last: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        router.push({ pathname: '/quote-form', params: { id: quote.id } });
      }}
      accessibilityLabel={`Edit quote: ${quote.text}`}
      style={({ pressed }) => pressed && { backgroundColor: c.subtle }}>
      <View style={[styles.quoteRow, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Text style={[styles.quoteText, { color: c.fg }]}>{quote.text}</Text>
        {!!quote.author && <Text style={[styles.quoteAuthor, { color: c.muted }]}>{byline(quote)}</Text>}
        {!fitsNotification(quote) && <Text style={[styles.appOnly, { color: c.faint }]}>Too long for notifications</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24, paddingBottom: 48 },
  hero: { borderRadius: radius.lg, borderCurve: 'continuous', padding: 20, gap: 12 },
  heroText: { color: '#fff', fontSize: 22, lineHeight: 30, fontWeight: '600', letterSpacing: -0.3 },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroAuthor: { color: 'rgba(255,255,255,0.85)', fontSize: 15, flex: 1 },
  heroShuffle: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  heroShuffleText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  quoteRow: { marginLeft: 16, paddingVertical: 14, paddingRight: 16, gap: 4 },
  quoteText: { fontSize: 17, lineHeight: 23 },
  quoteAuthor: { fontSize: 15 },
  appOnly: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
