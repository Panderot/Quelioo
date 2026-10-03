export type DifficultyLevel = 'easy' | 'medium' | 'hard'

/** Single source of truth for what each difficulty means, fed into the generation prompt. Difficulty
 * sets the THINKING level, never trickery or ambiguity. */
const DIFFICULTY_PROMPT_DESCRIPTIONS: Record<DifficultyLevel, string> = {
  easy: [
    'Easy difficulty = recall or recognition of ONE key fact or term, in short, direct wording.',
    'mcq: distractors plausible but clearly distinct. true-false: plainly true or false to someone who studied. fill-blanks: a key term. matching: clear term-definition pairs. short-answer: a term or a one-sentence fact. open-ended: describe or list with a simple structure.',
    'Easy is never a giveaway: the answer is never in the stem and no option is obviously absurd. No negative stems ("which is NOT").',
  ].join(' '),
  medium: [
    'Medium difficulty = UNDERSTANDING: cause and effect, "why", compare, classify, restate in other words, choose the correct reason. Naming a term from its textbook definition is easy, not medium.',
    'mcq: distractors built on common misconceptions. true-false: a subtle change in one key detail. fill-blanks: a sentence rewritten in your own words that needs the concept, not a copied sentence. matching: situations, examples or effects matched to the concept that explains them (e.g. "a cell swells in pure water" → osmosis), not term-definition pairs. short-answer: "why" or "how". open-ended: explain a process or compare two ideas.',
    'Every medium quiz must contain understanding questions, not only recall.',
  ].join(' '),
  hard: [
    'Hard difficulty = APPLICATION and ANALYSIS: a hard question can NOT be answered by recalling one sentence of the source. The student must use the idea in a new situation: predict what happens when a condition changes (e.g. "A plant is kept in the dark for a week; what happens to its starch store?"), infer a cause from an effect, compare two cases, combine two facts in multi-step reasoning, or tell two close concepts apart.',
    'Wrapping a recall question in a story is NOT hard (e.g. "A muscle cell needs a lot of energy; which organelle makes ATP?" is easy). Change a condition and ask for the consequence instead (e.g. "If the mitochondria of a muscle cell stopped working, which process would stop first?").',
    'mcq: may use "which is NOT/EXCEPT"; distractors a half-prepared student would choose. true-false: subtle, concept-level errors. fill-blanks: the blank completes a scenario or a consequence. matching: short scenarios or predictions matched to close concepts where elimination is not enough. short-answer: apply a rule to a new case. open-ended: evaluate, justify or combine several ideas.',
    'Every hard quiz must contain application questions; most questions should be scenario, prediction or analysis questions.',
  ].join(' '),
}

export function difficultyInstruction(level: string): string {
  const description = DIFFICULTY_PROMPT_DESCRIPTIONS[level as DifficultyLevel] ?? DIFFICULTY_PROMPT_DESCRIPTIONS.medium
  return `${description} All questions in the quiz match this level and each has exactly one defensible answer. The facts come only from <source_text>; a scenario and the wording may be new, but must stay factually correct and consistent with the source.`
}
