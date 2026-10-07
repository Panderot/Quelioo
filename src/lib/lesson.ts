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
  /** Facts of the shared plan merged into this key point (a list counts as one); 1 when unknown. */
  facts?: number
}

export interface EpisodePlan {
  part: number
  keyPointIds: string[]
}

/** How a line is delivered by the voice; the script writer tags every line, the speech call passes it on. */
export const DELIVERY_HINTS = ['question', 'warm', 'surprised', 'encouraging', 'slow', 'playful'] as const
export type DeliveryHint = (typeof DELIVERY_HINTS)[number]

export function isDeliveryHint(value: unknown): value is DeliveryHint {
  return typeof value === 'string' && (DELIVERY_HINTS as readonly string[]).includes(value)
}

/** A line that asks something always sounds like a question, whatever the writer tagged. */
export function effectiveDelivery(line: { text: string; delivery?: string }): DeliveryHint {
  if (/[?？]\s*$/.test(line.text)) return 'question'
  return isDeliveryHint(line.delivery) && line.delivery !== 'question' ? line.delivery : 'warm'
}

export interface ScriptLine {
  id: string
  speaker: string
  text: string
  /** Delivery hint for the voice (absent in older lessons: warm). */
  delivery?: DeliveryHint
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
/** A key point merges several facts; these caps are far above any merged key point so no fact is cut. */
export const MAX_MERGED_KEY_POINT_CHARS = 4000
export const MAX_MERGED_SOURCE_CHARS = 8000
export const MAX_LESSON_TITLE_CHARS = 120
/** A line longer than this can't be said in one breath. */
export const MAX_WORDS_PER_LINE = 32

/** The longest an episode gets (a long source becomes a series of these). */
export const MAX_EPISODE_SECONDS_TARGET = 360
/** The shortest lesson, however small the source. */
export const MIN_EPISODE_SECONDS_TARGET = 120
/** Lesson seconds: a base for the opening and closing plus this much per source word, so the lesson
 * length follows the source (45 words ~ 2.3 minutes, 100 words ~ 4.2, 155+ words the 6-minute maximum). */
const BASE_LESSON_SECONDS = 50
const SECONDS_PER_SOURCE_WORD = 2

/** Target length of one episode in seconds. A series (more than one part) always uses full episodes. */
export function episodeTargetSeconds(params: { sourceWords: number; episodes: number }): number {
  if (params.episodes > 1) return MAX_EPISODE_SECONDS_TARGET
  const raw = BASE_LESSON_SECONDS + params.sourceWords * SECONDS_PER_SOURCE_WORD
  return Math.round(Math.max(MIN_EPISODE_SECONDS_TARGET, Math.min(MAX_EPISODE_SECONDS_TARGET, raw)) / 10) * 10
}

/** Allowed band around the target: the estimate may be this far off before the script is tightened or expanded. */
export function episodeSecondsBand(target: number): { min: number; max: number } {
  const slack = Math.max(15, Math.round(target * 0.09))
  return { min: target - slack, max: target + slack }
}

/** A short lesson skips the "explain it simply" section: at that length it would only repeat the recap. */
export const MIN_SECONDS_FOR_FEYNMAN = 300

/** Measured timing of the lesson TTS voices (gpt-4o-mini-tts with the per-speaker style instruction and
 * the per-line delivery hint): seconds per spoken word plus the silence every line carries (the voice's
 * lead-in and tail), fitted on real recordings of 14 lines per language and on four whole lessons
 * (Turkish: 821 words, 9 pauses and about 75 lines ran 8:46; 253-263 words in 33-38 lines ran about 3:03).
 * Re-measure when TTS_MODEL changes. */
const SPEECH_TIMING: Record<string, { secondsPerWord: number; lineGap: number }> = {
  tr: { secondsPerWord: 0.52, lineGap: 0.95 },
  en: { secondsPerWord: 0.3, lineGap: 1.1 },
  hyw: { secondsPerWord: 0.5, lineGap: 1.15 },
}
const DEFAULT_TIMING = { secondsPerWord: 0.4, lineGap: 1 }
/** A typical line is this many words long (used to turn a time target into a word budget). */
const TYPICAL_WORDS_PER_LINE = 9

function timingFor(language: string) {
  return SPEECH_TIMING[language] ?? DEFAULT_TIMING
}

/** The concrete language of a lesson: 'auto' is decided from the source text (an unknown language
 * would otherwise fall back to the default speaking rate and misjudge the length by 40 percent). */
export function resolveLessonLanguage(language: string, sample: string): string {
  if (language !== 'auto') return language
  if (/[çğışöüÇĞİŞÖÜ]/.test(sample)) return 'tr'
  if (/[԰-֏]/.test(sample)) return 'hyw'
  return 'en'
}

/** Spoken words that fill `seconds` of speech (silences after pause lines already taken off). */
export function wordsForSeconds(language: string, seconds: number): number {
  const timing = timingFor(language)
  return Math.round(seconds / (timing.secondsPerWord + timing.lineGap / TYPICAL_WORDS_PER_LINE))
}

/** Silence the player leaves after a "pause" line (the listener thinks before the answer). */
export const PAUSE_SECONDS = 3

/** Length of an episode as heard: spoken words, the silence every line carries and the pauses after pause lines. */
export function episodeSeconds(sections: ScriptSection[], language: string, countWords: (text: string) => number): number {
  const lines = sections.flatMap((section) => section.lines)
  const words = lines.reduce((sum, line) => sum + countWords(line.text), 0)
  return secondsForWords(language, words, lines.length) + Math.round(lines.filter((line) => line.pause).length * PAUSE_SECONDS)
}

/** Seconds of speech for `words` words said in `lines` lines (default: typical lines), pauses not included. */
export function secondsForWords(language: string, words: number, lines = Math.max(1, Math.round(words / TYPICAL_WORDS_PER_LINE))): number {
  const timing = timingFor(language)
  return Math.round(words * timing.secondsPerWord + lines * timing.lineGap)
}

/** Episodes needed for this many key points (about 4-5 per 6-minute episode). */
export function episodeCountFor(keyPointCount: number): number {
  if (keyPointCount <= 0) return 0
  if (keyPointCount <= MAX_SINGLE_EPISODE_KEY_POINTS) return 1
  return Math.min(MAX_EPISODES, Math.ceil(keyPointCount / KEY_POINTS_PER_EPISODE))
}

/**
 * Splits key points (already in teaching order) into consecutive episodes that differ by at most one
 * key point; among those splits the one with the evenest fact counts (a key point may hold several
 * facts), and then the one that cuts at the most topic boundaries so related facts stay together.
 * Every key point lands in exactly one episode, order is kept, none is dropped.
 */
export function splitIntoEpisodes(keyPoints: Pick<KeyPoint, 'id' | 'topic' | 'facts'>[]): EpisodePlan[] {
  const total = keyPoints.length
  const episodes = episodeCountFor(total)
  if (episodes === 0) return []
  const prefix = [0]
  for (const point of keyPoints) prefix.push(prefix[prefix.length - 1] + Math.max(1, point.facts ?? 1))
  const allFacts = prefix[total]
  const smallest = Math.floor(total / episodes)
  const largest = Math.ceil(total / episodes)
  const boundary = (cut: number) => (keyPoints[cut - 1].topic.toLocaleLowerCase() !== keyPoints[cut].topic.toLocaleLowerCase() ? 1 : 0)

  // Most topic-boundary cuts with every episode holding lo..hi facts (-Infinity: impossible).
  const solve = (lo: number, hi: number) => {
    const best = Array.from({ length: episodes + 1 }, () => Array<number>(total + 1).fill(Number.NEGATIVE_INFINITY))
    const from = Array.from({ length: episodes + 1 }, () => Array<number>(total + 1).fill(-1))
    best[0][0] = 0
    for (let k = 1; k <= episodes; k += 1) {
      for (let i = k; i <= total; i += 1) {
        for (let j = k - 1; j < i; j += 1) {
          const facts = prefix[i] - prefix[j]
          if (best[k - 1][j] === Number.NEGATIVE_INFINITY || i - j < smallest || i - j > largest || facts < lo || facts > hi) continue
          const score = best[k - 1][j] + (k > 1 ? boundary(j) : 0)
          if (score > best[k][i]) {
            best[k][i] = score
            from[k][i] = j
          }
        }
      }
    }
    return { score: best[episodes][total], from }
  }

  const average = allFacts / episodes
  for (let spread = 0; spread <= allFacts; spread += 1) {
    let winner: ReturnType<typeof solve> | null = null
    for (let lo = Math.max(1, Math.floor(average) - spread); lo <= Math.ceil(average); lo += 1) {
      const attempt = solve(lo, lo + spread)
      if (attempt.score > (winner?.score ?? Number.NEGATIVE_INFINITY)) winner = attempt
    }
    if (!winner) continue
    const bounds = [total]
    for (let k = episodes, i = total; k > 0; k -= 1) {
      i = winner.from[k][i]
      bounds.unshift(i)
    }
    return bounds.slice(0, -1).map((start, index) => ({
      part: index + 1,
      keyPointIds: keyPoints.slice(start, bounds[index + 1]).map((point) => point.id),
    }))
  }
  return [{ part: 1, keyPointIds: keyPoints.map((point) => point.id) }]
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
  // OPENAI_MODEL default for quiz generation when it falls back to OpenAI.
  'gpt-5.6-luna': { input: 0.2, cached: 0.02, output: 1.2 },
  // Quiz generation's default Anthropic model (Anthropic pricing table).
  'claude-sonnet-5-5': { input: 2, cached: 0.2, output: 10 },
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
export function parseLineIssue(issue: string): { kind: 'symbols' | 'long' | 'calc' | 'repeat' | 'fact'; detail: string } {
  const [head, ...rest] = issue.split(':')
  const detail = rest.join(':').trim()
  if (head === 'speak') return { kind: detail === 'long' ? 'long' : 'symbols', detail: '' }
  if (head === 'calc') return { kind: 'calc', detail }
  if (head === 'repeat') return { kind: 'repeat', detail: '' }
  return { kind: 'fact', detail }
}
