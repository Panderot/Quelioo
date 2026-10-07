import { useSyncExternalStore } from 'react'

import { getAuthState } from './auth/authStore'
import { enqueueWrite } from './data/writeQueue'
import type { Json } from './database.types'
import { sourceTextHash } from './archiveSource'
import type { ArchiveEntry } from './archiveSource'
import type { GeneratedQuiz } from './quiz'
import { deepMathToPlain } from './mathPlain'
import { isFakeBackend, supabase } from './supabase'
import type { InsertRow, Row } from './supabase'

export { MAX_SOURCE_AVOID_STEMS, cachedPlanForSource, previousStemsForSource, sourceTextHash } from './archiveSource'
export type { ArchiveEntry } from './archiveSource'

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

/** Older quizzes may hold LaTeX code from before quizzes were plain text: show readable math. */
function withReadableMath(entry: ArchiveEntry): ArchiveEntry {
  return { ...entry, quiz: { ...entry.quiz, questions: deepMathToPlain(entry.quiz.questions) } }
}

// ---------------------------------------------------------------------------
// Browser-local copy: the original storage. It backs the UI-logic test build (fake backend) and is
// what the one-time import reads, so an old copy on this device is never lost.
// ---------------------------------------------------------------------------

function readLocalEntries(): ArchiveEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(hasValidQuestions)
    if (valid.length !== parsed.length && isFakeBackend) writeLocalEntries(valid) // migrate once: drop entries with no valid questions array
    return valid.map(withReadableMath)
  } catch {
    return []
  }
}

function writeLocalEntries(entries: ArchiveEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage unavailable (private mode, quota exceeded, etc.) — fail silently.
  }
}

/** Quizzes still stored in this browser (before the account existed), for the import. */
export function readLegacyArchive(): ArchiveEntry[] {
  return readLocalEntries()
}

export function clearLegacyArchive(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

// ---------------------------------------------------------------------------
// Account copy (Supabase `quizzes`): an in-memory cache the UI reads synchronously; writes update
// the cache first and go through the write queue.
// ---------------------------------------------------------------------------

type QuizRow = Row<'quizzes'>

export function archiveEntryToRow(entry: ArchiveEntry, userId: string): InsertRow<'quizzes'> {
  return {
    id: entry.id,
    user_id: userId,
    title: entry.title.slice(0, 300),
    source: entry.source,
    question_type: entry.questionType,
    difficulty: entry.difficulty,
    question_count: entry.questionCount,
    options_count: entry.optionsCount,
    output_language: entry.outputLanguage ?? null,
    source_text: entry.sourceText ?? null,
    source_hash: entry.sourceHash ?? (entry.sourceText ? sourceTextHash(entry.sourceText) : null),
    include_explanations: entry.includeExplanations ?? null,
    shuffle_options: entry.shuffleOptions ?? null,
    include_hints: entry.includeHints ?? null,
    focus_parts_count: entry.focusPartsCount ?? null,
    coverage_scope: entry.coverageScope ?? null,
    quiz: entry.quiz as unknown as Json,
    created_at: entry.createdAt,
  }
}

function rowToArchiveEntry(row: QuizRow): ArchiveEntry | null {
  const entry: ArchiveEntry = {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    source: row.source === 'file' || row.source === 'url' ? row.source : 'text',
    questionType: row.question_type,
    difficulty: row.difficulty,
    questionCount: row.question_count,
    optionsCount: row.options_count,
    quiz: row.quiz as unknown as GeneratedQuiz,
    ...(row.output_language !== null ? { outputLanguage: row.output_language } : {}),
    ...(row.source_text !== null ? { sourceText: row.source_text } : {}),
    ...(row.include_explanations !== null ? { includeExplanations: row.include_explanations } : {}),
    ...(row.shuffle_options !== null ? { shuffleOptions: row.shuffle_options } : {}),
    ...(row.include_hints !== null ? { includeHints: row.include_hints } : {}),
    ...(row.focus_parts_count !== null ? { focusPartsCount: row.focus_parts_count } : {}),
    ...(row.source_hash !== null ? { sourceHash: row.source_hash } : {}),
    ...(row.coverage_scope === 'part' ? { coverageScope: 'part' as const } : {}),
  }
  return hasValidQuestions(entry) ? withReadableMath(entry) : null
}

export interface ArchiveSnapshot {
  entries: ArchiveEntry[]
  loaded: boolean
  failed: boolean
}

let snapshot: ArchiveSnapshot = { entries: [], loaded: isFakeBackend, failed: false }
let loadPromise: Promise<void> | null = null
const listeners = new Set<() => void>()

function setSnapshot(patch: Partial<ArchiveSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((listener) => listener())
}

const newestFirst = (entries: ArchiveEntry[]) => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

/** Loads the signed-in user's quizzes (once; `force` reloads, e.g. after returning to the tab). */
export function loadArchive(force = false): Promise<void> {
  if (isFakeBackend) return Promise.resolve()
  if (loadPromise && !force) return loadPromise
  const userId = getAuthState().user?.id
  if (!userId) return Promise.resolve()
  const run = (async () => {
    const rows: QuizRow[] = []
    for (let from = 0; ; from += 200) {
      const { data, error } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false }).range(from, from + 199)
      if (error) {
        if (getAuthState().user?.id === userId) setSnapshot({ failed: true })
        loadPromise = null
        return
      }
      rows.push(...data)
      if (data.length < 200) break
    }
    if (getAuthState().user?.id !== userId) return
    // Entries created while loading (not saved yet) stay in front of the server copy.
    const loaded = rows.map(rowToArchiveEntry).filter((entry): entry is ArchiveEntry => entry !== null)
    const known = new Set(loaded.map((entry) => entry.id))
    setSnapshot({ entries: newestFirst([...loaded, ...snapshot.entries.filter((entry) => !known.has(entry.id))]), loaded: true, failed: false })
  })()
  loadPromise = run
  return run
}

