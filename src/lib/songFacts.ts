import type { GeneratedQuiz, QuizQuestion } from './quiz'
import { MAX_KEY_FACT_CHARS, MAX_KEY_FACTS } from './song'
import type { SongCoverageItem } from './song'

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

/** The quiz's facts plan as short statements, core facts first, in source order inside each group —
 * extra DATA for the lyrics writer beside the per-question key facts. Empty on older quizzes that
 * have no plan. */
export function buildSongFactPlan(quiz: GeneratedQuiz): string[] {
  const facts = quiz.coverage?.facts ?? []
  const ordered = [...facts].sort((a, b) => Number(b.importance === 'core') - Number(a.importance === 'core') || a.position - b.position)
  return ordered.slice(0, MAX_KEY_FACTS).map((fact) => fact.statement.trim().slice(0, MAX_KEY_FACT_CHARS)).filter(Boolean)
}

/** Per-question coverage for a song: each key fact's question with the lyric line that states it.
 * Undefined when the lyrics were never reviewed (no line mapping). */
export function buildSongCoverage(facts: string[], factLines: number[] | null | undefined, lyrics: string): SongCoverageItem[] | undefined {
  if (!factLines || factLines.length !== facts.length) return undefined
  const lines = lyrics.split('\n')
  return facts.map((fact, index) => {
    const line = factLines[index] >= 0 ? (lines[factLines[index]] ?? '').trim() : ''
    return { question: fact.split(' — ')[0], line: line || null }
  })
}
