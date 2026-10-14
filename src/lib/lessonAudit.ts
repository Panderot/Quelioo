import { FIXED_THINK_PHRASE, PAUSE_SECONDS, THINK_INVITATION, timingFor } from './lesson.js'
import type { ScriptLine, ScriptSection } from './lesson.js'
import { VOICE_PITCH_BANDS, MIN_SPEAKER_PITCH_GAP_HZ } from './lessonAudio.js'
import type { VoiceGender } from './lessonAudio.js'

/** Checks that a finished lesson (script and recorded lines) keeps the rules of the Audio Lesson: used by the tests and
 * by the measuring script, so a lesson and the checks on it can never drift apart. Pure, no network. */

export interface ScriptAudit {
  questions: number
  pausedQuestions: number
  /** Questions that carry a pause or invite the listener in words. */
  thinkQuestions: number
  fixedPhraseLines: string[]
  repeatedInvitations: string[]
  pauseWithinFirstSeconds: boolean
  pauseSeconds: number
  issues: string[]
}

const endsWithQuestion = (text: string) => /[?？]\s*$/.test(text)
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).length

export function auditScript(sections: ScriptSection[], language: string): ScriptAudit {
  const lines = sections.flatMap((section) => section.lines)
  const timing = timingFor(language)
  const questions = lines.filter((line) => endsWithQuestion(line.text))
  const fixedPhraseLines = lines.filter((line) => FIXED_THINK_PHRASE.test(line.text)).map((line) => line.id)
  const seen = new Set<string>()
  const repeatedInvitations: string[] = []
  for (const line of lines) {
    for (const sentence of line.text.split(/(?<=[.!?…？])\s+/u)) {
      if (!THINK_INVITATION.test(sentence) || wordsOf(sentence) > 12) continue
      const key = sentence.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      if (seen.has(key)) repeatedInvitations.push(line.id)
      seen.add(key)
    }
  }
  let clock = 0
  let pauseWithinFirstSeconds = false
  for (const line of lines) {
    clock += wordsOf(line.text) * timing.secondsPerWord + timing.lineGap
    if (line.pause && clock < 20) pauseWithinFirstSeconds = true
  }
  const think = questions.filter((line) => line.pause === true || THINK_INVITATION.test(line.text))
  const paused = questions.filter((line) => line.pause === true)
  const issues: string[] = []
  if (fixedPhraseLines.length > 0) issues.push(`fixed think phrase in ${fixedPhraseLines.join(', ')}`)
  if (think.length * 3 > questions.length) issues.push(`think invitations ${think.length} of ${questions.length} questions (max one third)`)
  if (repeatedInvitations.length > 0) issues.push(`same invitation twice: ${repeatedInvitations.join(', ')}`)
  if (pauseWithinFirstSeconds) issues.push('thinking pause in the first 20 seconds')
  if (lines.some((line) => line.pause && !endsWithQuestion(line.text))) issues.push('pause on a line that is not a question')
  return { questions: questions.length, pausedQuestions: paused.length, thinkQuestions: think.length, fixedPhraseLines, repeatedInvitations, pauseWithinFirstSeconds, pauseSeconds: paused.length * PAUSE_SECONDS, issues }
}

export interface SpokenLineMeasure {
  id: string
  speaker: string
  gender: VoiceGender
  /** Median pitch of the line in Hz; null when it could not be measured. */
  pitchHz: number | null
}

export interface SpeakerAudit {
  /** Lines whose pitch is outside their speaker's register (a man sounding like a woman or the reverse). */
  offRegister: string[]
  medianBySpeaker: Record<string, number>
  /** Smallest gap between two speakers' median pitch (Infinity for one speaker). */
  gapHz: number
  issues: string[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function auditSpeakers(lines: SpokenLineMeasure[]): SpeakerAudit {
  const offRegister = lines.filter((line) => line.pitchHz !== null && (line.pitchHz < VOICE_PITCH_BANDS[line.gender].min || line.pitchHz > VOICE_PITCH_BANDS[line.gender].max)).map((line) => line.id)
  const bySpeaker = new Map<string, number[]>()
  for (const line of lines) if (line.pitchHz !== null) bySpeaker.set(line.speaker, [...(bySpeaker.get(line.speaker) ?? []), line.pitchHz])
  const medianBySpeaker = Object.fromEntries([...bySpeaker].map(([speaker, values]) => [speaker, Math.round(median(values))]))
  const medians = Object.values(medianBySpeaker)
  const gapHz = medians.length < 2 ? Number.POSITIVE_INFINITY : Math.min(...medians.flatMap((a, i) => medians.slice(i + 1).map((b) => Math.abs(a - b))))
  const issues: string[] = []
  if (offRegister.length > 0) issues.push(`lines outside their speaker's register: ${offRegister.join(', ')}`)
  if (gapHz < MIN_SPEAKER_PITCH_GAP_HZ) issues.push(`speakers only ${Math.round(gapHz)} Hz apart (min ${MIN_SPEAKER_PITCH_GAP_HZ})`)
  return { offRegister, medianBySpeaker, gapHz, issues }
}

/** Share of the lesson that is silence in runs of at least `minRunSeconds` (the long pauses a listener notices). */
export function longSilenceShare(samples: Float32Array, sampleRate: number, minRunSeconds = 1.2): number {
  const window = Math.round(sampleRate * 0.02)
  const threshold = 10 ** (-48 / 20)
  let run = 0
  let silent = 0
  const flush = () => {
    if (run * window >= minRunSeconds * sampleRate) silent += run * window
    run = 0
  }
  for (let start = 0; start + window <= samples.length; start += window) {
    let sum = 0
    for (let index = start; index < start + window; index += 1) sum += samples[index] * samples[index]
    if (Math.sqrt(sum / window) < threshold) run += 1
    else flush()
  }
  flush()
  return samples.length === 0 ? 0 : silent / samples.length
}

/** Lines whose recorded audio is byte for byte the same file as another line's (a copied clip). */
export function duplicateSegments(audioByLine: Map<string, string>): string[] {
  const seen = new Map<string, string>()
  const duplicates: string[] = []
  for (const [id, hash] of audioByLine) {
    if (seen.has(hash)) duplicates.push(id)
    else seen.set(hash, id)
  }
  return duplicates
}

/** Lines of a script, for the tests that need them flat. */
export function scriptLines(sections: ScriptSection[]): ScriptLine[] {
  return sections.flatMap((section) => section.lines)
}
