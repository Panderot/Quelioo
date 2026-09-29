export interface ArchiveEntry {
  id: string
  title: string
  createdAt: string
  source: 'text' | 'file' | 'url'
  questionType: string
  difficulty: string
  questionCount: string
  optionsCount: string | null
  studyMode: boolean
}

const STORAGE_KEY = 'quelio.archive.v1'

function readEntries(): ArchiveEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ArchiveEntry[]) : []
  } catch {
    return []
  }
}

function writeEntries(entries: ArchiveEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage unavailable (private mode, quota exceeded, etc.) — fail silently.
  }
}

export function getArchiveEntries(): ArchiveEntry[] {
  return readEntries().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function addArchiveEntry(entry: ArchiveEntry): void {
  const entries = readEntries()
  entries.push(entry)
  writeEntries(entries)
}

export function setArchiveEntryStudyMode(id: string, studyMode: boolean): void {
  const entries = readEntries()
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return
  entries[index] = { ...entries[index], studyMode }
  writeEntries(entries)
}

export function createArchiveEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
