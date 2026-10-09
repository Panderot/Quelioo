import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'

interface ConfirmDialogProps {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

/** A short "are you sure" for the board: focus starts on Cancel, Escape cancels, Tab stays inside. */
export default function ConfirmDialog({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel, busy = false }: ConfirmDialogProps) {
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
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
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
      <div className="fixed inset-0 z-[60] bg-ink/50" aria-hidden onClick={onCancel} />
      <div
        ref={dialogRef}
        data-purpose="live-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="fixed inset-x-4 top-1/2 z-[70] mx-auto max-w-md -translate-y-1/2 space-y-5 rounded-2xl border border-warm-border bg-card p-6 shadow-lg sm:inset-x-0"
      >
        <div className="space-y-2">
          <h2 id={titleId} className="font-serif text-xl font-semibold text-navy">
            {title}
          </h2>
          {body && <p className="text-base text-muted">{body}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-warm-border px-5 py-2 text-base font-semibold text-ink hover:border-focus-neutral">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 rounded-xl bg-error px-5 py-2 text-base font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
