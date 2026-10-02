import { getOutputLanguageEnglishName } from '../data/outputLanguages.js'
import { hashText } from './hash.js'
import type { ScriptLine, ScriptSection } from './lesson.js'
import { normalizeForSpeech, speechLanguage } from './pronunciation.js'

/** Audio Lesson speech (OpenAI text-to-speech only). Switch the model here: voices, price and the
 * instruction field follow from TTS_MODELS. gpt-4o-mini-tts follows a per-speaker style instruction
 * (warm, clear, natural pronunciation for the lesson language). Measured on the same Turkish lines:
 * tts-1 $0.0122/min, gpt-4o-mini-tts $0.0184/min, tts-1-hd $0.0244/min. */
export const TTS_MODEL = 'gpt-4o-mini-tts'

export interface TtsModelInfo {
  voices: readonly string[]
  /** gpt-4o-mini-tts takes an `instructions` field; tts-1 / tts-1-hd don't. */
  instructions: boolean
  /** Billing: per character of input (tts-1, tts-1-hd) or measured per minute of audio. */
  usdPerMillionChars?: number
  usdPerMinute?: number
}

const CLASSIC_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'] as const

export const TTS_MODELS: Record<string, TtsModelInfo> = {
  'tts-1': { voices: CLASSIC_VOICES, instructions: false, usdPerMillionChars: 15 },
  'tts-1-hd': { voices: CLASSIC_VOICES, instructions: false, usdPerMillionChars: 30 },
  'gpt-4o-mini-tts': { voices: [...CLASSIC_VOICES, 'ballad', 'verse', 'marin', 'cedar'], instructions: true, usdPerMinute: 0.0183 },
}

export const TTS_VOICES = TTS_MODELS[TTS_MODEL].voices

/** Two clearly different default voices for two-speaker styles. */
export const DEFAULT_VOICES: Record<string, string> =
  TTS_MODEL === 'gpt-4o-mini-tts'
    ? { hostA: 'marin', hostB: 'cedar', teacher: 'cedar', student: 'marin', narrator: 'marin' }
    : { hostA: 'nova', hostB: 'onyx', teacher: 'onyx', student: 'nova', narrator: 'nova' }

export { PAUSE_SECONDS } from './lesson.js'
/** Lines per "speak" request and requests in flight: each request stays far under the 300s limit. */
export const SPEAK_BATCH_LINES = 6
export const SPEAK_PARALLEL_REQUESTS = 2
export const MAX_SPEAK_LINE_CHARS = 1000

/** Owner caps per day (server-side, per IP and per access code). */
export const DAILY_LESSON_CAP = 3
export const DAILY_AUDIO_SECONDS_CAP = 30 * 60

export function speakerInstruction(speaker: string, language: string): string {
  const voice: Record<string, string> = {
    teacher: 'a warm, clear, patient teacher who explains step by step',
    student: 'a curious, friendly student who asks real questions',
    hostA: 'a warm, clear podcast host who explains like a good teacher',
    hostB: 'a lively, curious, friendly co-host',
    narrator: 'a warm, clear narrator who teaches like a good teacher',
  }
  const name = language === 'auto' ? null : getOutputLanguageEnglishName(language)
  const accent = name
    ? `Speak natural ${name} with a native ${name} accent and correct ${name} stress and intonation.`
    : 'Speak the language of the text naturally, with a native accent and correct stress and intonation.'
  return `Voice: ${voice[speaker] ?? voice.narrator}. ${accent} Moderate, steady pace; short natural pauses at commas and full stops.`
}

/** Exactly what the server will send to TTS for this line (deterministic). */
export function spokenText(line: Pick<ScriptLine, 'text'>, language: string): { text: string; unknownAbbreviations: string[] } {
  return normalizeForSpeech(line.text, speechLanguage(language, line.text))
}

/** Segment cache key: (normalized text, voice, model, instructions). Identical lines share audio. */
export function segmentKey(line: Pick<ScriptLine, 'text' | 'speaker'>, voice: string, language: string, model = TTS_MODEL): string {
  const instructions = TTS_MODELS[model]?.instructions ? speakerInstruction(line.speaker, language) : ''
  return hashText(JSON.stringify([spokenText(line, language).text, voice, model, instructions]))
}

export function voiceFor(speaker: string, voices: Record<string, string> | undefined): string {
  const chosen = voices?.[speaker]
  return chosen && TTS_VOICES.includes(chosen) ? chosen : (DEFAULT_VOICES[speaker] ?? TTS_VOICES[0])
}

/** About 14 characters of Turkish/English speech per second at a normal pace. */
const CHARS_PER_SECOND = 14

export function estimateSpeechSeconds(chars: number): number {
  return chars / CHARS_PER_SECOND
}

export function estimateSpeechCostUsd(chars: number, model = TTS_MODEL): number {
  const info = TTS_MODELS[model]
  if (info.usdPerMillionChars) return (chars * info.usdPerMillionChars) / 1_000_000
  return (estimateSpeechSeconds(chars) / 60) * (info.usdPerMinute ?? 0)
}

export function lessonLines(sections: ScriptSection[]): ScriptLine[] {
  return sections.flatMap((section) => section.lines)
}

/** Lines in the self-check whose text is an answer (they follow a pause line): hidden until "Show answer". */
export function selfCheckAnswerIds(sections: ScriptSection[]): Set<string> {
  const ids = new Set<string>()
  for (const section of sections) {
    if (section.role !== 'selfcheck') continue
    let afterPause = false
    for (const line of section.lines) {
      if (line.pause) {
        afterPause = true
        continue
      }
      if (afterPause && !/[?？]\s*$/.test(line.text)) ids.add(line.id)
      else afterPause = false
    }
  }
  return ids
}
