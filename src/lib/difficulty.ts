export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number]

/** Single source of truth for what each difficulty means, fed into the generation prompt. */
const DIFFICULTY_PROMPT_DESCRIPTIONS: Record<DifficultyLevel, string> = {
  easy: 'Easy difficulty: test recall and recognition of facts stated explicitly in the text, using simple, direct wording; wrong options/distractors should be obviously incorrect.',
  medium:
    'Medium difficulty: test understanding and simple application of the text, with some paraphrasing of the source wording; distractors should be plausible, not obviously wrong.',
  hard: 'Hard difficulty: test analysis, comparison, cause-and-effect reasoning and inference from the text (not just quoting it); distractors should be tricky but fair, and some questions should require multi-step reasoning combining two or more parts of the text.',
}

export function difficultyInstruction(level: string): string {
  const description = DIFFICULTY_PROMPT_DESCRIPTIONS[level as DifficultyLevel] ?? DIFFICULTY_PROMPT_DESCRIPTIONS.medium
  return `${description} Regardless of difficulty, every question must remain answerable strictly from facts stated in <source_text>.`
}
