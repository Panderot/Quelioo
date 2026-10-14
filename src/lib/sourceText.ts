import type { SolveResult } from '../api/solve'

/** Text version of a solution: the source for "Make flashcards" (math stays LaTeX, the cards render it). */
export function solutionSourceText(result: SolveResult): string {
  return [
    result.topic,
    result.question,
    result.intro,
    ...result.steps.map((step, index) => `${index + 1}. ${step}`),
    result.answer && `Answer: ${result.answer}`,
    result.tip && `Tip: ${result.tip}`,
    ...result.mistakes.map((mistake) => `Common mistake: ${mistake}`),
  ]
    .filter(Boolean)
    .join('\n')
}
