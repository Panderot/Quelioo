import type { GeneratedQuiz, QuizQuestion } from './quiz'
import { MAX_KEY_FACTS_CHARS } from './song'

function correctAnswerText(question: QuizQuestion): string {
  switch (question.type) {
    case 'mcq':
      return question.options[question.answerIndex] ?? ''
    case 'true-false':
      return question.answerBool ? 'True' : 'False'
    case 'fill-blanks':
    case 'short-answer':
    case 'open-ended':
      return question.answer
    case 'matching':
      return question.pairs.map((pair) => `${pair.left} = ${pair.right}`).join('; ')
  }
}

/** Question + correct-answer pairs, one per line, capped at MAX_KEY_FACTS_CHARS — sent to the
 * song-lyrics endpoint as factual context (never shown to the student, just DATA for the AI). */
export function buildSongKeyFacts(quiz: GeneratedQuiz): string {
  const joined = quiz.questions.map((question) => `Q: ${question.question} A: ${correctAnswerText(question)}`).join('\n')
  return joined.length > MAX_KEY_FACTS_CHARS ? joined.slice(0, MAX_KEY_FACTS_CHARS) : joined
}
