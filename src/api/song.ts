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
import { clearStoredOwnerAccessCode, getStoredOwnerAccessCode, setStoredOwnerAccessCode } from '../lib/ownerAccessCode'

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
    typeof value.maxSeconds === 'number' &&
    typeof value.requiresAccessCode === 'boolean'
  )
}

/** Cached across the whole session (module scope) — every quiz's result view would otherwise refetch
 * this on mount; the flag can't change without a redeploy, so one fetch per page load is enough. */
let statusPromise: Promise<SongStatusResponseBody> | null = null

const FALLBACK_STATUS: SongStatusResponseBody = { enabled: false, provider: 'demo', maxSeconds: 30, requiresAccessCode: false }

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
  /** The quiz's facts plan as statements, core first (extra material beyond the per-question facts). */
  factPlan?: string[]
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

function songRequestHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const code = getStoredOwnerAccessCode()
  if (code) headers['x-music-access'] = code
  return headers
}

async function postSongJson(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: songRequestHeaders(),
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
  // A malformed reply (or a gateway timeout page) gets one silent second try before an error shows.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const json = await postSongJson('/api/song-lyrics', payload, signal)
      if (!isSongLyricsResponseBody(json)) throw new SongApiError('parse')
      return json
    } catch (error) {
      if (attempt >= 1 || !(error instanceof SongApiError) || error.code !== 'parse') throw error
    }
  }
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

/** Tests a candidate production access code with a deliberately-invalid, zero-cost request (missing
 * lyrics short-circuits on the server before any LLM/Gemini call, right after the access-code check)
 * — true/false tells the caller whether the code was accepted; a true result also persists it. */
export async function verifyAndStoreMusicAccessCode(code: string): Promise<boolean> {
  try {
    const response = await fetch('/api/song', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-music-access': code },
      body: JSON.stringify({}),
    })
    if (response.status === 403) {
      const json: unknown = await response.json().catch(() => null)
      if (isRecord(json) && json.error === 'locked') {
        clearStoredOwnerAccessCode()
        return false
      }
    }
    setStoredOwnerAccessCode(code)
    return true
  } catch {
    return false
  }
}
