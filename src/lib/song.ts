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

export type SongProvider = 'demo' | 'gemini'

/** Shared across both endpoints — a lyrics-side failure and a music-side failure render through
 * the same localized error+retry UI in the song panel, so one code set covers both. */
export type SongErrorCode =
  | 'not_configured'
  | 'disabled'
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

export const MAX_LYRICS_CHARS = 700
export const MAX_LYRICS_LINES = 14
export const MAX_SONG_TITLE_CHARS = 80
export const MAX_MUSIC_PROMPT_CHARS = 300
export const MAX_KEY_FACTS_CHARS = 1500
export const MAX_SOURCE_EXCERPT_CHARS = 3000

/** The only length for now (Phase 1) — shown as static text in the UI, never a control. */
export const SONG_DURATION_SECONDS = 30

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface SongLyricsResponseBody {
  title: string
  lyrics: string
  musicPrompt: string
}

export interface SongApiErrorBody {
  error: SongErrorCode
}

export function isSongLyricsResponseBody(value: unknown): value is SongLyricsResponseBody {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.lyrics === 'string' &&
    value.lyrics.trim().length > 0 &&
    typeof value.musicPrompt === 'string'
  )
}

export interface SongStatusResponseBody {
  enabled: boolean
  provider: SongProvider
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
