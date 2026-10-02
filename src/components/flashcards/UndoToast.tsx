import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { UNDO_WINDOW_MS } from '../../lib/flashcardStorage'

interface UndoToastProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

/** Bottom-center navy toast with an amber Undo; dismisses itself after the undo window. */
export default function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  const { t } = useTranslation()
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])
  // Parents key the toast by the deleted item, so each delete gets a fresh window.
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-warm-border bg-navy px-4 py-3 text-sm text-paper shadow-lg"
    >
      <span className="min-w-0">{message}</span>
      <button type="button" onClick={onUndo} className="shrink-0 font-bold text-amber hover:underline">
        {t('flashcards.common.undo')}
      </button>
    </div>
  )
}
