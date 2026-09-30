import { useTranslation } from 'react-i18next'

import { LightbulbIcon } from './icons'
import MathText from './MathText'

interface HintButtonProps {
  hints: string[]
  revealedCount: number
  onReveal: () => void
  /** True when the button must be hidden entirely — Show answers is on, or the student already
   * answered this question correctly. */
  hidden: boolean
}

/** Small secondary button, light bulb icon, placed to the left of a question's check button.
 * Renders nothing when there are no hints for this question or `hidden` is true. */
export function HintButton({ hints, revealedCount, onReveal, hidden }: HintButtonProps) {
  const { t } = useTranslation()
  if (hidden || hints.length === 0) return null

  const exhausted = revealedCount >= hints.length
  const label = revealedCount === 0 ? t('create.result.hint') : exhausted ? t('create.result.noMoreHints') : t('create.result.anotherHint')

  return (
    <button
      type="button"
      onClick={onReveal}
      disabled={exhausted}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-warm-border text-muted transition-colors hover:border-amber hover:text-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LightbulbIcon className="h-4 w-4" />
    </button>
  )
}

/** Soft amber box listing the hints revealed so far, numbered, announced to screen readers.
 * Renders nothing until the first hint is revealed. */
export function HintBox({ hints, revealedCount }: { hints: string[]; revealedCount: number }) {
  if (revealedCount === 0) return null
  return (
    <div aria-live="polite" data-print-hide className="rounded-xl border border-amber/30 bg-amber/10 p-3">
      <ol className="list-decimal space-y-1 pl-4 text-xs font-medium text-amber-hover">
        {hints.slice(0, revealedCount).map((hint, index) => (
          <li key={index}>
            <MathText text={hint} />
          </li>
        ))}
      </ol>
    </div>
  )
}
