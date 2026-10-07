import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SpinnerIcon } from '../icons'
import { passwordStrength } from './authHelpers'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: string
  error?: string | null
  optionalLabel?: string
  children?: ReactNode
}

/** Labeled text input in the Solar Paper form style (card surface, warm border, radius 10, h-11). */
export function TextField({ label, hint, error, optionalLabel, children, className = '', ...input }: TextFieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-[11px] font-bold tracking-wide text-muted uppercase">
        {label}
        {optionalLabel && <span className="font-medium tracking-normal normal-case">{optionalLabel}</span>}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-11 w-full rounded-[10px] border bg-card px-4 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-muted ${error ? 'border-error' : 'border-warm-border hover:border-focus-neutral'} ${className}`}
        {...input}
      />
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  )
}

interface PrimaryButtonProps {
  children: ReactNode
  busy?: boolean
  disabled?: boolean
  type?: 'submit' | 'button'
  onClick?: () => void
}

/** The screen's one solid amber action (design.md 5: navy bold text on amber). */
export function PrimaryButton({ children, busy = false, disabled = false, type = 'submit', onClick }: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy && <SpinnerIcon className="h-4 w-4" />}
      {children}
    </button>
  )
}

export function OutlineButton({ children, onClick, disabled = false, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="min-h-10 w-full rounded-xl border border-warm-border bg-card px-4 py-2 text-sm font-bold text-navy transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {children}
    </button>
  )
}

/** Inline status line: error (red), success (green) or neutral note; errors are announced assertively. */
export function FormMessage({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const color = tone === 'error' ? 'border-error/30 bg-error/5 text-error' : tone === 'success' ? 'border-success/30 bg-success/5 text-success' : 'border-warm-border bg-paper text-ink'
  return (
    <p data-purpose="form-message" role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${color}`}>
      {children}
    </p>
  )
}

/** Live hint under a new-password field: the 8-character rule plus a weak/fair/strong note. */
export function PasswordStrengthHint({ password }: { password: string }) {
  const { t } = useTranslation()
  const level = passwordStrength(password)
  const filled = level === 'strong' ? 3 : level === 'fair' ? 2 : level === 'weak' ? 1 : 0
  const text = level === 'empty' || level === 'short' ? t('auth.strength.short') : t(`auth.strength.${level}`)
  const barColor = level === 'strong' ? 'bg-success' : level === 'fair' ? 'bg-amber' : 'bg-error'
  return (
    <div data-purpose="password-strength" data-level={level} className="space-y-1.5">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((step) => (
          <span key={step} className={`h-1 flex-1 rounded-full ${step <= filled ? barColor : 'bg-warm-border'}`} />
        ))}
      </div>
      <p aria-live="polite" className="text-xs text-muted">
        <span className="sr-only">{t('auth.strength.label')}: </span>
        {text}
      </p>
    </div>
  )
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.82-.07-1.6-.21-2.36H12v4.47h6.45a5.52 5.52 0 01-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.73z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.3v3.1A12 12 0 0012 24z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 010-4.58v-3.1H1.3a12 12 0 000 10.78l3.99-3.1z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 001.3 6.61l3.99 3.1C6.23 6.87 8.88 4.76 12 4.76z" />
    </svg>
  )
}

export function GoogleButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-purpose="google-sign-in"
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-warm-border bg-card text-sm font-bold text-navy transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleMark className="h-5 w-5" />
      {t('auth.continueWithGoogle')}
    </button>
  )
}

export function OrDivider() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 text-xs font-semibold text-muted" aria-hidden>
      <span className="h-px flex-1 bg-warm-border" />
      {t('auth.or')}
      <span className="h-px flex-1 bg-warm-border" />
    </div>
  )
}
