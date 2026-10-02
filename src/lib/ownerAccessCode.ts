/** Production-only shared owner access code for Songs and Audio Lesson (see CLAUDE.md /
 * api/_lib/song-config.ts); one stored code unlocks both. The key keeps its original name so codes
 * stored before the gate was shared keep working.
 * Stored in plain localStorage — it's a shared operator code, not a per-user secret, and the server
 * is the real gate (constant-time compare, fails closed when unset). */

const STORAGE_KEY = 'quelio.musicAccessCode.v1'

export function getStoredOwnerAccessCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredOwnerAccessCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // localStorage unavailable — the code simply won't persist across reloads.
  }
}

export function clearStoredOwnerAccessCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do — already effectively "forgotten" for this session.
  }
}
