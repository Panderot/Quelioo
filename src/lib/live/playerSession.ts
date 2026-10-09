/** The student's seat in a game, kept on their phone so a reload or a dropped connection returns to the same player
 * (same nickname, same score). Only a code, a nickname and the player token: nothing about the person. */

const KEY = 'quelio.live.player.v1'
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export interface PlayerSession {
  code: string
  token: string
  nickname: string
  at: number
}

export function loadPlayerSession(): PlayerSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlayerSession>
    if (typeof parsed.code !== 'string' || typeof parsed.token !== 'string' || typeof parsed.nickname !== 'string' || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      clearPlayerSession()
      return null
    }
    return { code: parsed.code, token: parsed.token, nickname: parsed.nickname, at: parsed.at }
  } catch {
    return null
  }
}

export function savePlayerSession(session: Omit<PlayerSession, 'at'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...session, at: Date.now() }))
  } catch {
    // Storage unavailable (private mode): the student can still play, they just cannot come back after a reload.
  }
}

export function clearPlayerSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
