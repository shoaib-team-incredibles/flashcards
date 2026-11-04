# Recall for iOS

The native app version of Recall: local-first spaced repetition with the same FSRS-5 scheduler and backup format as the web app.

```bash
cd mobile
npm install
npx expo run:ios          # builds the native app and launches it in the simulator
npm run typecheck && npx expo lint
```

## Stack

- **Expo SDK 58 · React Native 0.88 · React 19.3** with the React Compiler on
- **Expo Router** with **native iOS tabs** (`expo-router/native-tabs` → `UITabBarController`: Liquid Glass, minimize on scroll, a system search tab) and a native stack with large titles in each tab
- **Reanimated 4 + Gesture Handler 3** for the flashcard: a 3D flip with a light sweep, swiping to grade, and a card stack behind
- **expo-sqlite** for storage (synchronous reads, so screens never show a loading flash), with `kv-store` for preferences
- **Supabase** sync with the web app (email + password sign-in, offline-first outbox) — setup in the [root README](../README.md#sync-supabase)
- SF Symbols, expo-haptics, expo-sharing, expo-document-picker and expo-clipboard

## Layout

```
src/app/(tabs)/        Today · Decks (+ deck detail) · Stats · Settings · Search   ← NativeTabs
src/app/study.tsx      full-screen study session
src/app/card.tsx       card editor (form sheet)
src/app/deck-form.tsx  new / edit deck (form sheet)
src/app/import.tsx     paste or open a file → cards
src/app/sync.tsx       sign in to sync (form sheet)
src/components/        Flashcard (animation), CardText (mini-Markdown), Charts, UI kit
src/lib/               fsrs.ts + importers.ts (shared with web) · db.ts (SQLite) · sync-core.ts (shared with web) + sync.ts · session.ts · prefs.ts
```

## Studying

- Tap the card to flip it. Tap again to look at the front.
- Swipe right for **Good** or left for **Again**. Hard and Easy are on the buttons, and the card flies off in the direction of the grade.
- Use the ⋯ menu to edit or suspend the current card, and ↺ to undo.

Appearance is light by default. Dark mode and "match system" are in Settings.
