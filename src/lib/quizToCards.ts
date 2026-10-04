import { MAX_BACK_CHARS, MAX_FRONT_CHARS, normalizeFront } from './flashcardText'
import { getKeyPoints } from './quiz'
import type { GeneratedQuiz, QuizQuestion } from './quiz'

/** Quiz → flashcards without AI: every question type maps to front/back directly. */

export interface DraftCard {
  front: string
  back: string
}

export interface CardLabels {
  trueLabel: string
  falseLabel: string
  /** Starts a true/false card's front so it reads as a question ("True or false:"). */
  trueFalsePrefix: string
  /** Starts a matching card's front, followed by the term ("What matches:"). */
  matchPrefix: string
}

const clip = (text: string, max: number) => {
  const trimmed = text.trim().replace(/\s+\n/g, '\n')
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}

function card(front: string, back: string): DraftCard | null {
  const cleanFront = clip(front, MAX_FRONT_CHARS)
  const cleanBack = clip(back, MAX_BACK_CHARS)
  return cleanFront && cleanBack ? { front: cleanFront, back: cleanBack } : null
}

function questionToCards(question: QuizQuestion, labels: CardLabels): DraftCard[] {
  let cards: (DraftCard | null)[]
  switch (question.type) {
    case 'mcq':
      cards = [card(question.question, question.options[question.answerIndex] ?? '')]
      break
    case 'true-false': {
      const verdict = question.answerBool ? labels.trueLabel : labels.falseLabel
      cards = [card(`${labels.trueFalsePrefix} ${question.question}`, question.explanation.trim() ? `${verdict} — ${question.explanation.trim()}` : verdict)]
      break
    }
    case 'fill-blanks':
    case 'short-answer':
      cards = [card(question.question, question.answer)]
      break
    case 'matching':
      cards = question.pairs.map((pair) => card(`${labels.matchPrefix} ${pair.left}`, pair.right))
      break
    case 'open-ended':
      cards = [card(question.question, getKeyPoints(question).map((point) => `• ${point}`).join('\n'))]
      break
  }
  return cards.filter((entry): entry is DraftCard => entry !== null)
}

/** Every card for the given questions (all of the quiz by default), de-duplicated by front. */
export function quizToCards(quiz: GeneratedQuiz, labels: CardLabels, onlyQuestionIds?: Set<string>): DraftCard[] {
  const seen = new Set<string>()
  const result: DraftCard[] = []
  for (const question of quiz.questions) {
    if (onlyQuestionIds && !onlyQuestionIds.has(question.id)) continue
    for (const entry of questionToCards(question, labels)) {
      const key = normalizeFront(entry.front)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(entry)
    }
  }
  return result
}

/** Cards whose front is not already in `existingFronts`. */
export function missingCards(cards: DraftCard[], existingFronts: string[]): DraftCard[] {
  const existing = new Set(existingFronts.map(normalizeFront))
  return cards.filter((entry) => !existing.has(normalizeFront(entry.front)))
}
