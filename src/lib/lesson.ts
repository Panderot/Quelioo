/** Shared Audio Lesson types, limits, timing and series split — used by api/_lib/lesson.ts and the
 * /lessons pages, so the server and the plan shown to the student always agree. */

export const LESSON_STYLES = ['two_hosts', 'teacher_student', 'narrator'] as const
export type LessonStyle = (typeof LESSON_STYLES)[number]

export const LESSON_LEVELS = ['general', 'lgs', 'yks', 'kpss', 'university'] as const
export type LessonLevel = (typeof LESSON_LEVELS)[number]

export const LESSON_TONES = ['normal', 'fun'] as const
export type LessonTone = (typeof LESSON_TONES)[number]

/** Speaker ids per style; the UI labels them through i18n (`lessons.speakers.*`). */
export const LESSON_SPEAKERS: Record<LessonStyle, readonly string[]> = {
  two_hosts: ['hostA', 'hostB'],
  teacher_student: ['teacher', 'student'],
  narrator: ['narrator'],
}

export const SECTION_ROLES = ['opening', 'recall', 'teach', 'feynman', 'recap', 'selfcheck', 'tip'] as const
export type SectionRole = (typeof SECTION_ROLES)[number]

export interface LessonOptions {
  style: LessonStyle
  level: LessonLevel
  tone: LessonTone
  /** Output language code or 'auto'. */
  language: string
}

export interface KeyPoint {
  /** "K1", "K2", ... in teaching order. */
  id: string
  text: string
  /** The exact supporting sentence from the source text. */
  source: string
  /** Short topic label, used to split a series at natural topic boundaries. */
  topic: string
}

export interface EpisodePlan {
  part: number
  keyPointIds: string[]
}

export interface ScriptLine {
  id: string
  speaker: string
  text: string
  /** The listener is asked to think here: the player leaves a short silence after this line. */
  pause?: boolean
  /** Why the fact check (or a speakability rule) flagged this line; absent when it passed. */
  issue?: string
  /** Edited by the student since the last check. */
  edited?: boolean
}

export interface ScriptSection {
  id: string
  role: SectionRole
  title: string
  keyPointIds: string[]
  lines: ScriptLine[]
}

export interface EpisodeCheck {
  /** True only when the check ran and found no flagged line and no missing key point. */
  passed: boolean
  /** False when the checker itself could not run — the script is then never shown as correct. */
  ran: boolean
  missingKeyPointIds: string[]
  /** Lines the checker rewrote (or added for a missing key point) before returning. */
  rewrittenLineIds: string[]
}

export interface EpisodeScript {
  part: number
  title: string
  sections: ScriptSection[]
  check: EpisodeCheck
  wordCount: number
  estimatedSeconds: number
}

export interface LessonUsage {
  costUsd: number
  /** Share of input tokens served from the prompt cache (0-1). */
  cachedShare: number
  calls: number
}

export const MAX_KEY_POINTS = 60
const MAX_EPISODES = 12
const KEY_POINTS_PER_EPISODE = 5
/** A source with up to this many key points stays one (slightly denser) episode instead of a 2-part series. */
const MAX_SINGLE_EPISODE_KEY_POINTS = 6
export const MAX_LINE_CHARS = 600
export const MAX_LINES_PER_EPISODE = 220
export const MAX_SECTION_TITLE_CHARS = 120
export const MAX_KEY_POINT_CHARS = 400
export const MAX_KEY_POINT_SOURCE_CHARS = 800
/** A key point merges several facts; these caps are far above any merged key point so no fact is cut. */
export const MAX_MERGED_KEY_POINT_CHARS = 4000
export const MAX_MERGED_SOURCE_CHARS = 8000
export const MAX_LESSON_TITLE_CHARS = 120
/** A line longer than this can't be said in one breath. */
export const MAX_WORDS_PER_LINE = 32

/** Every episode is about 6 minutes. */
export const TARGET_EPISODE_SECONDS = 360
export const MIN_EPISODE_SECONDS = 330
export const MAX_EPISODE_SECONDS = 390

/** Measured speaking rates of the lesson TTS voices (gpt-4o-mini-tts with the per-speaker style
 * instruction): Turkish ~101 words/min (measured 101.1 and 102.6) (long agglutinative words), English ~150, Western Armenian ~107.
 * Re-measure when TTS_MODEL changes. */
const WORDS_PER_MINUTE: Record<string, number> = { tr: 101, en: 150, hyw: 107 }
const DEFAULT_WORDS_PER_MINUTE = 140

function wordsPerMinute(language: string): number {
  return WORDS_PER_MINUTE[language] ?? DEFAULT_WORDS_PER_MINUTE
}

export function wordsForSeconds(language: string, seconds: number): number {
  return Math.round((seconds / 60) * wordsPerMinute(language))
}

/** Silence the player leaves after a "pause" line (the listener thinks before the answer). */
export const PAUSE_SECONDS = 2.5
/** Pause lines a typical episode has; their silence is part of the 6 minutes. */
export const EXPECTED_PAUSES = 8

/** Length of an episode as heard: spoken words plus the silences after pause lines. */
export function episodeSeconds(sections: ScriptSection[], language: string, countWords: (text: string) => number): number {
  const lines = sections.flatMap((section) => section.lines)
  const words = lines.reduce((sum, line) => sum + countWords(line.text), 0)
  return secondsForWords(language, words) + Math.round(lines.filter((line) => line.pause).length * PAUSE_SECONDS)
}

export function secondsForWords(language: string, words: number): number {
  return Math.round((words / wordsPerMinute(language)) * 60)
}

