import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** Modal confirmation: focus starts on Cancel, Tab stays inside, Escape cancels, focus returns on close. */
export default function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!buttons || buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/40" aria-hidden onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 space-y-4 rounded-2xl border border-warm-border bg-card p-5 shadow-lg sm:inset-x-0"
      >
        <div className="space-y-1.5">
          <h2 id={titleId} className="font-serif text-base font-semibold text-navy">
            {title}
          </h2>
          <p className="text-sm text-muted">{body}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-warm-border px-4 py-2 text-sm font-semibold text-ink hover:border-focus-neutral"
          >
            {t('flashcards.common.cancel')}
          </button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-error/10 px-4 py-2 text-sm font-bold text-error hover:bg-error/20">
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
