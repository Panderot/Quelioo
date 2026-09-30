import type { GeneratedQuiz } from './quiz'

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
  outputLanguage?: string
  sourceText?: string
  quiz: GeneratedQuiz
}

const STORAGE_KEY = 'quelio.archive.v1'

function hasValidQuestions(entry: unknown): entry is ArchiveEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const quiz = (entry as { quiz?: unknown }).quiz
  return (
    typeof quiz === 'object' &&
    quiz !== null &&
    Array.isArray((quiz as { questions?: unknown }).questions) &&
    (quiz as { questions: unknown[] }).questions.length > 0
  )
}

function readEntries(): ArchiveEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(hasValidQuestions)
    if (valid.length !== parsed.length) writeEntries(valid) // migrate once: drop entries with no valid questions array
    return valid
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

export function getArchiveEntry(id: string): ArchiveEntry | undefined {
  return readEntries().find((entry) => entry.id === id)
}

export function addArchiveEntry(entry: ArchiveEntry): void {
  const entries = readEntries()
  entries.push(entry)
  writeEntries(entries)
}

export function updateArchiveEntry(id: string, updater: (entry: ArchiveEntry) => ArchiveEntry): ArchiveEntry | undefined {
  const entries = readEntries()
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return undefined
  const updated = updater(entries[index])
  entries[index] = updated
  writeEntries(entries)
  return updated
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
