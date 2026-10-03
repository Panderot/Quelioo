import type { SolveResult } from '../api/solve'
import type { ArchiveEntry } from './archive'
import type { QuizQuestion } from './quiz'
import { mathToPlainText } from './mathPlain'
import { MAX_QUIZ_WORDS, countWords } from './textStats'

/** Text version of a solution: the source for "Make flashcards" (math stays LaTeX, the cards render it)
 * and, with `plain`, for Audio Lesson and the quiz box (math as readable text, spoken in words). */
export function solutionSourceText(result: SolveResult, plain = false): string {
  const joined = [
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
  return plain ? mathToPlainText(joined) : joined
}

function answerText(question: QuizQuestion): string {
  switch (question.type) {
    case 'mcq':
      return question.options[question.answerIndex] ?? ''
    case 'true-false':
      return question.answerBool ? 'True' : 'False'
    case 'matching':
      return question.pairs.map((pair) => `${pair.left} = ${pair.right}`).join('; ')
    default:
      return question.answer
  }
}

/** An Archive quiz as lesson source: its stored source text plus its questions, answers and
 * explanations — or only the source text when both together would pass the word limit. */
export function quizSourceText(entry: ArchiveEntry): string {
  const questions = entry.quiz.questions
    .map((question) => [`${question.question} — ${answerText(question)}`, question.explanation].filter(Boolean).join('\n'))
    .join('\n\n')
  const source = mathToPlainText(entry.sourceText?.trim() ?? '')
  if (!source) return questions
  const combined = `${source}\n\n${questions}`
  return countWords(combined) <= MAX_QUIZ_WORDS ? combined : source
}
