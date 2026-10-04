import { createHash } from 'node:crypto'

import { cleanString, isRecord } from './llm-json.js'
import { encodeMp3 } from './mp3-encode.js'
import { LESSON_SPEAKERS, effectiveDelivery, isDeliveryHint, isLessonStyle } from '../../src/lib/lesson.js'
import type { DeliveryHint, LessonErrorCode } from '../../src/lib/lesson.js'
import { floatToPcm16, normalizeLoudness, pcm16ToFloat, truePeakDb } from '../../src/lib/loudness.js'
import { MIN_QUESTION_RISE_SEMITONES, endRiseSemitones } from '../../src/lib/pitch.js'
import {
  DAILY_AUDIO_SECONDS_CAP,
  DAILY_LESSON_CAP,
  MAX_SPEAK_LINE_CHARS,
  SPEAK_BATCH_LINES,
  TTS_MODEL,
  estimateSpeechCostUsd,
  estimateSpeechSeconds,
  lineInstruction,
  spokenText,
  voiceFor,
} from '../../src/lib/lessonAudio.js'
import { mp3DurationSeconds } from '../../src/lib/mp3.js'

const TTS_TIMEOUT_MS = 60_000
const TTS_PARALLEL = 3

export interface SpokenSegment {
  id: string
  /** base64 MP3 */
  audio: string
  durationSeconds: number
}

export interface SpeakResponse {
  segments: SpokenSegment[]
  /** Lines that still failed after one retry. */
  failed: string[]
  unknownAbbreviations: string[]
  usage: { costUsd: number; seconds: number; chars: number }
}

// ---------------------------------------------------------------------------
// Owner caps (best effort, in memory like the other per-IP limits: resets on a cold start)
// ---------------------------------------------------------------------------

interface DayUsage {
  day: string
  lessons: Set<string>
  seconds: number
}

const dailyUsage = new Map<string, DayUsage>()
let monthSpend = { month: '', usd: 0 }

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function usageFor(key: string): DayUsage {
  const day = today()
  const existing = dailyUsage.get(key)
  if (existing && existing.day === day) return existing
  const fresh = { day, lessons: new Set<string>(), seconds: 0 }
  dailyUsage.set(key, fresh)
  return fresh
}

/** Caps apply both per IP and per access code (hashed, never stored as is). */
function capKeys(ip: string, accessCode: string | undefined): string[] {
  return [`ip:${ip}`, ...(accessCode ? [`code:${createHash('sha256').update(accessCode).digest('hex').slice(0, 16)}`] : [])]
}

function checkDailyCaps(ip: string, accessCode: string | undefined, lessonKey: string, plannedSeconds: number): boolean {
  return capKeys(ip, accessCode).every((key) => {
    const usage = usageFor(key)
    const newLesson = !usage.lessons.has(lessonKey)
    if (newLesson && usage.lessons.size >= DAILY_LESSON_CAP) return false
    return usage.seconds + plannedSeconds <= DAILY_AUDIO_SECONDS_CAP
  })
}

function recordDaily(ip: string, accessCode: string | undefined, lessonKey: string, seconds: number) {
  for (const key of capKeys(ip, accessCode)) {
    const usage = usageFor(key)
    usage.lessons.add(lessonKey)
    usage.seconds += seconds
  }
}

