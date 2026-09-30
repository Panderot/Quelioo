/** Raw REST adapter for the Gemini API's music-generation "Interactions" endpoint (Lyria 3 family).
 * Built from the live docs at https://ai.google.dev/gemini-api/docs/music-generation (fetched and
 * read directly, not from memory) — see CLAUDE.md. Phase 2: shipped but not called anywhere yet;
 * api/_lib/song.ts only reaches this when MUSIC_PROVIDER=gemini, which nothing sets in this run. */

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const GEMINI_TIMEOUT_MS = 50000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface GeminiMusicParams {
  apiKey: string
  model: string
  /** The full prompt text, including any `[Verse]`/`[Chorus]` tagged lyrics — Lyria takes one plain
   * text "input", there is no separate structured lyrics field. */
  input: string
}

export interface GeminiMusicResult {
  ok: boolean
  audioBase64: string | null
  /** Lyria's documented default output; WAV output requires a `response_format` field whose exact
   * shape isn't confirmed from the fetched docs, so it's intentionally not requested (see below). */
  mimeType: string | null
  status: number | null
  blocked: boolean
  timedOut: boolean
}

interface GeminiContentBlock {
  type?: string
  data?: string
  text?: string
}

interface GeminiStep {
  type?: string
  content?: GeminiContentBlock[]
}

/** The docs' "Limitations" section states prompts that trigger Gemini's safety filters (including
 * requests for specific artist voices or copyrighted lyrics) are blocked — surfaced as an API error.
 * There's no single documented error code for this, so the failure is classified heuristically from
 * the error body's own text. */
function isSafetyBlock(payload: unknown): boolean {
  if (!isRecord(payload) || !isRecord(payload.error)) return false
  const message = typeof payload.error.message === 'string' ? payload.error.message.toLowerCase() : ''
  const status = typeof payload.error.status === 'string' ? payload.error.status.toLowerCase() : ''
  return message.includes('safety') || message.includes('blocked') || message.includes('polic') || status.includes('blocked')
}

/** Walks every `model_output` step's content blocks and keeps the LAST audio block — matches the
 * SDK's own `interaction.output_audio` convenience property ("returns the last generated audio
 * block"), per the docs' "Parse the response" section. */
function extractAudio(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.steps)) return null
  let last: string | null = null
  for (const step of payload.steps as GeminiStep[]) {
    if (!isRecord(step) || step.type !== 'model_output' || !Array.isArray(step.content)) continue
    for (const block of step.content) {
      if (isRecord(block) && block.type === 'audio' && typeof block.data === 'string' && block.data) {
        last = block.data
      }
    }
  }
  return last
}

export async function callGeminiMusic(params: GeminiMusicParams): Promise<GeminiMusicResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': params.apiKey },
      body: JSON.stringify({ model: params.model, input: params.input, response_format: { type: 'audio' } }),
      signal: controller.signal,
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return { ok: false, audioBase64: null, mimeType: null, status: null, blocked: false, timedOut }
  } finally {
    clearTimeout(timeout)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, audioBase64: null, mimeType: null, status: response.status, blocked: false, timedOut: false }
  }

  if (!response.ok) {
    return { ok: false, audioBase64: null, mimeType: null, status: response.status, blocked: isSafetyBlock(payload), timedOut: false }
  }

  const audio = extractAudio(payload)
  if (!audio) {
    return { ok: false, audioBase64: null, mimeType: null, status: response.status, blocked: false, timedOut: false }
  }

  return { ok: true, audioBase64: audio, mimeType: 'audio/mpeg', status: response.status, blocked: false, timedOut: false }
}
