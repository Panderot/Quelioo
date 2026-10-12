import { sanitizeExam } from './factory'
import type { WrittenExam } from './types'

/** Browser-local copies of unsaved work. Keyed by user and exam (or setup) id, so one account's or one
 * exam's draft can never open in another, and dropped after 7 days. The server copy wins unless the
 * draft is newer and different, and then the editor asks. */

export const DRAFT_MAX_AGE_MS = 7 * 24 * 3_600_000

const EXAM_PREFIX = 'quelio.examDraft.v1.'
const SETUP_PREFIX = 'quelio.examSetup.v1.'

export interface ExamDraft {
  exam: WrittenExam
  /** The server `updatedAt` the draft was edited from. */
  baseUpdatedAt: string
  /** When the draft was written (ms since epoch). */
  savedAt: number
}

export interface SetupDraft {
  value: unknown
  savedAt: number
}

const examKey = (userId: string, examId: string) => `${EXAM_PREFIX}${userId}.${examId}`
const setupKey = (userId: string, setupId: string) => `${SETUP_PREFIX}${userId}.${setupId}`

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : (JSON.parse(raw) as unknown)
  } catch {
    return undefined
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Storage unavailable.
  }
}

function parseExamDraft(raw: unknown): ExamDraft | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const exam = sanitizeExam(record.exam)
  if (!exam || typeof record.baseUpdatedAt !== 'string' || typeof record.savedAt !== 'number') return null
  return { exam, baseUpdatedAt: record.baseUpdatedAt, savedAt: record.savedAt }
}

function parseSetupDraft(raw: unknown): SetupDraft | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  return typeof record.savedAt === 'number' && 'value' in record ? { value: record.value, savedAt: record.savedAt } : null
}

export function readDraft(userId: string, examId: string, now = Date.now()): ExamDraft | null {
  const key = examKey(userId, examId)
  const draft = parseExamDraft(readJson(key))
  if (!draft || draft.exam.id !== examId || now - draft.savedAt > DRAFT_MAX_AGE_MS) {
    remove(key)
    return null
  }
  return draft
}

export function writeDraft(userId: string, exam: WrittenExam, baseUpdatedAt: string, now = Date.now()): void {
  try {
    localStorage.setItem(examKey(userId, exam.id), JSON.stringify({ exam, baseUpdatedAt, savedAt: now } satisfies ExamDraft))
  } catch {
    // Storage unavailable or full: the server autosave still runs.
  }
}

export function clearDraft(userId: string, examId: string): void {
  remove(examKey(userId, examId))
}

export function readSetupDraft(userId: string, setupId: string, now = Date.now()): SetupDraft | null {
  const key = setupKey(userId, setupId)
  const draft = parseSetupDraft(readJson(key))
  if (!draft || now - draft.savedAt > DRAFT_MAX_AGE_MS) {
    remove(key)
    return null
  }
  return draft
}

export function writeSetupDraft(userId: string, setupId: string, value: unknown, now = Date.now()): void {
  try {
    localStorage.setItem(setupKey(userId, setupId), JSON.stringify({ value, savedAt: now } satisfies SetupDraft))
  } catch {
    // Storage unavailable or full.
  }
}

export function clearSetupDraft(userId: string, setupId: string): void {
  remove(setupKey(userId, setupId))
}

function storageKeys(): string[] {
  try {
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => key !== null)
  } catch {
    return []
  }
}

/** Removes the user's drafts older than 7 days and any that cannot be read. */
export function purgeStaleDrafts(userId: string, now = Date.now()): void {
  for (const key of storageKeys()) {
    if (key.startsWith(`${EXAM_PREFIX}${userId}.`)) {
      const draft = parseExamDraft(readJson(key))
      if (!draft || now - draft.savedAt > DRAFT_MAX_AGE_MS) remove(key)
    } else if (key.startsWith(`${SETUP_PREFIX}${userId}.`)) {
      const draft = parseSetupDraft(readJson(key))
      if (!draft || now - draft.savedAt > DRAFT_MAX_AGE_MS) remove(key)
    }
  }
}

/** Removes every exam and setup draft of a user (all users when omitted). */
export function clearAllDraftsFor(userId?: string): void {
  for (const key of storageKeys()) {
    const scope = key.startsWith(EXAM_PREFIX) ? EXAM_PREFIX : key.startsWith(SETUP_PREFIX) ? SETUP_PREFIX : null
    if (scope && (userId === undefined || key.startsWith(`${scope}${userId}.`))) remove(key)
  }
}

const contentOf = (exam: WrittenExam) => JSON.stringify({ title: exam.title, settings: exam.settings, questions: exam.questions })

/** Which copy to open: the server's, unless it is missing (the draft) or the draft is newer and
 * different from it (ask the teacher). */
export function chooseVersion(draft: ExamDraft | null, server: WrittenExam | null): 'draft' | 'server' | 'ask' {
  if (!draft) return 'server'
  if (!server) return 'draft'
  if (draft.savedAt <= Date.parse(server.updatedAt)) return 'server'
  return contentOf(draft.exam) === contentOf(server) ? 'server' : 'ask'
}
