import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchAnotherWay } from '../api/anotherWay'
import type { AnotherWayErrorCode } from '../api/anotherWay'
import { SolveExtraApiError } from '../api/postJson'
import type { SolveResult } from '../api/solve'
import type { PanelHandle } from './SimilarProblems'
import type { StoredAnotherWay } from '../lib/solutionExtras'
import { withExplanation } from '../lib/stepExplanations'
import ExplainableSteps from './ExplainableSteps'
import MathText from './MathText'
import { SpinnerIcon } from './icons'

interface AnotherWayPanelProps {
  source: SolveResult
  value: StoredAnotherWay | null
  onChange: (value: StoredAnotherWay) => void
  ref?: Ref<PanelHandle>
}

/** "Solve another way": a genuinely different method with the same (server-checked) final answer. */
export default function AnotherWayPanel({ source, value, onChange, ref }: AnotherWayPanelProps) {
  const { t, i18n } = useTranslation()
  const headingId = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AnotherWayErrorCode | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(value !== null)
  const [scrollToken, setScrollToken] = useState(0)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
    [],
  )

  const load = async () => {
    if (abortRef.current) return
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await fetchAnotherWay({ question: source.question, steps: source.steps, answer: source.answer, language: i18n.language }, controller.signal)
      onChange(result.kind === 'method' ? { ...result, explanations: {} } : result)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof SolveExtraApiError ? (caught.code as AnotherWayErrorCode) : 'upstream')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  // The "Solve another way" action: show the panel; a cached method is shown without a new request.
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true)
      setScrollToken((token) => token + 1)
      if (!value) void load()
    },
  }))

  useEffect(() => {
    if (scrollToken > 0) sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [scrollToken])

  if (!visible && !value) return null

  return (
    <section
      ref={sectionRef}
      data-purpose="another-way-panel"
      aria-labelledby={headingId}
      aria-busy={loading}
      className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6"
    >
      <h2 id={headingId} className="font-serif text-lg font-semibold text-navy">
        {value?.kind === 'method' ? t('solve.anotherWay.titleWithMethod', { method: value.method }) : t('solve.anotherWay.title')}
      </h2>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <SpinnerIcon className="h-4 w-4 text-amber-text" />
          {t('solve.anotherWay.loading')}
        </p>
      )}

      {error && !loading && (
        <p data-purpose="another-way-error" role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-error">
          <span>{t(`solve.anotherWay.errors.${error}`)}</span>
          {error !== 'rate_limited' && (
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              {t('solve.explain.retry')}
            </button>
          )}
        </p>
      )}

      {value?.kind === 'none' && (
        <p data-purpose="another-way-none" className="rounded-xl border border-warm-border bg-paper p-3.5 text-sm text-ink">
          {value.note ? <MathText text={value.note} /> : t('solve.anotherWay.noOtherFallback')}
        </p>
      )}

      {value?.kind === 'method' && (
        <div data-purpose="another-way-solution" className="space-y-4">
          <ExplainableSteps
            question={source.question}
            steps={value.steps}
            answer={value.answer}
            explanations={value.explanations}
            onExplained={(stepIndex, level, explanation) =>
              onChange({ ...value, explanations: withExplanation(value.explanations, stepIndex, level, explanation) })
            }
            stepPurpose="another-way-step"
          />
          <div
            data-purpose="another-way-answer"
            className="ml-9 flex w-fit max-w-[calc(100%-2.25rem)] flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-amber/15 px-3.5 py-2 text-sm leading-snug font-bold text-navy"
          >
            <span className="text-xs font-semibold tracking-wide text-amber-text uppercase">{t('solve.result.answerLabel')}</span>
            <MathText text={value.answer} className="min-w-0 break-words" />
          </div>
        </div>
      )}
    </section>
  )
}
