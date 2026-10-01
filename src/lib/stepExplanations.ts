import type { ExplainLevel, StepExplanation } from '../api/explainStep'

/** Key under a saved solution's `extras` (see solutionStorage.ts) holding cached step explanations. */
export const STEP_EXPLANATIONS_KEY = 'stepExplanations'

/** Cached explanations per step index, per level. */
export type StepExplanationCache = Record<number, Partial<Record<ExplainLevel, StepExplanation>>>

function toExplanation(value: unknown): StepExplanation | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.explanation !== 'string' || !record.explanation.trim()) return undefined
  return { explanation: record.explanation, example: typeof record.example === 'string' ? record.example : '' }
}

/** Reads the cache back from a stored record's extras, ignoring anything malformed or out of range. */
export function readStepExplanations(extras: Record<string, unknown> | undefined, stepCount: number): StepExplanationCache {
  const raw = extras?.[STEP_EXPLANATIONS_KEY]
  if (typeof raw !== 'object' || raw === null) return {}
  const cache: StepExplanationCache = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= stepCount || typeof value !== 'object' || value === null) continue
    const levels = value as Record<string, unknown>
    const simple = toExplanation(levels.simple)
    const simpler = toExplanation(levels.simpler)
    if (simple || simpler) cache[index] = { ...(simple ? { simple } : {}), ...(simpler ? { simpler } : {}) }
  }
  return cache
}