/** Optional LESSON_MONTHLY_BUDGET_USD: every paid lesson call stops once it would be exceeded. */
export function monthlyBudgetUsd(): number | null {
  const raw = Number(process.env.LESSON_MONTHLY_BUDGET_USD)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

function currentMonthSpend(): number {
  const month = new Date().toISOString().slice(0, 7)
  if (monthSpend.month !== month) monthSpend = { month, usd: 0 }
  return monthSpend.usd
}

export function wouldExceedBudget(estimateUsd: number): boolean {
  const budget = monthlyBudgetUsd()
  return budget !== null && currentMonthSpend() + estimateUsd > budget
}

export function recordSpend(usd: number) {
  currentMonthSpend()
  monthSpend.usd += usd
}

// ---------------------------------------------------------------------------
// OpenAI text-to-speech
// ---------------------------------------------------------------------------

interface TtsResult {
  /** Raw 16-bit PCM of the line (24 kHz mono), before loudness normalization. */
  pcm: Uint8Array
  costUsd: number
}

/** gpt-4o-mini-tts raw output: 24 kHz, 16-bit, mono. */
const PCM_SAMPLE_RATE = 24_000
/** Added to the instruction when a question came back flat and is spoken once more. */
const FLAT_QUESTION_NOTE = ' The previous attempt sounded flat: exaggerate the rising pitch on the last word of this question.'

async function callTts(params: { text: string; voice: string; instructions: string }): Promise<TtsResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS)
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: params.voice,
        input: params.text,
        // Raw PCM so the line can be measured and brought to the target loudness before it is encoded.
        response_format: 'pcm',
        instructions: params.instructions,
        // The token-billed model reports usage only in the SSE stream.
        stream_format: 'sse',
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.log(`lesson: tts status=${response.status}`)
      return null
    }
    const chunks: Uint8Array[] = []
    let outputTokens = 0
    let inputTokens = 0
    for (const line of (await response.text()).split('\n')) {
      if (!line.startsWith('data: {')) continue
      const event = JSON.parse(line.slice(6)) as { type?: string; audio?: string; usage?: { input_tokens?: number; output_tokens?: number } }
      if (event.type === 'speech.audio.delta' && event.audio) chunks.push(Uint8Array.from(Buffer.from(event.audio, 'base64')))
      if (event.usage) {
        outputTokens = event.usage.output_tokens ?? 0
        inputTokens = event.usage.input_tokens ?? 0
      }
    }
    const pcm = Uint8Array.from(Buffer.concat(chunks))
    return pcm.length >= 2 ? { pcm, costUsd: (outputTokens * 12 + inputTokens * 0.6) / 1_000_000 } : null
  } catch (error) {
    console.log(`lesson: tts error=${error instanceof Error ? error.name : 'unknown'}`)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

interface SpeakLine {
  id: string
  speaker: string
  text: string
  delivery?: DeliveryHint
}

export function parseSpeakRequest(payload: Record<string, unknown>):
  | { lines: SpeakLine[]; voices: Record<string, string>; language: string; lessonKey: string; style: keyof typeof LESSON_SPEAKERS }
  | LessonErrorCode {
  const { lines, voices, language, lessonKey, style } = payload
  if (!isLessonStyle(style) || !Array.isArray(lines) || lines.length === 0 || lines.length > SPEAK_BATCH_LINES) return 'bad_type'
  if (typeof lessonKey !== 'string' || !lessonKey.trim() || lessonKey.length > 120) return 'bad_type'
  const speakers = LESSON_SPEAKERS[style]
  const parsed: SpeakLine[] = []
  for (const entry of lines) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.speaker !== 'string' || !speakers.includes(entry.speaker)) return 'bad_type'
    if (typeof entry.text !== 'string' || entry.text.length > MAX_SPEAK_LINE_CHARS) return 'too_long'
    const text = cleanString(entry.text, MAX_SPEAK_LINE_CHARS)
    if (!text) return 'bad_type'
    parsed.push({ id: entry.id.slice(0, 40), speaker: entry.speaker, text, ...(isDeliveryHint(entry.delivery) ? { delivery: entry.delivery } : {}) })
  }
  const voiceMap: Record<string, string> = {}
  for (const speaker of speakers) voiceMap[speaker] = voiceFor(speaker, isRecord(voices) ? (voices as Record<string, string>) : undefined)
  return { lines: parsed, voices: voiceMap, language: typeof language === 'string' ? language.slice(0, 20) : 'auto', lessonKey: lessonKey.trim(), style }
}

