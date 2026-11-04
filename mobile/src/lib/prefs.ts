import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export type ThemePref = 'light' | 'dark' | 'system';

export interface Prefs {
  theme: ThemePref;
  haptics: boolean;
  swipeHints: boolean;
  /** Read French cards aloud automatically while studying. */
  autoSpeak: boolean;
}

const DEFAULTS: Prefs = { theme: 'light', haptics: true, swipeHints: true, autoSpeak: true };

function read(): Prefs {
  try {
    const raw = Storage.getItemSync('prefs');
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let prefs = read();
const listeners = new Set<() => void>();

export function getPrefs() {
  return prefs;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs = { ...prefs, [key]: value };
  Storage.setItemSync('prefs', JSON.stringify(prefs));
  if (key === 'theme') applyTheme();
  listeners.forEach((l) => l());
}

export function usePrefs() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}

/** Light by default; dark only when the user opts in. */
export function applyTheme() {
  Appearance.setColorScheme(prefs.theme === 'system' ? 'unspecified' : prefs.theme);
}