/** Forgets the account copy (sign-out, other account). */
export function resetArchiveCache(): void {
  loadPromise = null
  setSnapshot({ entries: [], loaded: isFakeBackend, failed: false })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Quizzes for lists and pickers, with a loading flag and a retry for a failed load. */
export function useArchive(): ArchiveSnapshot & { reload: () => void } {
  const current = useSyncExternalStore(subscribe, () => snapshot)
  if (isFakeBackend) return { entries: getArchiveEntries(), loaded: true, failed: false, reload: () => undefined }
  return { ...current, reload: () => void loadArchive(true) }
}

export function getArchiveEntries(): ArchiveEntry[] {
  return isFakeBackend ? readLocalEntries().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : snapshot.entries
}

export function getArchiveEntry(id: string): ArchiveEntry | undefined {
  return isFakeBackend ? readLocalEntries().find((entry) => entry.id === id) : snapshot.entries.find((entry) => entry.id === id)
}

function enqueueEntry(entry: ArchiveEntry) {
  const userId = getAuthState().user?.id
  if (userId) enqueueWrite({ kind: 'upsert', table: 'quizzes', rows: [archiveEntryToRow(entry, userId)], onConflict: 'id' })
}

export function addArchiveEntry(entry: ArchiveEntry): void {
  if (isFakeBackend) {
    const entries = readLocalEntries()
    entries.push(entry)
    writeLocalEntries(entries)
    return
  }
  setSnapshot({ entries: newestFirst([...snapshot.entries.filter((existing) => existing.id !== entry.id), entry]) })
  enqueueEntry(entry)
}

export function updateArchiveEntry(id: string, updater: (entry: ArchiveEntry) => ArchiveEntry): ArchiveEntry | undefined {
  if (isFakeBackend) {
    const entries = readLocalEntries()
    const index = entries.findIndex((entry) => entry.id === id)
    if (index === -1) return undefined
    const updated = updater(entries[index])
    entries[index] = updated
    writeLocalEntries(entries)
    return updated
  }
  const current = snapshot.entries.find((entry) => entry.id === id)
  if (!current) return undefined
  const updated = updater(current)
  setSnapshot({ entries: snapshot.entries.map((entry) => (entry.id === id ? updated : entry)) })
  enqueueEntry(updated)
  return updated
}

/** A new id for a quiz: a UUID, which is what the `quizzes` table stores. */
export function createArchiveEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
