import type { AnotherWayResult } from '../api/anotherWay'
import type { SimilarProblem } from '../api/similar'
import { readStepExplanations } from './stepExplanations'
import type { StepExplanationCache } from './stepExplanations'

/** Keys under a saved solution's `extras` (see solutionStorage.ts). */
export const SIMILAR_PROBLEMS_KEY = 'similarProblems'
export const ANOTHER_WAY_KEY = 'anotherWay'

export type SimilarVerdict = 'correct' | 'partial' | 'incorrect'

/** One practice problem on the page, with what the student did with it. */
export interface SimilarItem {
  problem: SimilarProblem
  studentAnswer: string
  verdict: SimilarVerdict | null
  /** AI grader feedback when the answer wasn't a simple value; "" otherwise. */
  feedback: string
  revealed: boolean
  explanations: StepExplanationCache
}

export type StoredAnotherWay = (Extract<AnotherWayResult, { kind: 'method' }> & { explanations: StepExplanationCache }) | Extract<AnotherWayResult, { kind: 'none' }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? (value as string[]) : null
}

const VERDICTS = new Set(['correct', 'partial', 'incorrect'])

/** Reads saved similar problems back, dropping anything malformed. */
export function readSimilarItems(extras: Record<string, unknown> | undefined): SimilarItem[] {
  const raw = extras?.[SIMILAR_PROBLEMS_KEY]
  if (!Array.isArray(raw)) return []
  const items: SimilarItem[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || !isRecord(entry.problem)) continue
    const { question, answer, checkValue } = entry.problem
    const steps = stringArray(entry.problem.steps)
    if (typeof question !== 'string' || !question || typeof answer !== 'string' || !steps || steps.length === 0) continue
    items.push({
      problem: { question, steps, answer, checkValue: typeof checkValue === 'string' ? checkValue : '' },
      studentAnswer: typeof entry.studentAnswer === 'string' ? entry.studentAnswer : '',
      verdict: typeof entry.verdict === 'string' && VERDICTS.has(entry.verdict) ? (entry.verdict as SimilarVerdict) : null,
      feedback: typeof entry.feedback === 'string' ? entry.feedback : '',
      revealed: entry.revealed === true,
      explanations: readStepExplanations({ stepExplanations: entry.explanations }, steps.length),
    })
  }
  return items
}

export function readAnotherWay(extras: Record<string, unknown> | undefined): StoredAnotherWay | null {
  const raw = extras?.[ANOTHER_WAY_KEY]
  if (!isRecord(raw)) return null
  if (raw.kind === 'none') return { kind: 'none', note: typeof raw.note === 'string' ? raw.note : '' }
  const steps = stringArray(raw.steps)
  if (raw.kind !== 'method' || typeof raw.method !== 'string' || typeof raw.answer !== 'string' || !steps || steps.length === 0) return null
  return {
    kind: 'method',
    method: raw.method,
    steps,
    answer: raw.answer,
    explanations: readStepExplanations({ stepExplanations: raw.explanations }, steps.length),
  }
}
