import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { CheckIcon, CloseIcon, SpinnerIcon } from './icons'

export type CheckStatus = 'correct' | 'partial' | 'incorrect'

export interface CheckResultState {
  status: CheckStatus
  /** AI grader feedback + coverage count — only present for short-answer/open-ended AI-graded results. */
  feedback?: string
  covered?: number
  total?: number
}

const STATUS_TEXT_CLASS: Record<CheckStatus, string> = {
  correct: 'text-success',
  partial: 'text-amber-hover',
  incorrect: 'text-error',
}

const STATUS_LABEL_KEY: Record<CheckStatus, string> = {
  correct: 'create.result.checkCorrect',
  partial: 'create.result.checkPartial',
  incorrect: 'create.result.checkIncorrect',
}

interface ResultLineProps {
  result: CheckResultState | null
  error?: string | null
  onRetry?: () => void
}

/** The aria-live result line shared by every checkable question type (mcq, true-false,
 * fill-blanks, short-answer, open-ended) — never color-only, always paired with an icon and text. */
export function ResultLine({ result, error, onRetry }: ResultLineProps) {
  const { t } = useTranslation()

  if (error) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-xs font-medium text-error">
        <span>{error}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold underline">
            {t('create.errors.retry')}
          </button>
        )}
      </p>
    )
  }

  if (!result) return null

  return (
    <div className="space-y-1">
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${STATUS_TEXT_CLASS[result.status]}`}>
        {result.status === 'incorrect' ? <CloseIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
        {t(STATUS_LABEL_KEY[result.status])}
      </p>
      {result.feedback && <p className="text-xs break-words text-muted">{result.feedback}</p>}
      {typeof result.covered === 'number' && typeof result.total === 'number' && (
        <p className="text-xs text-muted">{t('create.result.coverageCount', { covered: result.covered, total: result.total })}</p>
      )}
    </div>
  )
}

/** Live region wrapper so screen readers announce result/error changes without re-rendering the
 * whole card — kept as a separate always-mounted node per design (7. Accessibility: aria-live). */
export function ResultLiveRegion({ result, error, onRetry }: ResultLineProps) {
  return (
    <div aria-live="polite">
      <ResultLine result={result} error={error} onRetry={onRetry} />
    </div>
  )
}

interface AnswerBarProps {
  fieldType: 'input' | 'textarea'
  value: string
  onChange: (value: string) => void
  onCheck: () => void
  rows?: number
  maxLength?: number
  placeholder?: string
  ariaLabel: string
  /** Plain Enter checks (fill-blanks input, short-answer textarea) instead of only Ctrl/Cmd+Enter (open-ended, where Enter must insert a newline). */
  checkOnPlainEnter?: boolean
  checkDisabled?: boolean
  isChecking?: boolean
  result: CheckResultState | null
  error?: string | null
  onRetry?: () => void
  charCount?: { current: number; max: number }
}

/** Shared answer field + check button + result line, reused by fill-blanks, short-answer and
 * open-ended so the interaction pattern (and its accessibility/reset behavior) is written once. */
export default function AnswerBar({
  fieldType,
  value,
  onChange,
  onCheck,
  rows,
  maxLength,
  placeholder,
  ariaLabel,
  checkOnPlainEnter = false,
  checkDisabled = false,
  isChecking = false,
  result,
  error,
  onRetry,
  charCount,
}: AnswerBarProps) {
  const { t } = useTranslation()

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    const wantsCheck = checkOnPlainEnter ? !event.shiftKey : event.ctrlKey || event.metaKey
    if (!wantsCheck) return
    event.preventDefault()
    if (!checkDisabled && !isChecking) onCheck()
  }

  const fieldClasses =
    'min-w-0 flex-1 resize-none rounded-xl border border-warm-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-solid'

  return (
    <div className="space-y-1.5" data-print-hide>
      <div className="flex items-start gap-2">
        {fieldType === 'textarea' ? (
          <textarea
            rows={rows ?? 2}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-label={ariaLabel}
            className={fieldClasses}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-label={ariaLabel}
            className={fieldClasses}
          />
        )}
        <button
          type="button"
          onClick={onCheck}
          disabled={checkDisabled || isChecking}
          aria-busy={isChecking}
          title={t('create.result.checkAnswerLabel')}
          aria-label={t('create.result.checkAnswerLabel')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber text-amber-hover transition-colors hover:bg-amber/12 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isChecking ? <SpinnerIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
        </button>
      </div>

      {charCount && charCount.max - charCount.current <= 100 && (
        <p className={`text-right text-[11px] ${charCount.current >= charCount.max ? 'font-semibold text-error' : 'text-muted'}`}>
          {charCount.current}/{charCount.max}
        </p>
      )}

      <ResultLiveRegion result={result} error={error} onRetry={onRetry} />
    </div>
  )
}
