/** Simple client-side cost guard until real usage limits exist (see CLAUDE.md task notes) — caps
 * song generations per quiz per browser per day. The server independently rejects when the feature
 * is disabled; this is just a courtesy limit, not a security boundary. */

const STORAGE_KEY = 'quelio.songGuard.v1'
export const MAX_SONG_GENERATIONS_PER_DAY = 3

interface GuardEntry {
  date: string
  count: number
}

type GuardMap = Record<string, GuardEntry>

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function readMap(): GuardMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as GuardMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: GuardMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable (private mode, quota exceeded, etc.) — fail silently, same as lib/archive.ts.
  }
}

export function canGenerateSong(quizId: string): boolean {
  const entry = readMap()[quizId]
  if (!entry || entry.date !== todayKey()) return true
  return entry.count < MAX_SONG_GENERATIONS_PER_DAY
}

export function recordSongGeneration(quizId: string): void {
  const map = readMap()
  const today = todayKey()
  const entry = map[quizId]
  map[quizId] = entry && entry.date === today ? { date: today, count: entry.count + 1 } : { date: today, count: 1 }
  writeMap(map)
}
