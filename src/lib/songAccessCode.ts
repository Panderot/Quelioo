/** Production-only owner access code for making songs (see CLAUDE.md / api/_lib/song-config.ts).
 * Stored in plain localStorage — it's a shared operator code, not a per-user secret, and the server
 * is the real gate (constant-time compare, fails closed when unset). */

const STORAGE_KEY = 'quelio.musicAccessCode.v1'

export function getStoredMusicAccessCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredMusicAccessCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // localStorage unavailable — the code simply won't persist across reloads.
  }
}

export function clearStoredMusicAccessCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do — already effectively "forgotten" for this session.
  }
}
