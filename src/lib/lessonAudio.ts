import { getOutputLanguageEnglishName } from '../data/outputLanguages.js'
import { hashText } from './hash.js'
import { PAUSE_SECONDS, effectiveDelivery } from './lesson.js'
import type { DeliveryHint, ScriptLine, ScriptSection } from './lesson.js'
import { mp3DurationSeconds, silentMp3 } from './mp3.js'
import { normalizeForSpeech, speechLanguage } from './pronunciation.js'

/** Audio Lesson speech (OpenAI text-to-speech only). gpt-4o-mini-tts follows a per-speaker style
 * instruction (warm, clear, natural pronunciation for the lesson language) and is billed by audio
 * tokens, measured at about $0.0183 per minute. Changing it means re-measuring the speaking rates in lesson.ts. */
export const TTS_MODEL = 'gpt-4o-mini-tts'
const TTS_USD_PER_MINUTE = 0.0183

export const TTS_VOICES: readonly string[] = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'ballad', 'verse', 'marin', 'cedar']

/** Two clearly different default voices for two-speaker styles. */
const DEFAULT_VOICES: Record<string, string> = { hostA: 'marin', hostB: 'cedar', teacher: 'cedar', student: 'marin', narrator: 'marin' }

export { PAUSE_SECONDS } from './lesson.js'
/** Lines per "speak" request and requests in flight: each request stays far under the 300s limit. */
export const SPEAK_BATCH_LINES = 6
export const SPEAK_PARALLEL_REQUESTS = 2
export const MAX_SPEAK_LINE_CHARS = 1000

/** Owner caps per day (server-side, per IP and per access code). */
export const DAILY_LESSON_CAP = 3
export const DAILY_AUDIO_SECONDS_CAP = 30 * 60

/** What each per-line delivery hint asks of the voice (added to the speaker's style). */
const DELIVERY_INSTRUCTIONS: Record<DeliveryHint, string> = {
  question: 'This line is a QUESTION asked to a friend. The pitch rises over the last two syllables and the very last syllable is the highest note of the whole sentence, clearly higher (about 4 to 6 semitones) than the middle of the sentence. Never drop the voice at the end and never trail off.',
  warm: 'Deliver this line warmly and calmly, like explaining to a friend.',
  surprised: 'Sound pleasantly surprised and amazed, with lively, rising energy.',
  encouraging: 'Sound encouraging and positive, smiling while you speak.',
  slow: 'Speak slowly and very clearly, stressing each key term so the listener can catch it.',
  playful: 'Sound playful and light, with a smile in the voice, like telling a joke.',
}

/** Bumped when the audio processing changes (loudness normalization), so older recordings are redone. */
const AUDIO_VERSION = 2

export function speakerInstruction(speaker: string, language: string, delivery?: DeliveryHint): string {
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
  const line = delivery ? ` ${DELIVERY_INSTRUCTIONS[delivery]}` : ''
  return `Voice: ${voice[speaker] ?? voice.narrator}. ${accent} Moderate, steady pace; short natural pauses at commas and full stops.${line}`
}

/** The delivery a line is spoken with: the writer's hint, and always "question" for a question. */
export function lineInstruction(line: Pick<ScriptLine, 'text' | 'speaker' | 'delivery'>, language: string): string {
  return speakerInstruction(line.speaker, language, effectiveDelivery(line))
}

/** Exactly what the server will send to TTS for this line (deterministic). */
export function spokenText(line: Pick<ScriptLine, 'text'>, language: string): { text: string; unknownAbbreviations: string[] } {
  return normalizeForSpeech(line.text, speechLanguage(language, line.text))
}

/** Segment cache key: (normalized text, voice, model, instructions). Identical lines share audio. */
export function segmentKey(line: Pick<ScriptLine, 'text' | 'speaker' | 'delivery'>, voice: string, language: string): string {
  return hashText(JSON.stringify([spokenText(line, language).text, voice, TTS_MODEL, lineInstruction(line, language), AUDIO_VERSION]))
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

export function estimateSpeechCostUsd(chars: number): number {
  return (estimateSpeechSeconds(chars) / 60) * TTS_USD_PER_MINUTE
}

/** Real length of the joined lesson file: every line's MP3 frames plus the silence after each pause line
 * (exactly what the player joins), so the shown duration is the file's, never an estimate. */
export function joinedAudioSeconds(lines: ScriptLine[], audioByLine: Map<string, Uint8Array>): number {
  const first = audioByLine.get(lines[0]?.id ?? '')
  const silenceSeconds = first ? mp3DurationSeconds(silentMp3(first, PAUSE_SECONDS)) : 0
  return lines.reduce((sum, line) => {
    const audio = audioByLine.get(line.id)
    return audio ? sum + mp3DurationSeconds(audio) + (line.pause ? silenceSeconds : 0) : sum
  }, 0)
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
