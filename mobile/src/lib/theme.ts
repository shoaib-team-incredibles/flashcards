import { useColorScheme } from 'react-native';

/**
 * Design tokens. Light is the default appearance; dark is opt-in from Settings.
 * Hex values (not PlatformColor) so they can be animated by Reanimated.
 */
const light = {
  bg: '#F2F2F7', // iOS systemGroupedBackground
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  subtle: '#EDEDF2',
  line: 'rgba(60,60,67,0.12)',
  fg: '#16161A',
  muted: '#5F5F68',
  faint: '#9A9AA3',
  accent: '#4F46E5',
  accentSoft: '#ECEBFF',
  accentFg: '#FFFFFF',
  again: '#E5484D',
  hard: '#E08A00',
  good: '#12A150',
  easy: '#0B84D8',
  cardShadow: 'rgba(20,20,40,0.10)',
};

const dark: typeof light = {
  bg: '#000000',
  surface: '#1C1C1E',
  surfaceRaised: '#232326',
  subtle: '#2C2C2E',
  line: 'rgba(84,84,88,0.45)',
  fg: '#F2F2F5',
  muted: '#A1A1AB',
  faint: '#6C6C76',
  accent: '#8B8CF8',
  accentSoft: '#25244A',
  accentFg: '#0D0D10',
  again: '#FF6369',
  hard: '#FFB224',
  good: '#3DD68C',
  easy: '#52A9FF',
  cardShadow: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof light;
export const palette = { light, dark };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };

export const RATING_COLOR = (c: Colors) => ({ 1: c.again, 2: c.hard, 3: c.good, 4: c.easy }) as const;
