import { useTranslation } from 'react-i18next'

import { ResultLiveRegion } from './AnswerBar'
import type { CheckResultState } from './AnswerBar'
import { CheckIcon, CloseIcon } from './icons'
import { useCheckableAnswer } from '../hooks/useCheckableAnswer'

interface TrueFalseCheckProps {
  answerBool: boolean
  signature: string
  onFirstCheck?: () => void
  onGraded?: (correct: boolean) => void
}

export default function TrueFalseCheck({ answerBool, signature, onFirstCheck, onGraded }: TrueFalseCheckProps) {
  const { t } = useTranslation()
  const state = useCheckableAnswer<boolean | null, CheckResultState>(signature, null)

  const selectValue = (value: boolean) => {
    state.setValue(value)
    state.setResult(null)
  }

  const runCheck = () => {
    if (state.value === null) return
    const correct = state.value === answerBool
    state.setResult({ status: correct ? 'correct' : 'incorrect' })
    if (!state.hasCheckedOnce) {
      state.markCheckedOnce()
      onFirstCheck?.()
    }
    onGraded?.(correct)
  }

  return (
    <div className="space-y-2" data-print-hide>
      <div role="radiogroup" aria-label={t('create.question.type.trueFalse')} className="flex gap-2">
        {[true, false].map((value) => {
          const isSelected = state.value === value
          const showMark = isSelected && state.result !== null
          const stateClasses = showMark
            ? state.result?.status === 'correct'
              ? 'border-success/40 bg-success/10'
              : 'border-error/40 bg-error/10'
            : isSelected
              ? 'border-amber bg-amber/12'
              : 'border-warm-border hover:border-focus-neutral'
          return (
            <label key={String(value)} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold text-ink transition-colors ${stateClasses}`}>
              <input
                type="radio"
                name={`tf-check-${signature}`}
                checked={isSelected}
                onChange={() => selectValue(value)}
                className="h-4 w-4 accent-amber"
              />
              {value ? t('create.result.trueLabel') : t('create.result.falseLabel')}
              {showMark &&
                (state.result?.status === 'correct' ? (
                  <CheckIcon className="h-4 w-4 shrink-0 text-success" aria-label={t('create.result.checkCorrectMarkLabel')} aria-hidden={false} />
                ) : (
                  <CloseIcon className="h-4 w-4 shrink-0 text-error" aria-label={t('create.result.checkIncorrectMarkLabel')} aria-hidden={false} />
                ))}
            </label>
          )
        })}
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

      <ResultLiveRegion result={state.result} />
    </div>
  )
}
