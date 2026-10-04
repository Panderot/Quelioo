/** Shared types for the "Turn into a song" feature (api/song-lyrics.ts, api/song.ts) — imported by
 * both the server handlers and the client callers, same pattern as lib/grading.ts for grade. */

export type SongStyle = 'pop' | 'rap' | 'kids' | 'rock' | 'acoustic' | 'lofi'
export const SONG_STYLES: SongStyle[] = ['pop', 'rap', 'kids', 'rock', 'acoustic', 'lofi']

const SONG_STYLE_SET: ReadonlySet<string> = new Set(SONG_STYLES)

export function isSongStyle(value: unknown): value is SongStyle {
  return typeof value === 'string' && SONG_STYLE_SET.has(value)
}

/** English description of each style — used inside prompts sent to the AI (lyrics writer and,
 * later, the music model); never shown to the user (the UI shows the localized chip label). */
export const SONG_STYLE_ENGLISH_NAMES: Record<SongStyle, string> = {
  pop: 'pop',
  rap: 'rap',
  kids: 'kids song',
  rock: 'rock',
  acoustic: 'acoustic',
  lofi: 'lo-fi',
}

export type SongTone = 'normal' | 'funny'
export const SONG_TONES: SongTone[] = ['normal', 'funny']

const SONG_TONE_SET: ReadonlySet<string> = new Set(SONG_TONES)

export function isSongTone(value: unknown): value is SongTone {
  return typeof value === 'string' && SONG_TONE_SET.has(value)
}

export type SongProvider = 'demo' | 'gemini'

/** Shared across both endpoints — a lyrics-side failure and a music-side failure render through
 * the same localized error+retry UI in the song panel, so one code set covers both. */
export type SongErrorCode =
  | 'not_configured'
  | 'disabled'
  | 'locked'
  | 'too_long'
  | 'blocked'
  | 'upstream'
  | 'timeout'
  | 'parse'
  | 'network'
  | 'storage_full'
  | 'no_facts'
  | 'rate_limited'
  | 'busy'

const SONG_ERROR_CODES: ReadonlySet<string> = new Set<SongErrorCode>([
  'not_configured',
  'disabled',
  'locked',
  'too_long',
  'blocked',
  'upstream',
  'timeout',
  'parse',
  'network',
  'storage_full',
  'no_facts',
  'rate_limited',
  'busy',
])

export function isSongErrorCode(value: unknown): value is SongErrorCode {
  return typeof value === 'string' && SONG_ERROR_CODES.has(value)
}

export const MAX_SONG_TITLE_CHARS = 80
export const MAX_MUSIC_PROMPT_CHARS = 300
export const MAX_KEY_FACT_CHARS = 200
export const MAX_KEY_FACTS = 40
export const MAX_SOURCE_EXCERPT_CHARS = 3000

export interface LengthBand {
  /** This band applies to quizzes with up to this many key facts (one per question). */
  maxFacts: number
  targetSeconds: number
  /** What can actually be sung in this length: a measured real 30 s clip sang only about 6 lines
   * (a short verse and a chorus), so the budget follows the sung lines, not a character count.
   * Section tag lines and line breaks count toward both limits. */
  maxLines: number
  maxChars: number
}

/** The song length follows the content: the shortest band whose line budget fits every key fact
 * (each fact needs about one line, plus a chorus). A 30 s clip only when everything fits in it;
 * longer bands use the long model. More facts than the longest band holds are split into a series. */
const LENGTH_BANDS: LengthBand[] = [
  { maxFacts: 4, targetSeconds: 30, maxLines: 8, maxChars: 260 },
  { maxFacts: 9, targetSeconds: 60, maxLines: 18, maxChars: 600 },
  { maxFacts: 13, targetSeconds: 90, maxLines: 24, maxChars: 800 },
  { maxFacts: 18, targetSeconds: 120, maxLines: 30, maxChars: 1000 },
]

/** Most facts one song can teach (the longest band). */
export const MAX_FACTS_PER_SONG = LENGTH_BANDS[LENGTH_BANDS.length - 1].maxFacts

export function targetSecondsForFactCount(factCount: number): number {
  const band = LENGTH_BANDS.find((entry) => factCount <= entry.maxFacts)
  return (band ?? LENGTH_BANDS[LENGTH_BANDS.length - 1]).targetSeconds
}

export function maxFactsForTargetSeconds(targetSeconds: number): number {
  const band = LENGTH_BANDS.find((entry) => entry.targetSeconds === targetSeconds)
  return band ? band.maxFacts : MAX_FACTS_PER_SONG
}

