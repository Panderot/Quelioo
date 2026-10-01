import type { SongProvider } from '../../src/lib/song.js'

/** Shared provider/length resolution for both api/_lib/song-lyrics.ts and api/_lib/song.ts, so the
 * two endpoints always agree on which provider is active and how long a song it can produce. */

/** The longest song each provider can currently produce. Demo is pure synthesis so it can match any
 * supported length band; "gemini" tops out at lyria-3.5's documented range ("a couple of minutes"),
 * capped to our largest length band rather than guessed higher — see CLAUDE.md. */
export const DEMO_MAX_SECONDS = 120
/** lyria-3-clip-preview: fixed 30-second clips only, per the live docs (Phase 2 research). */
export const GEMINI_CLIP_MAX_SECONDS = 30
/** lyria-3.5: variable length, influenced via the prompt text — capped conservatively here. */
export const GEMINI_LONG_MAX_SECONDS = 120

export const DEFAULT_GEMINI_CLIP_MODEL = 'lyria-3-clip-preview'
export const DEFAULT_GEMINI_LONG_MODEL = 'lyria-3.5'

/** Explicit MUSIC_ENABLED always wins; unset defaults to on outside production (matches the LLM
 * provider-order default-by-environment pattern in api/_lib/llm.ts). */
export function isMusicEnabled(): boolean {
  const flag = process.env.MUSIC_ENABLED
  if (flag === 'true') return true
  if (flag === 'false') return false
  return process.env.VERCEL_ENV !== 'production'
}

export function resolveMusicProvider(): SongProvider {
  return process.env.MUSIC_PROVIDER === 'gemini' ? 'gemini' : 'demo'
}

export function resolveProviderMaxSeconds(provider: SongProvider): number {
  return provider === 'gemini' ? GEMINI_LONG_MAX_SECONDS : DEMO_MAX_SECONDS
}

/** The clip model only ever produces fixed 30s clips — anything longer needs the long-form model.
 * Gemini is local-test only (see CLAUDE.md): never selected in production, since api/_lib/song.ts
 * refuses the "gemini" provider path there independently of this helper. */
export function resolveGeminiModel(targetSeconds: number): string {
  if (targetSeconds <= GEMINI_CLIP_MAX_SECONDS) {
    return process.env.GEMINI_MUSIC_MODEL ?? DEFAULT_GEMINI_CLIP_MODEL
  }
  return process.env.GEMINI_MUSIC_MODEL_LONG ?? DEFAULT_GEMINI_LONG_MODEL
}
