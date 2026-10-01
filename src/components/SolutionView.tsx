import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { SolveResult } from '../api/solve'
import MathText from './MathText'
import { WarningIcon } from './icons'

function buildQuizPrefillText(
  result: SolveResult,
  labels: { topic: string; question: string; steps: string; answer: string },
): string {
  const lines = [
    `${labels.topic}: ${result.topic}`,
    '',
    `${labels.question}: ${result.question}`,
    '',
    ...(result.intro ? [result.intro, ''] : []),
    `${labels.steps}:`,
    ...result.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `${labels.answer}: ${result.answer}`,
  ]
  return lines.join('\n')
}

interface SolutionViewProps {
  result: SolveResult
  className?: string
  /** Extra content between the solution card and its actions (e.g. a storage note, future tools). */
  children?: ReactNode
}

/** The one rendering of a solved problem — used right after solving and when reopening a saved
 * solution from the Archive, so actions added here show up in both places. */
export default function SolutionView({ result, className = '', children }: SolutionViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleCreateQuiz = () => {
    const prefillText = buildQuizPrefillText(result, {
      topic: t('solve.prefill.topicLabel'),
      question: t('solve.prefill.questionLabel'),
      steps: t('solve.prefill.stepsLabel'),
      answer: t('solve.prefill.answerLabel'),
    })
    navigate('/', { state: { prefillText } })
  }

  return (
    <div data-purpose="solve-result" className={`space-y-4 pb-6 ${className}`}>
      <section className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
        {result.topic && <p className="text-xs font-bold tracking-wide text-amber-text uppercase">{result.topic}</p>}
        <p className="text-sm font-semibold text-ink">
          <MathText text={result.question} />
        </p>

        {result.intro && (
          <p data-purpose="solve-intro" className="text-sm leading-relaxed text-ink">
            <MathText text={result.intro} />
          </p>
        )}

        <ol className="space-y-3">
          {result.steps.map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">
                {index + 1}
              </span>
              <span className="min-w-0 text-sm leading-relaxed break-words text-ink">
                <MathText text={step} />
              </span>
            </li>
          ))}
        </ol>

        {result.answer && (
          <div
            data-purpose="solve-answer"
            className="ml-9 flex w-fit max-w-[calc(100%-2.25rem)] flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-amber/15 px-3.5 py-2 text-sm leading-snug font-bold text-navy"
          >
            <span className="text-xs font-semibold tracking-wide text-amber-text uppercase">{t('solve.result.answerLabel')}</span>
            <MathText text={result.answer} className="min-w-0 break-words" />
          </div>
        )}

        {result.tip && (
          <div className="rounded-xl border border-warm-border bg-paper p-3.5 text-xs text-muted">
            <span className="font-semibold text-ink">{t('solve.result.tipLabel')}: </span>
            <MathText text={result.tip} />
          </div>
        )}

        {result.mistakes.length > 0 && (
          <div data-purpose="solve-mistakes" className="flex gap-2.5 rounded-xl border border-amber/40 bg-amber/10 p-3.5 text-xs text-ink">
            <WarningIcon className="mt-px h-4 w-4 shrink-0 text-amber-text" />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-amber-text">{t('solve.result.mistakeLabel')}</p>
              {result.mistakes.length === 1 ? (
                <p>
                  <MathText text={result.mistakes[0]} />
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-4">
                  {result.mistakes.map((mistake, index) => (
                    <li key={index}>
                      <MathText text={mistake} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {children}

      <button
        type="button"
        onClick={handleCreateQuiz}
        className="inline-flex w-full items-center justify-center rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber sm:w-auto"
      >
        {t('solve.cta.createQuiz')}
      </button>

      <p className="text-center text-xs text-muted">{t('solve.footerNote')}</p>
    </div>
  )
}