/** Records a small batch of lines; each line is one MP3 segment, failed lines are retried once. */
export async function speakBatch(
  request: Exclude<ReturnType<typeof parseSpeakRequest>, LessonErrorCode>,
  context: { ip: string; accessCode?: string },
): Promise<{ status: number; body: SpeakResponse | { error: LessonErrorCode | 'daily_cap' | 'budget' } }> {
  if (!process.env.OPENAI_API_KEY) return { status: 503, body: { error: 'not_configured' } }
  const prepared = request.lines.map((line) => {
    const spoken = spokenText(line, request.language)
    return { ...line, spoken: spoken.text, unknown: spoken.unknownAbbreviations }
  })
  const chars = prepared.reduce((sum, line) => sum + line.spoken.length, 0)
  if (!checkDailyCaps(context.ip, context.accessCode, request.lessonKey, estimateSpeechSeconds(chars))) return { status: 429, body: { error: 'daily_cap' } }
  if (wouldExceedBudget(estimateSpeechCostUsd(chars))) return { status: 402, body: { error: 'budget' } }

  const segments: SpokenSegment[] = []
  const failed: string[] = []
  let costUsd = 0
  let seconds = 0
  let next = 0
  const worker = async () => {
    while (next < prepared.length) {
      const line = prepared[next++]
      const voice = request.voices[line.speaker]
      const instructions = lineInstruction(line, request.language)
      const result = (await callTts({ text: line.spoken, voice, instructions })) ?? (await callTts({ text: line.spoken, voice, instructions }))
      if (!result) {
        failed.push(line.id)
        continue
      }
      let samples = pcm16ToFloat(result.pcm)
      let lineCost = result.costUsd
      // A question must sound like one: when the pitch does not rise at the end, it is spoken once more and the better take is kept.
      if (effectiveDelivery(line) === 'question') {
        const rise = endRiseSemitones(samples, PCM_SAMPLE_RATE)
        if (rise !== null && rise < MIN_QUESTION_RISE_SEMITONES) {
          const again = await callTts({ text: line.spoken, voice, instructions: `${instructions}${FLAT_QUESTION_NOTE}` })
          if (again) {
            lineCost += again.costUsd
            const retakeSamples = pcm16ToFloat(again.pcm)
            const retakeRise = endRiseSemitones(retakeSamples, PCM_SAMPLE_RATE)
            if (retakeRise !== null && retakeRise > rise) samples = retakeSamples
            console.log(`lesson: speak question riseFirst=${rise.toFixed(1)} riseRetake=${retakeRise === null ? 'n/a' : retakeRise.toFixed(1)}`)
          }
        }
      }
      const normalized = normalizeLoudness(samples, PCM_SAMPLE_RATE)
      const audio = encodeMp3(floatToPcm16(normalized.samples), PCM_SAMPLE_RATE)
      const durationSeconds = mp3DurationSeconds(audio)
      costUsd += lineCost
      seconds += durationSeconds
      console.log(`lesson: speak line lufsBefore=${normalized.beforeLufs.toFixed(1)} gainDb=${normalized.gainDb.toFixed(1)} peakDb=${truePeakDb(normalized.samples).toFixed(1)}`)
      segments.push({ id: line.id, audio: Buffer.from(audio).toString('base64'), durationSeconds: Math.round(durationSeconds * 1000) / 1000 })
    }
  }
  await Promise.all(Array.from({ length: Math.min(TTS_PARALLEL, prepared.length) }, worker))

  if (segments.length === 0) return { status: 502, body: { error: 'upstream' } }
  recordDaily(context.ip, context.accessCode, request.lessonKey, seconds)
  recordSpend(costUsd)
  const unknownAbbreviations = [...new Set(prepared.flatMap((line) => line.unknown))]
  console.log(`lesson: action=speak model=${TTS_MODEL} lines=${segments.length} failed=${failed.length} chars=${chars} seconds=${seconds.toFixed(1)} cost=$${costUsd.toFixed(5)}`)
  const order = new Map(prepared.map((line, index) => [line.id, index]))
  segments.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  return { status: 200, body: { segments, failed, unknownAbbreviations, usage: { costUsd: Math.round(costUsd * 100000) / 100000, seconds: Math.round(seconds * 10) / 10, chars } } }
}
