import type { GeneratedQuiz, QuizQuestion } from './quiz'
import { MAX_KEY_FACT_CHARS, MAX_KEY_FACTS } from './song'

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

/** One short fact per question (its correct answer in context) — the only material the song-lyrics
 * endpoint is allowed to write about. Never shown to the student directly, just DATA for the AI,
 * but also used to drive the song's target length (one fact per question, see lib/song.ts). */
export function buildSongKeyFacts(quiz: GeneratedQuiz): string[] {
  return quiz.questions
    .slice(0, MAX_KEY_FACTS)
    .map((question) => `${question.question} — ${correctAnswerText(question)}`.slice(0, MAX_KEY_FACT_CHARS))
}
