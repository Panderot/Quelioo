import type { IncomingMessage, ServerResponse } from 'node:http'

import { readRequestBody } from './anthropic.js'
import { synthesizeDemoSong } from './song-demo-audio.js'
import { callGeminiMusic } from './gemini-music.js'
import {
  isRecord,
  isSongStyle,
  SONG_STYLE_ENGLISH_NAMES,
  MAX_LYRICS_CHARS,
  MAX_MUSIC_PROMPT_CHARS,
  SONG_DURATION_SECONDS,
} from '../../src/lib/song.js'
import type { SongApiErrorBody, SongCreateResponseBody, SongErrorCode, SongProvider, SongStatusResponseBody, SongStyle } from '../../src/lib/song.js'

export type SongCreateResponseBodyOrError = SongCreateResponseBody | SongApiErrorBody

const MAX_REQUEST_BYTES = 16 * 1024
const DEFAULT_GEMINI_MODEL = 'lyria-3-clip-preview'

/** Explicit MUSIC_ENABLED always wins; unset defaults to on outside production (matches the LLM
 * provider-order default-by-environment pattern in api/_lib/llm.ts). */
function isMusicEnabled(): boolean {
  const flag = process.env.MUSIC_ENABLED
  if (flag === 'true') return true
  if (flag === 'false') return false
  return process.env.VERCEL_ENV !== 'production'
}

function resolveMusicProvider(): SongProvider {
  return process.env.MUSIC_PROVIDER === 'gemini' ? 'gemini' : 'demo'
}

function clampString(value: unknown, maxChars: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : ''
}

/** Fixed template the server controls end to end — the style name and the AI-written musicPrompt
 * are inserted as the song's creative brief, and the (possibly student-edited) lyrics are clearly
 * introduced as the lyrics to use, never concatenated in a way that could read as an instruction. */
function buildGeminiMusicInput(params: { style: SongStyle; musicPrompt: string; lyrics: string }): string {
  const styleName = SONG_STYLE_ENGLISH_NAMES[params.style]
  const brief = params.musicPrompt || `A ${styleName} song.`
  return [
    `Create a short ${styleName} song for a study/mnemonic app, about ${SONG_DURATION_SECONDS} seconds long.`,
    brief,
    '',
    'Use exactly these lyrics, with the section tags:',
    params.lyrics,
  ].join('\n')
}

function errorStatus(code: SongErrorCode): number {
  switch (code) {
    case 'not_configured':
      return 503
    case 'disabled':
      return 403
    case 'too_long':
      return 400
    case 'blocked':
      return 422
    case 'timeout':
      return 504
    case 'upstream':
      return 502
    default:
      return 400
  }
}

export function handleSongStatusRequest(): SongStatusResponseBody {
  return { enabled: isMusicEnabled(), provider: resolveMusicProvider() }
}

/** Pure request-handling core for POST, independent of the HTTP transport — mirrors handleGradeRequest. */
export async function handleSongCreateRequest(payload: unknown): Promise<{ status: number; body: SongCreateResponseBodyOrError }> {
  const start = Date.now()
  const fail = (error: SongErrorCode) => {
    console.log(`song: provider=none duration=${Date.now() - start}ms error=${error}`)
    return { status: errorStatus(error), body: { error } as SongApiErrorBody }
  }

  if (!isRecord(payload)) return fail('parse')

  const lyrics = typeof payload.lyrics === 'string' ? payload.lyrics.trim() : ''
  if (!lyrics) return fail('parse')
  if (lyrics.length > MAX_LYRICS_CHARS) return fail('too_long')

  const musicPrompt = clampString(payload.musicPrompt, MAX_MUSIC_PROMPT_CHARS)
  const style = isSongStyle(payload.style) ? payload.style : 'pop'

  if (!isMusicEnabled()) return fail('disabled')

  const provider = resolveMusicProvider()

  if (provider === 'demo') {
    // Never served in production, even if MUSIC_PROVIDER says demo — it's a placeholder only.
    if (process.env.VERCEL_ENV === 'production') return fail('not_configured')
    const demo = synthesizeDemoSong(style)
    console.log(`song: provider=demo duration=${Date.now() - start}ms error=none`)
    return {
      status: 200,
      body: { audio: demo.audioBase64, mimeType: demo.mimeType, lyrics, provider: 'demo', demo: true, durationSeconds: demo.durationSeconds },
    }
  }

  // provider === 'gemini'
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fail('not_configured')

  const model = process.env.GEMINI_MUSIC_MODEL ?? DEFAULT_GEMINI_MODEL
  const input = buildGeminiMusicInput({ style, musicPrompt, lyrics })

  let result: Awaited<ReturnType<typeof callGeminiMusic>>
  try {
    result = await callGeminiMusic({ apiKey, model, input })
  } catch (error) {
    console.error('song: gemini call failed', error instanceof Error ? error.message : 'unknown error')
    return fail('upstream')
  }

  if (result.timedOut) return fail('timeout')
  if (!result.ok || !result.audioBase64) return fail(result.blocked ? 'blocked' : 'upstream')

  console.log(`song: provider=gemini duration=${Date.now() - start}ms error=none`)
  return {
    status: 200,
    body: {
      audio: result.audioBase64,
      mimeType: result.mimeType ?? 'audio/mpeg',
      lyrics,
      provider: 'gemini',
      demo: false,
      durationSeconds: SONG_DURATION_SECONDS,
    },
  }
}

export async function songRequestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const respond = (status: number, body: SongStatusResponseBody | SongCreateResponseBodyOrError) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }

  if (req.method === 'GET') {
    respond(200, handleSongStatusRequest())
    return
  }

  if (req.method !== 'POST') {
    respond(405, { error: 'parse' })
    return
  }

  let rawBody: string
  try {
    rawBody = await readRequestBody(req, MAX_REQUEST_BYTES)
  } catch {
    respond(400, { error: 'too_long' })
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    respond(400, { error: 'parse' })
    return
  }

  const { status, body } = await handleSongCreateRequest(payload)
  respond(status, body)
}