/** The sung-line and character budget for a song length. */
export function lyricsLimitsForTargetSeconds(targetSeconds: number): { maxLines: number; maxChars: number } {
  const band = LENGTH_BANDS.find((entry) => entry.targetSeconds === targetSeconds) ?? LENGTH_BANDS[LENGTH_BANDS.length - 1]
  return { maxLines: band.maxLines, maxChars: band.maxChars }
}

/** How a quiz's facts are split into songs: as few as possible, evenly filled, each within one
 * song's capacity. One entry per song, the number of facts it teaches. */
export function splitFactsIntoSongs(factCount: number): number[] {
  if (factCount <= 0) return []
  const songs = Math.ceil(factCount / MAX_FACTS_PER_SONG)
  const base = Math.floor(factCount / songs)
  const extra = factCount % songs
  return Array.from({ length: songs }, (_, index) => base + (index < extra ? 1 : 0))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface SongLyricsResponseBody {
  title: string
  lyrics: string
  musicPrompt: string
  /** Effective length this song was written for (already clamped to the active provider's
   * maxSeconds — see maxFactsForTargetSeconds). */
  targetSeconds: number
  /** The lyrics char budget that applied for this targetSeconds — drives the editor's counter. */
  maxLyricsChars: number
  /** How many of the quiz's key facts actually made it into the lyrics (equals totalFactsCount
   * unless the provider's maxSeconds forced a shorter song). */
  includedFactsCount: number
  totalFactsCount: number
  /** False when the fact-check pass still had unresolved problem lines after its rewrite rounds —
   * the lyrics shown are still the best version produced, just flagged for a human look. */
  factCheckPassed: boolean
  /** 0-based line indexes (within `lyrics`, split on "\n") that the fact checker flagged. */
  flaggedLines: number[]
  /** For each key fact in the song (same order), the 0-based line that states it, or -1 when no line does. */
  factLines?: number[]
}

/** Response for `mode: "check"` — re-checks lyrics the student edited, without rewriting them. */
export interface SongLyricsCheckResponseBody {
  factCheckPassed: boolean
  flaggedLines: number[]
  /** For each key fact (same order), the 0-based line that states it, or -1 (absent when unchecked). */
  factLines?: number[]
}

export interface SongApiErrorBody {
  error: SongErrorCode
}

function isFlaggedLines(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
}

export function isSongLyricsResponseBody(value: unknown): value is SongLyricsResponseBody {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.lyrics === 'string' &&
    value.lyrics.trim().length > 0 &&
    typeof value.musicPrompt === 'string' &&
    typeof value.targetSeconds === 'number' &&
    typeof value.maxLyricsChars === 'number' &&
    typeof value.includedFactsCount === 'number' &&
    typeof value.totalFactsCount === 'number' &&
    typeof value.factCheckPassed === 'boolean' &&
    isFlaggedLines(value.flaggedLines)
  )
}

export function isSongLyricsCheckResponseBody(value: unknown): value is SongLyricsCheckResponseBody {
  return isRecord(value) && typeof value.factCheckPassed === 'boolean' && isFlaggedLines(value.flaggedLines)
}

export interface SongStatusResponseBody {
  enabled: boolean
  provider: SongProvider
  /** The longest song this provider can currently produce — the panel clamps its length estimate
   * (and the lyrics-writing step clamps which facts it covers) to this. */
  maxSeconds: number
  /** True in production — /api/song-lyrics and /api/song then require a matching `x-music-access`
   * header (see api/_lib/song-config.ts). Always false outside production. */
  requiresAccessCode: boolean
}

export interface SongCreateResponseBody {
  /** Base64-encoded audio bytes (no data: URL prefix). */
  audio: string
  mimeType: string
  lyrics: string
  provider: SongProvider
  demo: boolean
  durationSeconds: number
}

export function isSongCreateResponseBody(value: unknown): value is SongCreateResponseBody {
  return (
    isRecord(value) &&
    typeof value.audio === 'string' &&
    value.audio.length > 0 &&
    typeof value.mimeType === 'string' &&
    typeof value.lyrics === 'string' &&
    (value.provider === 'demo' || value.provider === 'gemini') &&
    typeof value.demo === 'boolean' &&
    typeof value.durationSeconds === 'number'
  )
}

/** One quiz question and the lyric line that teaches it (null when no line does). */
export interface SongCoverageItem {
  question: string
  line: string | null
}
