import { createHash, timingSafeEqual } from 'node:crypto'

import type { SongProvider } from '../../src/lib/song.js'

/** Shared provider/length resolution for both api/_lib/song-lyrics.ts and api/_lib/song.ts, so the
 * two endpoints always agree on which provider is active and how long a song it can produce. */

/** The longest song each provider can currently produce. Demo is pure synthesis so it can match any
 * supported length band; "gemini" tops out at lyria-3.5's documented range ("a couple of minutes"),
 * capped to our largest length band rather than guessed higher — see CLAUDE.md. */
const DEMO_MAX_SECONDS = 120
/** lyria-3-clip-preview: fixed 30-second clips only, per the live docs (Phase 2 research). */
const GEMINI_CLIP_MAX_SECONDS = 30
/** lyria-3.5: variable length, influenced via the prompt text — capped conservatively here. */
const GEMINI_LONG_MAX_SECONDS = 120

const DEFAULT_GEMINI_CLIP_MODEL = 'lyria-3-clip-preview'
const DEFAULT_GEMINI_LONG_MODEL = 'lyria-3.5'

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

/** The clip model only ever produces fixed 30s clips — anything longer needs the long-form model. */
export function resolveGeminiModel(targetSeconds: number): string {
  if (targetSeconds <= GEMINI_CLIP_MAX_SECONDS) {
    return process.env.GEMINI_MUSIC_MODEL ?? DEFAULT_GEMINI_CLIP_MODEL
  }
  return process.env.GEMINI_MUSIC_MODEL_LONG ?? DEFAULT_GEMINI_LONG_MODEL
}

/** True in production — /api/song-lyrics and /api/song then require a matching `x-music-access`
 * header (see verifyMusicAccessCode). Never gated outside production, so the existing local "song
 * test" workflow (CLAUDE.md) keeps working unchanged. */
export function isProductionAccessGateActive(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** The shared owner code for every paid owner-only feature (Songs, Audio Lesson): OWNER_ACCESS_CODE
 * when set, otherwise MUSIC_ACCESS_CODE, so the existing code keeps working unchanged. */
function ownerAccessCode(): string | undefined {
  return process.env.OWNER_ACCESS_CODE || process.env.MUSIC_ACCESS_CODE || undefined
}

/** Constant-time compare against the owner code (via equal-length SHA-256 digests, so comparing
 * values of different lengths doesn't short-circuit). Fails closed — with no code configured no
 * header value can ever pass, per CLAUDE.md. */
export function verifyOwnerAccessCode(provided: string | undefined | null): boolean {
  const expected = ownerAccessCode()
  if (!expected || !provided) return false
  return timingSafeEqual(digest(provided), digest(expected))
}

/** Songs keep their own name for the same shared owner gate. */
export const verifyMusicAccessCode = verifyOwnerAccessCode
