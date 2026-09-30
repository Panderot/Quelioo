import type { McqQuestion, QuizQuestion } from './quiz'

function fisherYates<T>(input: T[]): T[] {
  const result = [...input]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Rebuilds an mcq question's options with the correct answer moved to `targetIndex`, the other
 * options shuffled around it. */
function placeMcqAnswerAt(question: McqQuestion, targetIndex: number): McqQuestion {
  const correctOption = question.options[question.answerIndex]
  const others = question.options.filter((_, index) => index !== question.answerIndex)
  const shuffledOthers = fisherYates(others)
  const options = [...shuffledOthers]
  options.splice(targetIndex, 0, correctOption)
  return { ...question, options, answerIndex: targetIndex }
}

/**
 * Shuffles the option order of every mcq question in a quiz (including mcq questions inside a
 * Mixed quiz), storing the final order so it never re-shuffles on render. Rather than a plain
 * independent Fisher-Yates per question — which can cluster the correct answer at the same
 * position "by chance" — correct-answer positions are assigned round-robin across the available
 * option slots (in a randomized question order), guaranteeing an even spread, then the remaining
 * distractors are shuffled independently per question.
 */
export function shuffleQuizOptions(questions: QuizQuestion[]): QuizQuestion[] {
  const mcqIndices = questions.map((_, index) => index).filter((index) => questions[index].type === 'mcq')
  if (mcqIndices.length === 0) return questions

  const result = [...questions]
  const cursors = new Map<number, number>()
  for (const index of fisherYates(mcqIndices)) {
    const question = questions[index] as McqQuestion
    const optionsCount = question.options.length
    const cursor = cursors.get(optionsCount) ?? Math.floor(Math.random() * optionsCount)
    cursors.set(optionsCount, (cursor + 1) % optionsCount)
    result[index] = placeMcqAnswerAt(question, cursor)
  }
  return result
}

/** Shuffles a single mcq question's options (used for regenerate-one, where there's no sibling
 * quiz to spread positions against). No-op for non-mcq questions. */
export function shuffleSingleQuestionOptions(question: QuizQuestion): QuizQuestion {
  if (question.type !== 'mcq') return question
  const targetIndex = Math.floor(Math.random() * question.options.length)
  return placeMcqAnswerAt(question, targetIndex)
}
