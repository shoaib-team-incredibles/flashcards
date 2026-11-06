import { NativeTabs } from 'expo-router/native-tabs';

import { useQuery } from '@/lib/db';
import { loadStudyQueue, queueCounts } from '@/lib/session';
import { useColors } from '@/lib/theme';

/** Native iOS tab bar (UITabBarController — Liquid Glass on iOS 26+). */
export default function TabsLayout() {
  const c = useColors();
  const due = useQuery(() => queueCounts(loadStudyQueue(null).queue).total);

  return (
    <NativeTabs tintColor={c.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(today)">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} md="today" />
        {due > 0 && <NativeTabs.Trigger.Badge>{due > 99 ? '99+' : String(due)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="decks">
        <NativeTabs.Trigger.Label>Decks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} md="stacks" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="quotes">
        <NativeTabs.Trigger.Label>Quotes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'quote.bubble', selected: 'quote.bubble.fill' }} md="format_quote" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
