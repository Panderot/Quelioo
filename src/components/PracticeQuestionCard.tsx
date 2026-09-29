import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { QuizQuestion } from '../lib/quiz'
import MathText from './MathText'
import { CheckIcon, CloseIcon } from './icons'

interface PracticeQuestionCardProps {
  index: number
  question: QuizQuestion
  onGraded: (correct: boolean) => void
  resetSignal: number
}

export default function PracticeQuestionCard({ index, question, onGraded, resetSignal }: PracticeQuestionCardProps) {
  const { t } = useTranslation()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [selectedBool, setSelectedBool] = useState<boolean | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isGraded, setIsGraded] = useState(false)

  const key = `${question.id}-${resetSignal}`

  const grade = (correct: boolean) => {
    if (isGraded) return
    setIsGraded(true)
    onGraded(correct)
  }

  const handleMcqSelect = (optionIndex: number) => {
    if (question.type !== 'mcq' || selectedIndex !== null) return
    setSelectedIndex(optionIndex)
    grade(optionIndex === question.answerIndex)
  }

  const handleBoolSelect = (value: boolean) => {
    if (question.type !== 'true-false' || selectedBool !== null) return
    setSelectedBool(value)
    grade(value === question.answerBool)
  }

  return (
    <li key={key} data-purpose="practice-question-card" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">{index + 1}</span>
        <p className="text-sm font-semibold break-words text-ink">
          <MathText text={question.question} />
        </p>
      </div>

      {question.type === 'mcq' && (
        <ul className="space-y-1.5">
          {question.options.map((option, optionIndex) => {
            const isSelected = selectedIndex === optionIndex
            const isCorrectOption = optionIndex === question.answerIndex
            const revealState = selectedIndex !== null
            const stateClasses = !revealState
              ? 'border-warm-border hover:border-focus-neutral'
              : isCorrectOption
                ? 'border-success/40 bg-success/10'
                : isSelected
                  ? 'border-error/40 bg-error/10'
                  : 'border-warm-border opacity-60'
            return (
              <li key={optionIndex}>
                <button
                  type="button"
                  disabled={revealState}
                  onClick={() => handleMcqSelect(optionIndex)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${stateClasses}`}
                >
                  <span className="font-bold text-muted">{String.fromCharCode(65 + optionIndex)}.</span>
                  <span className="min-w-0 flex-1 break-words text-ink">
                    <MathText text={option} />
                  </span>
                  {revealState && isCorrectOption && <CheckIcon className="h-4 w-4 shrink-0 text-success" />}
                  {revealState && isSelected && !isCorrectOption && <CloseIcon className="h-4 w-4 shrink-0 text-error" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {question.type === 'true-false' && (
        <div className="flex gap-2">
          {[true, false].map((value) => {
            const isSelected = selectedBool === value
            const revealState = selectedBool !== null
            const isCorrectOption = value === question.answerBool
            const stateClasses = !revealState
              ? 'border-warm-border hover:border-focus-neutral'
              : isCorrectOption
                ? 'border-success/40 bg-success/10'
                : isSelected
                  ? 'border-error/40 bg-error/10'
                  : 'border-warm-border opacity-60'
            return (
              <button
                key={String(value)}
                type="button"
                disabled={revealState}
                onClick={() => handleBoolSelect(value)}
                className={`rounded-lg border px-3.5 py-2 text-sm font-semibold text-ink transition-colors ${stateClasses}`}
              >
                {value ? t('create.result.trueLabel') : t('create.result.falseLabel')}
              </button>
            )
          })}
        </div>
      )}

      {(question.type === 'fill-blanks' || question.type === 'short-answer' || question.type === 'open-ended' || question.type === 'matching') && (
        <div className="space-y-2">
          {!isRevealed ? (
            <button
              type="button"
              onClick={() => setIsRevealed(true)}
              className="rounded-xl border border-warm-border bg-paper px-3.5 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
            >
              {t('archive.practice.reveal')}
            </button>
          ) : (
            <>
              {question.type === 'matching' ? (
                <ul className="space-y-1 text-sm break-words text-ink">
                  {question.pairs.map((pair, pairIndex) => (
                    <li key={pairIndex} className="flex items-start gap-2">
                      <span className="font-semibold">
                        <MathText text={pair.left} />
                      </span>
                      <span className="shrink-0 text-muted">→</span>
                      <span>
                        <MathText text={pair.right} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-warm-border bg-paper p-3.5 text-sm break-words text-ink">
                  <MathText text={question.answer} />
                </div>
              )}
              {!isGraded && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => grade(true)}
                    className="rounded-xl border border-success/40 bg-success/10 px-3.5 py-2 text-xs font-bold text-success transition-colors hover:bg-success/20"
                  >
                    {t('archive.practice.gotItRight')}
                  </button>
                  <button
                    type="button"
                    onClick={() => grade(false)}
                    className="rounded-xl border border-error/40 bg-error/10 px-3.5 py-2 text-xs font-bold text-error transition-colors hover:bg-error/20"
                  >
                    {t('archive.practice.gotItWrong')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
