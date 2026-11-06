# Recall

A personal, local-first spaced-repetition learning system (like Anki) for the web.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ — host anywhere (Vercel, Netlify, GitHub Pages)
```

## What's inside

- **Spaced repetition** — FSRS-5 scheduler (`src/lib/fsrs.ts`), the algorithm modern Anki uses. Per-deck daily limits and desired retention.
- **Study** — Space to flip, 1–4 to grade (Again/Hard/Good/Easy), Z to undo, E to edit, `-` to suspend.
- **Tests** — multiple choice, typed answers (typo/accent tolerant), true/false, self-check. Focus on weakest cards; misses are fed back into the review schedule.
- **Import** — paste or drop: `front :: back`, tab/CSV/semicolon, Anki "Notes in Plain Text", Quizlet, `Q:`/`A:` blocks, Markdown headings, JSON. Live preview, duplicate detection, AI prompt to turn notes into cards.
- **Stats** — heatmap, reviews per day, forecast, retention, card maturity, test score history.
- **Data** — stored in IndexedDB in your browser, synced with the iOS app through Firebase when you sign in. Back up / restore everything as JSON in Settings.
- **French** — a French section (`/french`): 1,000 most useful words, 200 expressions and 200 grammar cards (ordered by payoff, with notes on irregular forms, false friends and register), a mastery guide, and audio via the browser's French voice (auto-play, **R** to replay, tap italic French to hear it). Content lives in `decks/french-*.json` and `decks/french-guide.md`; **Update** on the French page adds new cards and refreshes corrected ones without touching review history.
- Markdown on cards (code, tables, images), dark mode, ⌘K command palette, mobile layout.

## Sync (Firebase)

KnowDeck syncs decks, cards, review history, tests and quotes between the web app and the iOS app through Firestore in the Firebase project `knowdeck-app`. Create an account in **Settings → Sync** on one device and sign in with the same email and password on the others. Signed out, both apps run local-only.

- The public web config is in `src/lib/firebase-config.ts` (copied to `mobile/src/lib/`). It isn't secret; access is controlled by [`firestore.rules`](firestore.rules).
- Each record is a document at `users/{uid}/records/{kind:id}`.
- Deploy rule changes with `firebase deploy --only firestore`.

How it works: each device keeps an outbox of the records it changed (Dexie hooks on the web, `db.ts` writes on iOS). A sync pushes that outbox, then pulls rows newer than its cursor. Conflicts resolve last-write-wins on the edit time, enforced by `firestore.rules`. Syncs run on launch, ~2 s after an edit, on focus and every minute. The engine is `src/lib/sync-core.ts`, copied verbatim to `mobile/src/lib/`.

## Layout

```
src/lib/       fsrs.ts (scheduler) · session.ts (queues) · quiz.ts (tests) · importers.ts · db.ts (Dexie) · sync-core.ts + sync.ts (Firebase)
src/pages/     Dashboard · DeckPage · Study · Test · Import · Stats · Settings
src/components UI kit, layout, card editor, charts, command palette
```
