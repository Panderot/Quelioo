import { BLOOM_CAP, BLOOM_MIX, HIGHER_ORDER_SPLIT, gradeBand } from './bloomConfig.js'
import { BLOOM_LEVELS, EXAM_QUESTION_TYPES } from './types.js'
import type { BloomLevel, BloomSetting, ExamDifficulty, ExamLevel, ExamQuestionType } from './types.js'

/** Revised Bloom taxonomy planning: how many questions of each level, which slot gets which level, and which difficulty fits. */

/** Whole-number shares of `total` in proportion to `weights` (largest remainder; zero weights get zero). */
export function largestRemainder(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  const exact = weights.map((weight) => (Math.max(0, weight) / sum) * total)
  const result = exact.map((value) => Math.floor(value))
  let left = total - result.reduce((a, b) => a + b, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value), weight: weights[index] })).sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.index - b.index)
  for (let i = 0; left > 0 && order.length > 0; i = (i + 1) % order.length) {
    if (order[i].weight > 0) {
      result[order[i].index] += 1
      left -= 1
    }
  }
  return result
}

/** Target number of questions at each Bloom level (index 0 = level 1) for a setting, grade and exam size. */
export function bloomTargetCounts(setting: BloomSetting, level: ExamLevel, total: number): number[] {
  if (setting === 'balanced') return largestRemainder([...BLOOM_MIX[gradeBand(level)]], total)
  if (setting === 'higher') return largestRemainder([0, 0, 0, ...HIGHER_ORDER_SPLIT], total)
  const only = Number(setting)
  return BLOOM_LEVELS.map((value) => (value === only ? total : 0))
}

export interface BloomPlan {
  /** The level of every question slot, per type, lowest first. */
  perType: Record<ExamQuestionType, BloomLevel[]>
  /** The level counts after the type limits were applied (index 0 = level 1). */
  achieved: number[]
  /** Types whose questions could not reach the level the setting asks for (the highest they can reach was used). */
  capped: { type: ExamQuestionType; wanted: BloomLevel; used: BloomLevel }[]
}

/** Gives every question slot a level: the lowest levels go to the types that can only reach low levels, so the target mix is met whenever the types allow it. */
export function planBloom(counts: Record<ExamQuestionType, number>, targets: number[]): BloomPlan {
  const slots: { type: ExamQuestionType; cap: BloomLevel }[] = []
  for (const type of EXAM_QUESTION_TYPES) for (let i = 0; i < counts[type]; i += 1) slots.push({ type, cap: BLOOM_CAP[type] })
  slots.sort((a, b) => a.cap - b.cap)
  const levels: BloomLevel[] = []
  BLOOM_LEVELS.forEach((level, index) => {
    for (let i = 0; i < (targets[index] ?? 0); i += 1) levels.push(level)
  })
  while (levels.length < slots.length) levels.push(levels[levels.length - 1] ?? 1)
  const perType: Record<ExamQuestionType, BloomLevel[]> = { 'open-ended': [], 'short-answer': [], 'fill-blanks': [], 'true-false': [], mcq: [], matching: [] }
  const achieved = [0, 0, 0, 0, 0, 0]
  const capped: BloomPlan['capped'] = []
  slots.forEach((slot, index) => {
    const wanted = levels[index] ?? 1
    const used = (wanted > slot.cap ? slot.cap : wanted) as BloomLevel
    if (used !== wanted && !capped.some((entry) => entry.type === slot.type && entry.wanted === wanted)) capped.push({ type: slot.type, wanted, used })
    perType[slot.type].push(used)
    achieved[used - 1] += 1
  })
  for (const type of EXAM_QUESTION_TYPES) perType[type].sort((a, b) => a - b)
  return { perType, achieved, capped }
}

/** The difficulty labels a question of this type and level may carry: recall is never hard, evaluation and creation are never easy, true-false / fill-in / matching are easy or medium. */
export function allowedDifficulties(type: ExamQuestionType, bloom: BloomLevel | undefined): ExamDifficulty[] {
  const all: ExamDifficulty[] = ['easy', 'medium', 'hard']
  return all.filter((difficulty) => {
    if ((type === 'true-false' || type === 'fill-blanks' || type === 'matching') && difficulty === 'hard') return false
    if (bloom === 1 && difficulty === 'hard') return false
    if (bloom !== undefined && bloom >= 5 && difficulty === 'easy') return false
    return true
  })
}

/** The wanted difficulty moved to the nearest label the type and level allow. */
export function fitDifficulty(type: ExamQuestionType, bloom: BloomLevel | undefined, wanted: ExamDifficulty): ExamDifficulty {
  const allowed = allowedDifficulties(type, bloom)
  if (allowed.includes(wanted)) return wanted
  const order: ExamDifficulty[] = ['easy', 'medium', 'hard']
  const at = order.indexOf(wanted)
  return [...allowed].sort((a, b) => Math.abs(order.indexOf(a) - at) - Math.abs(order.indexOf(b) - at))[0] ?? 'medium'
}

export interface QuestionSlot {
  type: ExamQuestionType
  bloom: BloomLevel
  difficulty: ExamDifficulty
}

/** Every question slot of the exam (types in paper order) with its Bloom level and a difficulty that follows the level and the teacher's mix. */
export function planSlots(counts: Record<ExamQuestionType, number>, targets: number[], mix: Record<ExamDifficulty, number>): { slots: QuestionSlot[]; plan: BloomPlan } {
  const plan = planBloom(counts, targets)
  const slots: QuestionSlot[] = []
  for (const type of EXAM_QUESTION_TYPES) for (const bloom of plan.perType[type]) slots.push({ type, bloom, difficulty: 'medium' })
  // Easier levels get the easier labels: sort by level, hand out easy / medium / hard in the mix's proportions, then move any label a slot may not carry.
  const shares = largestRemainder([mix.easy, mix.medium, mix.hard], slots.length)
  const labels: ExamDifficulty[] = [...Array(shares[0]).fill('easy'), ...Array(shares[1]).fill('medium'), ...Array(shares[2]).fill('hard')]
  const byLevel = slots.map((slot, index) => ({ slot, index })).sort((a, b) => a.slot.bloom - b.slot.bloom || a.index - b.index)
  byLevel.forEach(({ slot }, position) => {
    slot.difficulty = fitDifficulty(slot.type, slot.bloom, labels[position] ?? 'medium')
  })
  return { slots, plan }
}

/** Does a set of levels meet the target counts (each within one question)? */
export function bloomMixOk(levels: (BloomLevel | undefined)[], targets: number[]): boolean {
  return BLOOM_LEVELS.every((level, index) => Math.abs(levels.filter((value) => value === level).length - (targets[index] ?? 0)) <= 1)
}

/** A level moved down to what the type can reach. */
export function clampBloom(type: ExamQuestionType, level: number): BloomLevel {
  const rounded = Math.min(6, Math.max(1, Math.round(level))) as BloomLevel
  return rounded > BLOOM_CAP[type] ? BLOOM_CAP[type] : rounded
}
