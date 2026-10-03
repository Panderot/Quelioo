import { hashText } from './hash'
import type { GeneratedQuiz } from './quiz'
import { deepMathToPlain } from './mathPlain'
import { parseQuizCoverage } from './factCoverage'
import type { CoverageFact } from './factCoverage'

export interface ArchiveEntry {
  id: string
  title: string
  createdAt: string
  source: 'text' | 'file' | 'url'
  questionType: string
  difficulty: string
  questionCount: string
  optionsCount: string | null
  outputLanguage?: string
  sourceText?: string
  quiz: GeneratedQuiz
  /** Older entries saved before this existed always had explanations — undefined reads as true. */
  includeExplanations?: boolean
  /** Older entries saved before this existed were never shuffled — undefined reads as false so a
   * later regenerate-one on them keeps matching their original (unshuffled) behavior. */
  shuffleOptions?: boolean
  /** Older entries saved before this existed never had hints — undefined reads as true (matching
   * the setting's own default) so a later regenerate-one on them still requests hints. */
  includeHints?: boolean
  /** Number of focus parts used at generation time — never the snippet text itself. */
  focusPartsCount?: number
  /** Hash of the normalized source text (see sourceTextHash) — lets a new quiz from the same text
   * avoid the questions earlier quizzes already asked. Older entries compute it from sourceText. */
  sourceHash?: string
  /** "part": a follow-up quiz over the facts an earlier quiz had no room for (its plan is a subset,
   * never reused as the source's cached plan). */
  coverageScope?: 'part'
}

/** Hash of a source text after trimming, collapsing whitespace and lowercasing. */
export function sourceTextHash(text: string): string {
  return hashText(text.trim().replace(/\s+/g, ' ').toLocaleLowerCase())
}

export const MAX_SOURCE_AVOID_STEMS = 40

/** Question stems of earlier quizzes from the same source text, newest quiz first, capped. */
export function previousStemsForSource(entries: ArchiveEntry[], hash: string, cap = MAX_SOURCE_AVOID_STEMS): string[] {
  const stems: string[] = []
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const entry of sorted) {
    const entryHash = entry.sourceHash ?? (entry.sourceText ? sourceTextHash(entry.sourceText) : undefined)
    if (entryHash !== hash) continue
    for (const question of entry.quiz.questions) {
      if (typeof question.question === 'string' && !stems.includes(question.question)) stems.push(question.question)
      if (stems.length >= cap) return stems
    }
  }
  return stems
}

/** The facts plan of the newest quiz from the same source and output language — reused so that
 * regenerating, adding questions or another quiz from the same text do not pay for it twice. */
export function cachedPlanForSource(entries: ArchiveEntry[], hash: string, outputLanguage: string): CoverageFact[] | undefined {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const entry of sorted) {
    const entryHash = entry.sourceHash ?? (entry.sourceText ? sourceTextHash(entry.sourceText) : undefined)
    if (entryHash !== hash || (entry.outputLanguage ?? 'auto') !== outputLanguage || entry.coverageScope === 'part') continue
    const coverage = parseQuizCoverage(entry.quiz.coverage)
    if (coverage) return coverage.facts
  }
  return undefined
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
    // Older quizzes may hold LaTeX code from before quizzes were plain text: show readable math.
    return valid.map((entry) => ({ ...entry, quiz: { ...entry.quiz, questions: deepMathToPlain(entry.quiz.questions) } }))
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

export function createArchiveEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
