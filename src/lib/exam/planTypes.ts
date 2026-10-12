import type { BloomLevel, ExamDifficulty, ExamQuestionType } from './types'

export type { ExamDistributionRow } from './types'

/** A question slot of the plan: what the fact assigned to it will be written as. */
export interface QuestionSlotInfo {
  type: ExamQuestionType
  bloom: BloomLevel
  difficulty: ExamDifficulty
}
