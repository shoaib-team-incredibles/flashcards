import * as Speech from 'expo-speech';

import { englishAudio, frenchAudio, hasFrenchFront, isFrench, italicRuns, meaningOf, meaningParts, speechText } from './french-core';

export { englishAudio, frenchAudio, hasFrenchFront, isFrench, italicRuns, meaningOf };

/**
 * Text-to-speech with iOS's built-in voices (AVSpeechSynthesizer via expo-speech):
 * no audio files and it works offline. What to read comes from french-core.
 */

type Lang = 'fr' | 'en';
const voices: Partial<Record<Lang, string | null>> = {};
const NOVELTY = /grandma|grandpa|rocko|bells|bubbles|jester|whisper|zarvox|albert|bahh|boing|cellos|organ|superstar|trinoids|wobble|bad news|good news/i;

/** Picks the best installed voice per language once: main locale, Enhanced/Premium quality first. */
async function loadVoices() {
  try {
    const all = await Speech.getAvailableVoicesAsync();
    for (const lang of ['fr', 'en'] as const) {
      const main = lang === 'fr' ? 'fr-FR' : 'en-US';
      const named = lang === 'fr' ? /amélie|thomas|audrey|marie/i : /samantha|ava|zoe|evan|nathan|daniel/i;
      const score = (v: Speech.Voice) =>
        (v.language === main ? 4 : 0) +
        (v.quality === Speech.VoiceQuality.Enhanced || /premium|enhanced/i.test(v.identifier) ? 3 : 0) +
        (named.test(v.name) ? 1 : 0) -
        (NOVELTY.test(v.name) || /eloquence/i.test(v.identifier) ? 10 : 0);
      const best = all.filter((v) => v.language.toLowerCase().startsWith(lang)).sort((a, b) => score(b) - score(a))[0];
      voices[lang] = best?.identifier ?? null;
    }
  } catch {
    /* fall back to the system default voice for the language */
  }
}
const ready = loadVoices();

function speak(text: string, lang: Lang, rate: number) {
  const clean = speechText(text);
  if (!clean) return;
  Speech.speak(clean, {
    language: lang === 'fr' ? 'fr-FR' : 'en-US',
    rate,
    voice: voices[lang] ?? undefined,
  });
}

/** Bumped on every play/stop so only the latest request gets to speak. */
let generation = 0;

/**
 * Stops whatever is playing, then reads `parts` one after another. Rapid taps each await
 * stop() before queueing, so without the generation check every tap would end up playing.
 */
function play(parts: { text: string; lang: Lang }[]) {
  const mine = ++generation;
  void (async () => {
    await Speech.stop();
    await ready;
    if (mine !== generation) return;
    for (const p of parts) speak(p.text, p.lang, p.lang === 'fr' ? 0.9 : 1);
  })();
}

export const speakFrench = (text: string) => play([{ text, lang: 'fr' }]);
export const speakEnglish = (text: string) => play([{ text, lang: 'en' }]);
export const speakFrenchList = (parts: string[]) => play(parts.map((text) => ({ text, lang: 'fr' as const })));
/** Reads a vocab/expression meaning, any French gloss in it (e.g. "il faut = you have to") in the French voice. */
export const speakMeaning = (back: string) => play(meaningParts(back));
export const playFrench = (card: { front: string; back: string; tags: string[] }) => speakFrenchList(frenchAudio(card));
export const playEnglish = (card: { front: string; back: string; tags: string[] }) => speakEnglish(englishAudio(card));
/** French then English (word → meaning), or for grammar the question then its examples. */
export function playBoth(card: { front: string; back: string; tags: string[] }) {
  const fr = frenchAudio(card).map((text) => ({ text, lang: 'fr' as const }));
  play(hasFrenchFront(card.tags) ? [...fr, ...meaningParts(card.back)] : [{ text: englishAudio(card), lang: 'en' as const }, ...fr]);
}
export const stopSpeaking = () => {
  generation++;
  void Speech.stop();
};
