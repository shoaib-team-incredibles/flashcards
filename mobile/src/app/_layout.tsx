import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { applyTheme } from '@/lib/prefs';
import { startQuoteNotifications } from '@/lib/quote-notifications';
import '@/lib/sync'; // starts background Firebase sync
import { palette } from '@/lib/theme';

applyTheme();

export default function RootLayout() {
  useEffect(() => startQuoteNotifications(), []);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const p = palette[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: p.accent, background: p.bg, card: p.surface, text: p.fg, border: p.line } };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={theme}>
        <Stack screenOptions={{ headerTintColor: p.accent }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="study" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="card" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, title: 'Card' }} />
          <Stack.Screen name="deck-form" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7, 1], sheetGrabberVisible: true, title: 'Deck' }} />
          <Stack.Screen name="sync" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, title: 'Sync' }} />
          <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Import cards' }} />
          <Stack.Screen name="quote-form" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, title: 'Quote' }} />
          <Stack.Screen name="quote-import" options={{ presentation: 'modal', title: 'Paste quotes' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
