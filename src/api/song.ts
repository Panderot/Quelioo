import { isRecord, isSongCreateResponseBody, isSongErrorCode, isSongLyricsCheckResponseBody, isSongLyricsResponseBody } from '../lib/song'
import type {
  SongCreateResponseBody,
  SongErrorCode,
  SongLyricsCheckResponseBody,
  SongLyricsResponseBody,
  SongStatusResponseBody,
  SongStyle,
  SongTone,
} from '../lib/song'

export class SongApiError extends Error {
  code: SongErrorCode

  constructor(code: SongErrorCode) {
    super(code)
    this.code = code
  }
}

function isStatusBody(value: unknown): value is SongStatusResponseBody {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    (value.provider === 'demo' || value.provider === 'gemini') &&
    typeof value.maxSeconds === 'number'
  )
}

/** Cached across the whole session (module scope) — every quiz's result view would otherwise refetch
 * this on mount; the flag can't change without a redeploy, so one fetch per page load is enough. */
let statusPromise: Promise<SongStatusResponseBody> | null = null

const FALLBACK_STATUS: SongStatusResponseBody = { enabled: false, provider: 'demo', maxSeconds: 30 }

export function getSongStatus(): Promise<SongStatusResponseBody> {
  if (!statusPromise) {
    statusPromise = fetch('/api/song')
      .then((response) => response.json())
      .then((json: unknown) => (isStatusBody(json) ? json : FALLBACK_STATUS))
      .catch(() => FALLBACK_STATUS)
  }
  return statusPromise
}

export interface WriteSongLyricsPayload {
  mode?: 'write'
  quizTitle: string
  keyFacts: string[]
  sourceExcerpt: string
  style: SongStyle
  tone: SongTone
  language: string
}

export interface CheckSongLyricsPayload {
  mode: 'check'
  lyrics: string
  keyFacts: string[]
  sourceExcerpt: string
  language: string
}

export interface CreateSongPayload {
  lyrics: string
  musicPrompt: string
  style: SongStyle
  language: string
  targetSeconds: number
}

async function postSongJson(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new SongApiError('network')
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new SongApiError('parse')
  }

  if (isRecord(json) && 'error' in json) {
    throw new SongApiError(isSongErrorCode(json.error) ? json.error : 'upstream')
  }

  return json
}

export async function writeSongLyrics(payload: WriteSongLyricsPayload, signal?: AbortSignal): Promise<SongLyricsResponseBody> {
  const json = await postSongJson('/api/song-lyrics', payload, signal)
  if (!isSongLyricsResponseBody(json)) throw new SongApiError('parse')
  return json
}

/** Re-checks the student's current (possibly edited) lyrics without rewriting them — called right
 * before "Make the song"; the result is informational only, never blocking. */
export async function checkSongLyrics(payload: CheckSongLyricsPayload, signal?: AbortSignal): Promise<SongLyricsCheckResponseBody> {
  const json = await postSongJson('/api/song-lyrics', payload, signal)
  if (!isSongLyricsCheckResponseBody(json)) throw new SongApiError('parse')
  return json
}

export async function createSong(payload: CreateSongPayload, signal?: AbortSignal): Promise<SongCreateResponseBody> {
  const json = await postSongJson('/api/song', payload, signal)
  if (!isSongCreateResponseBody(json)) throw new SongApiError('parse')
  return json
}
