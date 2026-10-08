import { addCards, cardsForDeck, createDeck, updateDeck } from './flashcardStorage'
import type { Card, Deck } from './flashcardStorage'
import { missingCards, quizToCards } from './quizToCards'
import type { CardLabels } from './quizToCards'
import { DEFAULT_NEW_PER_DAY } from './srs'
import type { GeneratedQuiz } from './quiz'

export interface MistakesDeckResult {
  deckId: string
  deckName: string
  count: number
}

/** Mistakes go straight into "{title} · Mistakes" (no review): new cards are due today, and the daily
 * new-card limit is raised so all of them really are. Shared by the quiz page and Study Mode. */
export function addMistakesToDeck(args: {
  quiz: GeneratedQuiz
  quizId: string
  questionIds: Set<string>
  labels: CardLabels
  deckName: string
  language: string
  /** The current flashcard state (from useFlashcards). */
  flashcards: { decks: Deck[]; cards: Card[] }
}): MistakesDeckResult {
  const { quiz, quizId, questionIds, labels, deckName, language, flashcards } = args
  const cards = quizToCards(quiz, labels, questionIds)
  const mistakesRef = `${quizId}#mistakes`
  const existing = flashcards.decks.find((deck) => deck.source === 'quiz' && deck.sourceRef === mistakesRef)
  if (existing) {
    const fresh = missingCards(cards, cardsForDeck(flashcards.cards, existing.id).map((card) => card.front))
    addCards(existing.id, fresh)
    const pendingNew = cardsForDeck(flashcards.cards, existing.id).filter((card) => card.reviews === 0).length + fresh.length
    if (pendingNew > existing.newPerDay) updateDeck(existing.id, { newPerDay: pendingNew })
    return { deckId: existing.id, deckName: existing.name, count: fresh.length }
  }
  const deck = createDeck({ name: deckName, source: 'quiz', sourceRef: mistakesRef, language, newPerDay: Math.max(DEFAULT_NEW_PER_DAY, cards.length) })
  addCards(deck.id, cards)
  return { deckId: deck.id, deckName: deck.name, count: cards.length }
}
