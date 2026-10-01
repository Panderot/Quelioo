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
])

export function isSongErrorCode(value: unknown): value is SongErrorCode {
  return typeof value === 'string' && SONG_ERROR_CODES.has(value)
}

/** Lyrics line/char budget for the 30-second baseline band — scaled up for longer targets by
 * lyricsLimitsForTargetSeconds(). */
export const MAX_LYRICS_CHARS = 700
export const MAX_LYRICS_LINES = 14
export const MAX_SONG_TITLE_CHARS = 80
export const MAX_MUSIC_PROMPT_CHARS = 300
export const MAX_KEY_FACT_CHARS = 200
export const MAX_KEY_FACTS = 40
export const MAX_SOURCE_EXCERPT_CHARS = 3000

export interface LengthBand {
  /** This band applies to quizzes with up to this many key facts (one per question). */
  maxFacts: number
  targetSeconds: number
}

/** Target song length scales with how much the song needs to teach — see
 * quelio-song-quality-prompt.txt §4. Also used in reverse (maxFactsForTargetSeconds) to decide how
 * many facts fit when a provider's maxSeconds is below the quiz's natural target. */
export const LENGTH_BANDS: LengthBand[] = [
  { maxFacts: 5, targetSeconds: 30 },
  { maxFacts: 10, targetSeconds: 60 },
  { maxFacts: 15, targetSeconds: 90 },
  { maxFacts: Infinity, targetSeconds: 120 },
]

export function targetSecondsForFactCount(factCount: number): number {
  const band = LENGTH_BANDS.find((entry) => factCount <= entry.maxFacts)
  return (band ?? LENGTH_BANDS[LENGTH_BANDS.length - 1]).targetSeconds
}

export function maxFactsForTargetSeconds(targetSeconds: number): number {
  const band = LENGTH_BANDS.find((entry) => entry.targetSeconds === targetSeconds)
  return band ? band.maxFacts : Infinity
}

const BASE_TARGET_SECONDS = 30

/** Lyrics line/char budget scales linearly with the target length relative to the 30s baseline
 * (MAX_LYRICS_LINES/MAX_LYRICS_CHARS). */
export function lyricsLimitsForTargetSeconds(targetSeconds: number): { maxLines: number; maxChars: number } {
  const scale = targetSeconds / BASE_TARGET_SECONDS
  return { maxLines: Math.round(MAX_LYRICS_LINES * scale), maxChars: Math.round(MAX_LYRICS_CHARS * scale) }
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
}

/** Response for `mode: "check"` — re-checks lyrics the student edited, without rewriting them. */
export interface SongLyricsCheckResponseBody {
  factCheckPassed: boolean
  flaggedLines: number[]
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
