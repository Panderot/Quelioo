import type { IncomingMessage, ServerResponse } from 'node:http'

import { mp3DurationSeconds } from '../../src/lib/mp3.js'
import { readRequestBody } from './anthropic.js'
import { synthesizeDemoSong } from './song-demo-audio.js'
import { callGeminiMusic } from './gemini-music.js'
import {
  isMusicEnabled,
  isProductionAccessGateActive,
  resolveGeminiModel,
  resolveMusicProvider,
  resolveProviderMaxSeconds,
  verifyOwnerAccessCode,
} from './song-config.js'
import { canRecordSongForIp, recordSongForIp, requestIp } from './song-rate-limit.js'
import {
  isRecord,
  isSongStyle,
  SONG_STYLE_ENGLISH_NAMES,
  MAX_MUSIC_PROMPT_CHARS,
  lyricsLimitsForTargetSeconds,
  targetSecondsForFactCount,
} from '../../src/lib/song.js'
import type { SongApiErrorBody, SongCreateResponseBody, SongErrorCode, SongStatusResponseBody, SongStyle } from '../../src/lib/song.js'

export type SongCreateResponseBodyOrError = SongCreateResponseBody | SongApiErrorBody

const MAX_REQUEST_BYTES = 16 * 1024
/** Falls back to the shortest band when the client doesn't send a targetSeconds (older clients, or
 * tests posting directly) — never longer than what was actually requested. */
const DEFAULT_TARGET_SECONDS = targetSecondsForFactCount(1)

function clampString(value: unknown, maxChars: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : ''
}

/** Fixed template the server controls end to end — the style name and the AI-written musicPrompt
 * are inserted as the song's creative brief, and the (possibly student-edited) lyrics are clearly
 * introduced as the lyrics to use, never concatenated in a way that could read as an instruction. */
function buildGeminiMusicInput(params: { style: SongStyle; musicPrompt: string; lyrics: string; targetSeconds: number }): string {
  const styleName = SONG_STYLE_ENGLISH_NAMES[params.style]
  const brief = params.musicPrompt || `A ${styleName} song.`
  return [
    `Create a short ${styleName} song for a study/mnemonic app, about ${params.targetSeconds} seconds long.`,
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
    case 'locked':
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

function handleSongStatusRequest(): SongStatusResponseBody {
  const provider = resolveMusicProvider()
  return { enabled: isMusicEnabled(), provider, maxSeconds: resolveProviderMaxSeconds(provider), requiresAccessCode: isProductionAccessGateActive() }
}

export interface SongRequestContext {
  accessCodeHeader?: string
  ip: string
}

/** Pure request-handling core for POST, independent of the HTTP transport — mirrors handleGradeRequest. */
export async function handleSongCreateRequest(
  payload: unknown,
  context: SongRequestContext,
): Promise<{ status: number; body: SongCreateResponseBodyOrError }> {
  const start = Date.now()
  const fail = (error: SongErrorCode) => {
    console.log(`song: provider=none duration=${Date.now() - start}ms error=${error}`)
    return { status: errorStatus(error), body: { error } as SongApiErrorBody }
  }

  // Checked first, before any other validation, so the client's "Unlock" flow (a deliberately
  // minimal/invalid body + a candidate code) can tell a wrong code apart from any other failure
  // without ever reaching the paid Gemini call.
  if (isProductionAccessGateActive() && !verifyOwnerAccessCode(context.accessCodeHeader)) return fail('locked')

  if (!isRecord(payload)) return fail('parse')

  const lyrics = typeof payload.lyrics === 'string' ? payload.lyrics.trim() : ''
  if (!lyrics) return fail('parse')

  if (!isMusicEnabled()) return fail('disabled')

  const provider = resolveMusicProvider()
  const providerMaxSeconds = resolveProviderMaxSeconds(provider)
  const requestedTarget = typeof payload.targetSeconds === 'number' && Number.isFinite(payload.targetSeconds) ? payload.targetSeconds : DEFAULT_TARGET_SECONDS
  const targetSeconds = Math.min(Math.max(requestedTarget, 1), providerMaxSeconds)

  if (lyrics.length > lyricsLimitsForTargetSeconds(targetSeconds).maxChars) return fail('too_long')

  // Per-IP backstop on top of the client's own daily guards (lib/songCostGuard.ts) — see
  // song-rate-limit.ts for why this is best-effort, not a strict distributed limiter.
  if (!canRecordSongForIp(context.ip, targetSeconds)) {
    console.log(`song: provider=none duration=${Date.now() - start}ms error=rate_limited ip=${context.ip}`)
    return { status: 429, body: { error: 'disabled' } }
  }

  const musicPrompt = clampString(payload.musicPrompt, MAX_MUSIC_PROMPT_CHARS)
  const style = isSongStyle(payload.style) ? payload.style : 'pop'

  if (provider === 'demo') {
    // Never served in production, even if MUSIC_PROVIDER says demo — it's a placeholder only.
    if (process.env.VERCEL_ENV === 'production') return fail('not_configured')
    const demo = synthesizeDemoSong(style, targetSeconds)
    console.log(`song: provider=demo duration=${Date.now() - start}ms error=none`)
    recordSongForIp(context.ip, demo.durationSeconds)
    return {
      status: 200,
      body: { audio: demo.audioBase64, mimeType: demo.mimeType, lyrics, provider: 'demo', demo: true, durationSeconds: demo.durationSeconds },
    }
  }

  // provider === 'gemini' — in production this point is only reachable with a verified access code
  // (checked above); see CLAUDE.md.
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fail('not_configured')

  const model = resolveGeminiModel(targetSeconds)
  const input = buildGeminiMusicInput({ style, musicPrompt, lyrics, targetSeconds })

  let result: Awaited<ReturnType<typeof callGeminiMusic>>
  try {
    result = await callGeminiMusic({ apiKey, model, input })
  } catch (error) {
    console.error('song: gemini call failed', error instanceof Error ? error.message : 'unknown error')
    return fail('upstream')
  }

  if (result.timedOut) return fail('timeout')
  if (!result.ok || !result.audioBase64) {
    console.log(`song: provider=gemini model=${model} geminiStatus=${result.status ?? 'none'} blocked=${result.blocked}`)
    // A rejected key is a setup problem, not a transient upstream hiccup.
    return fail(result.blocked ? 'blocked' : result.status === 401 || result.status === 403 ? 'not_configured' : 'upstream')
  }

  console.log(`song: provider=gemini model=${model} duration=${Date.now() - start}ms error=none`)
  // The real length of the generated file, never the requested one (the model can overshoot it).
  const measured = Math.round(mp3DurationSeconds(Buffer.from(result.audioBase64, 'base64')))
  const durationSeconds = measured > 0 ? measured : targetSeconds
  recordSongForIp(context.ip, durationSeconds)
  return {
    status: 200,
    body: {
      audio: result.audioBase64,
      mimeType: result.mimeType ?? 'audio/mpeg',
      lyrics,
      provider: 'gemini',
      demo: false,
      durationSeconds,
    },
  }
}

export async function songRequestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const respond = (status: number, body: unknown) => {
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

  const accessHeader = req.headers['x-music-access']
  const context = { accessCodeHeader: Array.isArray(accessHeader) ? accessHeader[0] : accessHeader, ip: requestIp(req) }
  const { status, body } = await handleSongCreateRequest(payload, context)
  respond(status, body)
}
