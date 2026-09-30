import { useTranslation } from 'react-i18next'

import MathText from './MathText'
import { ResultLiveRegion } from './AnswerBar'
import type { CheckResultState } from './AnswerBar'
import { HintBox, HintButton } from './HintControls'
import { CheckIcon, CloseIcon } from './icons'
import { useCheckableAnswer } from '../hooks/useCheckableAnswer'
import { useHints } from '../hooks/useHints'

interface McqCheckProps {
  options: string[]
  answerIndex: number
  signature: string
  hints?: string[]
  showAnswers?: boolean
  onFirstCheck?: () => void
  onGraded?: (correct: boolean) => void
  onHintUsed?: () => void
}

/** Multiple choice, checkable and retryable: the student picks an option, checks it, and — if
 * wrong — may pick again and recheck, since the correct option is never revealed. Real radio
 * inputs (visually styled) give native arrow-key navigation between options for free. */
export default function McqCheck({ options, answerIndex, signature, hints = [], showAnswers = false, onFirstCheck, onGraded, onHintUsed }: McqCheckProps) {
  const { t } = useTranslation()
  const state = useCheckableAnswer<number | null, CheckResultState>(signature, null)
  const hintState = useHints(signature, hints.length)

  const selectOption = (index: number) => {
    state.setValue(index)
    state.setResult(null)
  }

  const runCheck = () => {
    if (state.value === null) return
    const correct = state.value === answerIndex
    state.setResult({ status: correct ? 'correct' : 'incorrect' })
    if (!state.hasCheckedOnce) {
      state.markCheckedOnce()
      onFirstCheck?.()
    }
    onGraded?.(correct)
  }

  return (
    <div className="space-y-2" data-print-hide>
      <div role="radiogroup" aria-label={t('create.question.type.mcq')} className="space-y-1.5">
        {options.map((option, optionIndex) => {
          const isSelected = state.value === optionIndex
          const showMark = isSelected && state.result !== null
          const stateClasses = showMark
            ? state.result?.status === 'correct'
              ? 'border-success/40 bg-success/10'
              : 'border-error/40 bg-error/10'
            : isSelected
              ? 'border-amber bg-amber/12'
              : 'border-warm-border hover:border-focus-neutral'
          return (
            <label key={optionIndex} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${stateClasses}`}>
              <input
                type="radio"
                name={`mcq-check-${signature}`}
                checked={isSelected}
                onChange={() => selectOption(optionIndex)}
                className="h-4 w-4 shrink-0 accent-amber"
              />
              <span className="font-bold text-muted">{String.fromCharCode(65 + optionIndex)}.</span>
              <span className="min-w-0 flex-1 break-words text-ink">
                <MathText text={option} />
              </span>
              {showMark &&
                (state.result?.status === 'correct' ? (
                  <CheckIcon className="h-4 w-4 shrink-0 text-success" aria-label={t('create.result.checkCorrectMarkLabel')} aria-hidden={false} />
                ) : (
                  <CloseIcon className="h-4 w-4 shrink-0 text-error" aria-label={t('create.result.checkIncorrectMarkLabel')} aria-hidden={false} />
                ))}
            </label>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        <HintButton
          hints={hints}
          revealedCount={hintState.revealedCount}
          onReveal={() => {
            hintState.revealNext()
            onHintUsed?.()
          }}
          hidden={showAnswers || state.result?.status === 'correct'}
        />
        <button
          type="button"
          onClick={runCheck}
          disabled={state.value === null}
          title={t('create.result.checkAnswerLabel')}
          aria-label={t('create.result.checkAnswerLabel')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber text-amber-hover transition-colors hover:bg-amber/12 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckIcon className="h-4 w-4" />
        </button>
      </div>

      <HintBox hints={hints} revealedCount={hintState.revealedCount} />

      <ResultLiveRegion result={state.result} />
    </div>
  )
}
