import { Stack } from 'expo-router';

import { tabStackOptions } from '@/components/stack-options';
import { useColors } from '@/lib/theme';

export default function Layout() {
  const c = useColors();
  return <Stack screenOptions={tabStackOptions(c.bg)} />;
}