/** Episodes needed for this many key points (about 4-5 per 6-minute episode). */
export function episodeCountFor(keyPointCount: number): number {
  if (keyPointCount <= 0) return 0
  if (keyPointCount <= MAX_SINGLE_EPISODE_KEY_POINTS) return 1
  return Math.min(MAX_EPISODES, Math.ceil(keyPointCount / KEY_POINTS_PER_EPISODE))
}

/**
 * Splits key points (already in teaching order) into consecutive episodes of near-equal size,
 * moving each cut by at most one key point to land on a topic boundary. Every key point lands in
 * exactly one episode, order is kept, none is dropped.
 */
export function splitIntoEpisodes(keyPoints: Pick<KeyPoint, 'id' | 'topic'>[]): EpisodePlan[] {
  const total = keyPoints.length
  const episodes = episodeCountFor(total)
  if (episodes === 0) return []
  const cuts: number[] = []
  let previous = 0
  for (let k = 1; k < episodes; k += 1) {
    const ideal = Math.round((k * total) / episodes)
    const remaining = episodes - k
    const valid = (cut: number) => cut > previous && total - cut >= remaining
    const isBoundary = (cut: number) => keyPoints[cut - 1].topic !== keyPoints[cut].topic
    const candidates = [ideal, ideal - 1, ideal + 1].filter(valid)
    const cut = candidates.find(isBoundary) ?? candidates[0] ?? Math.max(previous + 1, ideal)
    cuts.push(cut)
    previous = cut
  }
  const bounds = [0, ...cuts, total]
  return bounds.slice(0, -1).map((start, index) => ({
    part: index + 1,
    keyPointIds: keyPoints.slice(start, bounds[index + 1]).map((point) => point.id),
  }))
}

export function scriptWordCount(sections: ScriptSection[], countWords: (text: string) => number): number {
  return sections.reduce((sum, section) => sum + section.lines.reduce((lineSum, line) => lineSum + countWords(line.text), 0), 0)
}

/** OpenAI models used by Audio Lesson (OpenAI only): the stronger one writes, the efficient one plans and checks. */
export const LESSON_MODELS = { writer: 'gpt-6-sol', helper: 'gpt-6-luna', checker: 'gpt-6-luna' } as const

/** USD per 1M tokens (OpenAI pricing page). Cache writes bill at 1.25x input, cache reads at the cached rate. */
const MODEL_PRICES: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-6-sol': { input: 2, cached: 0.2, output: 10 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
}

export interface TokenUsage {
  model: string
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  outputTokens: number
}

export function usageCostUsd(usage: TokenUsage): number {
  const price = MODEL_PRICES[usage.model] ?? MODEL_PRICES['gpt-6-sol']
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens - usage.cacheWriteTokens)
  return (uncached * price.input + usage.cacheWriteTokens * price.input * 1.25 + usage.cachedTokens * price.cached + usage.outputTokens * price.output) / 1_000_000
}

/** Rough pre-generation estimate for one episode script (write + one check + small rewrite). */
export function estimateEpisodeCostUsd(sourceChars: number): number {
  const sourceTokens = Math.min(sourceChars, 80_000) / 3.5
  const write = usageCostUsd({ model: LESSON_MODELS.writer, inputTokens: 4500 + sourceTokens, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 4500 })
  const check = usageCostUsd({ model: LESSON_MODELS.checker, inputTokens: 5000 + sourceTokens, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 2500 })
  return write + 2 * check
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isLessonStyle(value: unknown): value is LessonStyle {
  return typeof value === 'string' && (LESSON_STYLES as readonly string[]).includes(value)
}
export function isLessonLevel(value: unknown): value is LessonLevel {
  return typeof value === 'string' && (LESSON_LEVELS as readonly string[]).includes(value)
}
export function isLessonTone(value: unknown): value is LessonTone {
  return typeof value === 'string' && (LESSON_TONES as readonly string[]).includes(value)
}
export function isSectionRole(value: unknown): value is SectionRole {
  return typeof value === 'string' && (SECTION_ROLES as readonly string[]).includes(value)
}

export type LessonErrorCode =
  | 'bad_type'
  | 'too_large'
  | 'too_short'
  | 'too_long'
  | 'upstream'
  | 'parse'
  | 'model'
  | 'not_configured'
  | 'rate_limited'
  | 'locked'
  | 'timeout'
  | 'daily_cap'
  | 'budget'

export interface LessonPlanResponse {
  title: string
  keyPoints: KeyPoint[]
  episodes: EpisodePlan[]
  usage: LessonUsage
}

export interface LessonScriptResponse {
  episode: EpisodeScript
  usage: LessonUsage
}

export interface LessonCheckResponse {
  sections: ScriptSection[]
  check: EpisodeCheck
  usage: LessonUsage
}

/** "6:05" */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/** "$0.048" below a dollar (three decimals), "$1.20" above. */
export function formatUsd(value: number): string {
  return value < 1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`
}

/** Issue codes the server attaches to a flagged line: "speak:symbols", "speak:long", "calc:<detail>" or "<problem>:<reason>". */
export function parseLineIssue(issue: string): { kind: 'symbols' | 'long' | 'calc' | 'fact'; detail: string } {
  const [head, ...rest] = issue.split(':')
  const detail = rest.join(':').trim()
  if (head === 'speak') return { kind: detail === 'long' ? 'long' : 'symbols', detail: '' }
  if (head === 'calc') return { kind: 'calc', detail }
  return { kind: 'fact', detail }
}
