/**
 * Text-to-speech with the browser's built-in voices (Web Speech API): no audio files,
 * works offline once the OS voices are installed. What to read comes from french-core.
 */
import { englishAudio, frenchAudio, hasFrenchFront, isFrench, italicRuns, meaningOf, meaningParts, speechText } from './french-core'

export { englishAudio, frenchAudio, hasFrenchFront, isFrench, meaningOf }
/** French examples in a card's Markdown (its italic runs). */
export const frenchExamples = italicRuns

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

type Lang = 'fr' | 'en'
const cached: Partial<Record<Lang, SpeechSynthesisVoice | null>> = {}
const NOVELTY = /grandma|grandpa|rocko|bells|bubbles|jester|whisper|zarvox|albert|bahh|boing|cellos|organ|superstar|trinoids|wobble|bad news|good news/i

/** Best available voice for a language: the main locale and the higher-quality system voices first. */
function voiceFor(lang: Lang) {
  if (!canSpeak) return null
  const hit = cached[lang]
  if (hit) return hit
  const main = lang === 'fr' ? 'fr-FR' : 'en-US'
  const named = lang === 'fr' ? /amélie|thomas|audrey|marie/i : /samantha|daniel|karen|alex|ava|serena/i
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang === main ? 4 : 0) + (/premium|enhanced|natural|google|neural/i.test(v.name) ? 2 : 0) + (named.test(v.name) ? 1 : 0) - (NOVELTY.test(v.name) ? 10 : 0)
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang))
  cached[lang] = voices.sort((a, b) => score(b) - score(a))[0] ?? null
  return cached[lang]
}
if (canSpeak) speechSynthesis.addEventListener?.('voiceschanged', () => (delete cached.fr, delete cached.en))

function speak(text: string, lang: Lang, rate: number, queue: boolean) {
  if (!canSpeak) return
  const clean = speechText(text)
  if (!clean) return
  if (!queue) speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
  u.rate = rate
  const v = voiceFor(lang)
  if (v) u.voice = v
  speechSynthesis.speak(u)
}

export const speakFrench = (text: string, rate = 0.92) => speak(text, 'fr', rate, false)
/** Reads several French snippets one after another (e.g. a grammar card's examples). */
export function speakFrenchList(parts: string[]) {
  stopSpeaking()
  parts.forEach((t) => speak(t, 'fr', 0.92, true))
}
/** Reads English; `queue` plays it after whatever is already speaking. */
export const speakEnglish = (text: string, queue = false) => speak(text, 'en', 1, queue)
/** Reads a vocab/expression meaning, any French gloss in it (e.g. "il faut = you have to") in the French voice. */
export function speakMeaning(back: string, queue = false) {
  meaningParts(back).forEach((p, i) => speak(p.text, p.lang, p.lang === 'fr' ? 0.92 : 1, queue || i > 0))
}
export const playFrench = (card: { front: string; back: string; tags: string[] }) => speakFrenchList(frenchAudio(card))

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel()
}

const AUTO_KEY = 'recall:autoSpeak'
export function getAutoSpeak() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0'
  } catch {
    return true
  }
}
export function setAutoSpeak(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}
