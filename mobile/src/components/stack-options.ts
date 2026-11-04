import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';

type Options = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

/** Shared header style for every tab's stack: native large titles over a transparent bar. */
export function tabStackOptions(bg: string): Options {
  return {
    headerLargeTitle: true,
    headerTransparent: process.env.EXPO_OS === 'ios',
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: bg },
  };
}
