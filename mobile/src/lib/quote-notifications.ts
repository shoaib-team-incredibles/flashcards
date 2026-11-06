/**
 * Daily quote notification. Local notifications only — nothing leaves the phone.
 *
 * iOS can't pick a random quote at delivery time, so we schedule the next
 * DAYS_AHEAD days up front, each with its own randomly chosen quote, and redo
 * the schedule whenever quotes, the time, or the on/off switch change, and
 * each time the app opens (which keeps the run topped up).
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { getPrefs, onPrefsChange, setPref } from './prefs';
import { byline, fitsNotification, getQuotes, onQuotesChange, shuffledRun } from './quotes';

/** Quotes short enough to read in a notification; longer ones stay in the app only. */
const notifiable = () => getQuotes().filter(fitsNotification);

const DAYS_AHEAD = 30;
const KIND = 'daily-quote';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export function formatTime(minutes: number) {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Ask for permission; returns true when notifications are allowed. */
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return res.granted;
}

async function cancelDailyQuotes() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending.filter((n) => n.content.data?.kind === KIND).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

function content(q: { id: string; text: string; author: string }): Notifications.NotificationContentInput {
  return { title: 'Quote of the day', body: [q.text, byline(q)].filter(Boolean).join('\n'), data: { kind: KIND, quoteId: q.id } };
}

let running: Promise<void> = Promise.resolve();

/** Rebuild the schedule from the current quotes and prefs. Safe to call often. */
export function rescheduleDailyQuotes() {
  running = running.then(schedule, schedule);
  return running;
}

async function schedule() {
  try {
    await cancelDailyQuotes();
    const { dailyQuote, dailyQuoteTime } = getPrefs();
    const quotes = notifiable();
    if (!dailyQuote || !quotes.length) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;

    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(dailyQuoteTime / 60), dailyQuoteTime % 60);
    if (first <= now) first.setDate(first.getDate() + 1);

    const picks = shuffledRun(quotes, DAYS_AHEAD);
    for (let i = 0; i < picks.length; i++) {
      const date = new Date(first);
      date.setDate(first.getDate() + i);
      await Notifications.scheduleNotificationAsync({
        content: content(picks[i]),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
  } catch (e) {
    console.warn('Daily quote scheduling failed', e);
  }
}

/** Turn the daily quote on (asking for permission first) or off. */
export async function setDailyQuote(on: boolean): Promise<boolean> {
  if (on && !(await requestPermission())) return false;
  setPref('dailyQuote', on);
  return true;
}

/** Send a random quote a few seconds from now, to preview the notification. */
export async function sendQuoteNow(): Promise<'sent' | 'no-quotes' | 'denied'> {
  const [q] = shuffledRun(notifiable(), 1);
  if (!q) return 'no-quotes';
  if (!(await requestPermission())) return 'denied';
  await Notifications.scheduleNotificationAsync({
    content: { ...content(q), title: 'A quote for you', data: { kind: 'quote-preview', quoteId: q.id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
  });
  return 'sent';
}

let started = false;
/** Keep the schedule in step with quotes and prefs, and open Quotes when a notification is tapped. */
export function startQuoteNotifications() {
  if (started) return;
  started = true;
  let last = JSON.stringify([getPrefs().dailyQuote, getPrefs().dailyQuoteTime]);
  onPrefsChange(() => {
    const next = JSON.stringify([getPrefs().dailyQuote, getPrefs().dailyQuoteTime]);
    if (next === last) return;
    last = next;
    void rescheduleDailyQuotes();
  });
  onQuotesChange(() => void rescheduleDailyQuotes());
  void rescheduleDailyQuotes();

  const open = (r: Notifications.NotificationResponse | null) => {
    const kind = r?.notification.request.content.data?.kind;
    if (kind === KIND || kind === 'quote-preview') router.navigate('/quotes');
  };
  Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync().then(open);
}
