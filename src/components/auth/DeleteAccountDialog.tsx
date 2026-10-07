import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { SpinnerIcon } from '../icons'

interface DeleteAccountDialogProps {
  email: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** Confirm dialog (ConfirmDialog pattern) where the confirm button unlocks only after the account email is typed. */
export default function DeleteAccountDialog({ email, busy, error, onConfirm, onCancel }: DeleteAccountDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const inputId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase() && email !== ''

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (!busy) onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('input, button:not([disabled])')
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
      <div className="fixed inset-0 z-40 bg-ink/40" aria-hidden onClick={busy ? undefined : onCancel} />
      <div
        ref={dialogRef}
        data-purpose="delete-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 space-y-4 rounded-2xl border border-warm-border bg-card p-5 shadow-lg sm:inset-x-0"
      >
        <div className="space-y-1.5">
          <h2 id={titleId} className="font-serif text-base font-semibold text-navy">
            {t('account.delete.dialogTitle')}
          </h2>
          <p className="text-sm text-muted">{t('account.delete.dialogBody')}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('account.delete.confirmLabel')}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="email"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={email}
            className="h-11 w-full rounded-[10px] border border-warm-border bg-card px-4 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-muted"
          />
        </div>
        {error && (
          <p role="alert" className="text-xs font-semibold text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-10 rounded-xl border border-warm-border px-4 py-2 text-sm font-semibold text-ink hover:border-focus-neutral disabled:opacity-60">
            {t('flashcards.common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches || busy}
            aria-busy={busy}
            className="flex min-h-10 items-center gap-2 rounded-xl bg-error/10 px-4 py-2 text-sm font-bold text-error hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            {t('account.delete.confirm')}
          </button>
        </div>
      </div>
    </>
  )
}
