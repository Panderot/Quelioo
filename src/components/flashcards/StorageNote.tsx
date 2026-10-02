import { useTranslation } from 'react-i18next'

import type { FlashcardState } from '../../lib/flashcardStorage'

/** One short note when flashcards can't be saved; the session itself keeps working in memory. */
export default function StorageNote({ state }: { state: FlashcardState }) {
  const { t } = useTranslation()
  if (!state.storageUnavailable && !state.saveFailed) return null
  return (
    <p data-purpose="flashcards-storage-note" className="rounded-xl border border-warm-border bg-card px-4 py-3 text-xs text-muted">
      {t(state.storageUnavailable ? 'flashcards.storage.unavailable' : 'flashcards.storage.saveFailed')}
    </p>
  )
}
