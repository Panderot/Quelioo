import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { getRightOrder, letterFor } from '../../lib/matching'
import type { AnswerValue } from '../../lib/study'
import type { QuizQuestion } from '../../lib/quiz'
import { CheckIcon, CloseIcon } from '../icons'
import MathText from '../MathText'

export type OptionMark = 'none' | 'correct' | 'wrong'

interface StudyAnswerInputProps {
  question: QuizQuestion
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  /** Enter (or Ctrl+Enter for open answers) in a text field. */
  onSubmit: () => void
  disabled: boolean
  /** How the picked option is marked after a check. */
  mark: OptionMark
  /** After the answer was revealed: the right option is highlighted. */
  revealCorrect: boolean
}

const optionBase =
  'flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-base transition-colors disabled:cursor-default'

function optionClasses(selected: boolean, mark: OptionMark, isRight: boolean): string {
  if (isRight) return 'border-success/50 bg-success/10'
  if (selected && mark === 'wrong') return 'border-error/50 bg-error/10'
  if (selected && mark === 'correct') return 'border-success/50 bg-success/10'
  if (selected) return 'border-amber bg-amber/12'
  return 'border-warm-border bg-card hover:border-focus-neutral'
}

/** The big, finger-sized answer controls of Study Mode. Controlled: the parent owns the value and checks it. */
export default function StudyAnswerInput({ question, value, onChange, onSubmit, disabled, mark, revealCorrect }: StudyAnswerInputProps) {
  const { t } = useTranslation()
  const textRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!disabled) textRef.current?.focus({ preventScroll: true })
  }, [question.id, disabled])

  const markIcon = (selected: boolean, isRight: boolean) => {
    if (isRight || (selected && mark === 'correct')) return <CheckIcon className="h-5 w-5 shrink-0 text-success" aria-label={t('create.result.checkCorrectMarkLabel')} aria-hidden={false} />
    if (selected && mark === 'wrong') return <CloseIcon className="h-5 w-5 shrink-0 text-error" aria-label={t('create.result.checkIncorrectMarkLabel')} aria-hidden={false} />
    return null
  }

  if (question.type === 'mcq') {
    return (
      <div role="radiogroup" aria-label={t('create.question.type.mcq')} className="space-y-2.5">
        {question.options.map((option, optionIndex) => {
          const selected = value === optionIndex
          const isRight = revealCorrect && optionIndex === question.answerIndex
          return (
            <button
              key={optionIndex}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(optionIndex)}
              className={`${optionBase} ${optionClasses(selected, mark, isRight)}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper text-sm font-bold text-muted">{String.fromCharCode(65 + optionIndex)}</span>
              <span className="min-w-0 flex-1 break-words text-ink">
                <MathText text={option} />
              </span>
              {markIcon(selected, isRight)}
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'true-false') {
    return (
      <div role="radiogroup" aria-label={t('create.question.type.trueFalse')} className="grid grid-cols-2 gap-2.5">
        {[true, false].map((choice) => {
          const selected = value === choice
          const isRight = revealCorrect && choice === question.answerBool
          return (
            <button
              key={String(choice)}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(choice)}
              className={`${optionBase} justify-center font-semibold ${optionClasses(selected, mark, isRight)}`}
            >
              {choice ? t('create.result.trueLabel') : t('create.result.falseLabel')}
              {markIcon(selected, isRight)}
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'matching') {
    const rightOrder = getRightOrder(question)
    const letters = Array.isArray(value) ? value : question.pairs.map(() => '')
    return (
      <div className="space-y-4">
        <ol className="space-y-2.5">
          {question.pairs.map((pair, pairIndex) => (
            <li key={pairIndex} className="flex items-center gap-3 rounded-xl border border-warm-border bg-card px-4 py-2.5">
              <span className="shrink-0 font-bold text-muted">{pairIndex + 1}.</span>
              <span className="min-w-0 flex-1 break-words text-base text-ink">
                <MathText text={pair.left} />
              </span>
              <select
                aria-label={t('study.run.matchSelectLabel', { n: pairIndex + 1 })}
                value={letters[pairIndex] ?? ''}
                disabled={disabled}
                onChange={(event) => onChange(letters.map((letter, i) => (i === pairIndex ? event.target.value : letter)))}
                className="h-11 w-20 shrink-0 rounded-lg border border-warm-border bg-paper px-2 text-base font-semibold text-ink"
              >
                <option value="">–</option>
                {rightOrder.map((_, position) => (
                  <option key={position} value={letterFor(position)}>
                    {letterFor(position)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ol>
        <ol className="space-y-2" aria-label={t('study.run.matchChoices')}>
          {rightOrder.map((pairIndex, position) => (
            <li key={position} className="flex items-start gap-3 rounded-xl bg-paper px-4 py-2 text-base text-ink">
              <span className="shrink-0 font-bold text-amber-text">{letterFor(position)}.</span>
              <span className="min-w-0 flex-1 break-words">
                <MathText text={question.pairs[pairIndex].right} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  const text = typeof value === 'string' ? value : ''
  const fieldClasses = `w-full rounded-xl border bg-card px-4 py-3 text-base text-ink placeholder:text-muted focus:border-solid ${
    mark === 'wrong' ? 'border-error/50' : mark === 'correct' ? 'border-success/50' : 'border-warm-border'
  }`

  if (question.type === 'fill-blanks') {
    return (
      <input
        ref={textRef}
        type="text"
        value={text}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSubmit()
          }
        }}
        placeholder={t('create.result.answerPlaceholder')}
        aria-label={t('create.result.yourAnswerLabel')}
        className={`${fieldClasses} min-h-[48px]`}
      />
    )
  }

  const submitsOnPlainEnter = question.type === 'short-answer'
  return (
    <textarea
      ref={textRef}
      rows={question.type === 'open-ended' ? 5 : 3}
      value={text}
      disabled={disabled}
      maxLength={1000}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter') return
        const wants = submitsOnPlainEnter ? !event.shiftKey : event.ctrlKey || event.metaKey
        if (!wants) return
        event.preventDefault()
        onSubmit()
      }}
      placeholder={t('create.result.answerPlaceholder')}
      aria-label={t('create.result.yourAnswerLabel')}
      className={`${fieldClasses} resize-none`}
    />
  )
}
