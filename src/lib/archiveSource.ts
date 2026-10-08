import { parseQuizCoverage } from './factCoverage'
import type { CoverageFact } from './factCoverage'
import { hashText } from './hash'
import type { GeneratedQuiz } from './quiz'
import type { StudyResults } from './study'

/** The parts of the Archive that need no browser or account: the entry shape and the helpers that
 * match a new quiz with earlier quizzes from the same source text (also used by the unit specs). */

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
  /** Study history: finished sessions, the repeat pool and an unfinished session (see lib/study.ts). */
  results?: StudyResults
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
