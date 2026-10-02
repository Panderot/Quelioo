import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useNow } from '../../hooks/useNow'
import { dueCountForDeck, useFlashcards } from '../../lib/flashcardStorage'
import { startOfLocalDay } from '../../lib/srs'
import { CloseIcon } from '../icons'

/** Local day (its midnight timestamp) the reminder was dismissed on. */
const DISMISSED_KEY = 'quelio.flashcardsReminder.v1'

function readDismissedDay(): number | null {
  try {
    const value = Number(window.localStorage.getItem(DISMISSED_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** Small muted line on Create and Solve when flashcards are due today; dismissed for the rest of the day. */
export default function DueReminder() {
  const { t } = useTranslation()
  const state = useFlashcards()
  const now = Math.max(useNow(), state.changedAt)
  const [dismissedDay, setDismissedDay] = useState(readDismissedDay)
  const today = startOfLocalDay(now)
  const due = state.decks.reduce((sum, deck) => sum + dueCountForDeck(deck, state.cards, now), 0)
  if (due === 0 || dismissedDay === today) return null

  const dismiss = () => {
    setDismissedDay(today)
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(today))
    } catch {
      // Storage blocked: the line still hides for this visit.
    }
  }

  return (
    <div data-purpose="due-reminder" className="flex items-center justify-between gap-3 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs text-muted">
      <Link to="/flashcards" className="font-semibold hover:text-ink hover:underline">
        {t('flashcards.reminder.text', { count: due })}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('flashcards.reminder.dismiss')}
        title={t('flashcards.reminder.dismiss')}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-ink"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
