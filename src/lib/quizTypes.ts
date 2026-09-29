export type QuestionType =
  | 'mcq'
  | 'true-false'
  | 'fill-blanks'
  | 'short-answer'
  | 'matching'
  | 'open-ended'
  | 'mixed'

interface QuestionTypeDefinition {
  value: QuestionType
  labelKey: string
}

export const QUESTION_TYPES: QuestionTypeDefinition[] = [
  { value: 'mcq', labelKey: 'params.questionType.mcq' },
  { value: 'true-false', labelKey: 'params.questionType.trueFalse' },
  { value: 'fill-blanks', labelKey: 'params.questionType.fillBlanks' },
  { value: 'short-answer', labelKey: 'params.questionType.shortAnswer' },
  { value: 'matching', labelKey: 'params.questionType.matching' },
  { value: 'open-ended', labelKey: 'params.questionType.openEnded' },
  { value: 'mixed', labelKey: 'params.questionType.mixed' },
]

export const QUESTION_TYPE_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  QUESTION_TYPES.map((type) => [type.value, type.labelKey]),
)

const OPTIONS_COUNT_TYPES: ReadonlySet<string> = new Set<QuestionType>(['mcq', 'mixed'])

export function supportsOptionsCount(questionType: string): boolean {
  return OPTIONS_COUNT_TYPES.has(questionType as QuestionType)
}
