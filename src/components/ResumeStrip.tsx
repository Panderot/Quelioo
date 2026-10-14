import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useNow } from '../hooks/useNow'
import { useArchive } from '../lib/archive'
import { dueCountForDeck, useFlashcards } from '../lib/flashcardStorage'

/** One-line "pick up where you left off" strip above the Create form: due flashcards and the latest quiz. Renders nothing without data and opens smoothly once data arrives. */
export default function ResumeStrip() {
  const { t } = useTranslation()
  const flashcards = useFlashcards()
  const now = Math.max(useNow(), flashcards.changedAt)
  const { entries } = useArchive()

  const dueDecks = flashcards.decks
    .map((deck) => ({ deck, due: dueCountForDeck(deck, flashcards.cards, now) }))
    .filter(({ due }) => due > 0)
  const due = dueDecks.reduce((sum, { due: count }) => sum + count, 0)
  const lastQuiz = entries[0]
  if (due === 0 && !lastQuiz) return null

  // One deck with due cards opens its review directly; several go to the deck list.
  const dueTo = dueDecks.length === 1 ? `/flashcards/${dueDecks[0].deck.id}/study` : '/flashcards'
  const linkClass = 'truncate rounded-lg border border-warm-border bg-card px-3 py-1.5 font-semibold text-ink hover:border-focus-neutral'

  return (
    <div data-purpose="resume-strip" data-print-hide className="resume-strip-open grid">
      <div className="-m-1 min-h-0 overflow-hidden p-1">
        <div className="flex items-center gap-2 text-sm">
          {due > 0 && (
            <Link data-purpose="resume-due" to={dueTo} className={`${linkClass} shrink-0`}>
              {t('create.resume.dueCards', { count: due })}
            </Link>
          )}
          {lastQuiz && (
            <Link data-purpose="resume-quiz" to={`/archive/${lastQuiz.id}?mode=study`} className={`${linkClass} min-w-0`}>
              {t('create.resume.lastQuiz', { title: lastQuiz.title })}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
