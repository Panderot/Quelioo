import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ExplainApiError, explainStep } from '../api/explainStep'
import type { ExplainErrorCode, ExplainLevel, StepExplanation } from '../api/explainStep'
import type { StepExplanationCache } from '../lib/stepExplanations'
import MathText from './MathText'
import { LightbulbIcon, SpinnerIcon } from './icons'

const pendingKey = (stepIndex: number, level: ExplainLevel) => `${stepIndex}:${level}`

interface ExplainableStepsProps {
  question: string
  steps: string[]
  answer: string
  /** How many steps to show (step-by-step reveal); all by default. */
  visibleCount?: number
  /** Explanations already known for these steps (cache — shown without a new request). */
  explanations: StepExplanationCache
  onExplained: (stepIndex: number, level: ExplainLevel, explanation: StepExplanation) => void
  /** Lets the parent move focus to a revealed step. */
  registerStep?: (index: number, element: HTMLLIElement | null) => void
  stepPurpose?: string
}

/** Numbered solution steps, each with "Explain this step" → "Even simpler" backed by /api/explain-step. */
export default function ExplainableSteps({
  question,
  steps,
  answer,
  visibleCount = steps.length,
  explanations,
  onExplained,
  registerStep,
  stepPurpose = 'solve-step',
}: ExplainableStepsProps) {
  const { t, i18n } = useTranslation()
  const idPrefix = useId()
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set())
  const [simplerShown, setSimplerShown] = useState<Set<number>>(() => new Set())
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const [errors, setErrors] = useState<Record<string, ExplainErrorCode>>({})
  const controllersRef = useRef(new Set<AbortController>())

  useEffect(() => {
    const controllers = controllersRef.current
    return () => controllers.forEach((controller) => controller.abort())
  }, [])

  const fetchExplanation = async (stepIndex: number, level: ExplainLevel) => {
    const key = pendingKey(stepIndex, level)
    if (pending.has(key)) return
    const previous = level === 'simpler' ? explanations[stepIndex]?.simple : undefined
    if (level === 'simpler' && !previous) return

    setPending((current) => new Set(current).add(key))
    setErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    const controller = new AbortController()
    controllersRef.current.add(controller)
    try {
      const explanation = await explainStep(
        {
          question,
          steps,
          answer,
          stepIndex,
          level,
          ...(previous ? { previousExplanation: [previous.explanation, previous.example].filter(Boolean).join('\n') } : {}),
          language: i18n.language,
        },
        controller.signal,
      )
      onExplained(stepIndex, level, explanation)
    } catch (error) {
      if (controller.signal.aborted) return
      setErrors((current) => ({ ...current, [key]: error instanceof ExplainApiError ? error.code : 'upstream' }))
    } finally {
      controllersRef.current.delete(controller)
      if (!controller.signal.aborted) {
        setPending((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    }
  }

  const toggleExplain = (stepIndex: number) => {
    const isOpen = openSteps.has(stepIndex)
    setOpenSteps((current) => {
      const next = new Set(current)
      if (isOpen) next.delete(stepIndex)
      else next.add(stepIndex)
      return next
    })
    // Cached explanations are shown for free; only fetch the first time.
    if (!isOpen && !explanations[stepIndex]?.simple) void fetchExplanation(stepIndex, 'simple')
  }

  const showSimpler = (stepIndex: number) => {
    setSimplerShown((current) => new Set(current).add(stepIndex))
    if (!explanations[stepIndex]?.simpler) void fetchExplanation(stepIndex, 'simpler')
  }

  const renderExplanationBox = (explanation: StepExplanation, level: ExplainLevel) => (
    <div
      data-purpose={`step-explanation-${level}`}
      className={`space-y-1.5 rounded-xl border p-3 text-xs leading-relaxed text-ink ${
        level === 'simple' ? 'border-warm-border bg-paper' : 'border-amber/40 bg-amber/10'
      }`}
    >
      {level === 'simpler' && <p className="font-semibold text-amber-text">{t('solve.explain.simplerLabel')}</p>}
      <p>
        <MathText text={explanation.explanation} />
      </p>
      {explanation.example && (
        <p>
          <span className="font-semibold text-ink">{t('solve.explain.exampleLabel')}: </span>
          <MathText text={explanation.example} />
        </p>
      )}
    </div>
  )

  const renderStatus = (stepIndex: number, level: ExplainLevel) => {
    const key = pendingKey(stepIndex, level)
    if (pending.has(key)) {
      return (
        <p className="flex items-center gap-2 text-xs text-muted">
          <SpinnerIcon className="h-4 w-4 text-amber-text" />
          {t('solve.explain.loading')}
        </p>
      )
    }
    const error = errors[key]
    if (error) {
      return (
        <p data-purpose="step-explanation-error" role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-error">
          <span>{t(`solve.explain.errors.${error}`)}</span>
          {error !== 'rate_limited' && (
            <button type="button" onClick={() => void fetchExplanation(stepIndex, level)} className="font-semibold underline">
              {t('solve.explain.retry')}
            </button>
          )}
        </p>
      )
    }
    return null
  }

  if (visibleCount <= 0) return null

  return (
    <ol className="space-y-3">
      {steps.slice(0, visibleCount).map((step, index) => {
        const isOpen = openSteps.has(index)
        const cached = explanations[index]
        const panelId = `${idPrefix}-explain-${index}`
        return (
          <li
            key={index}
            ref={registerStep ? (element) => registerStep(index, element) : undefined}
            tabIndex={-1}
            data-purpose={stepPurpose}
            className="space-y-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          >
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">
                {index + 1}
              </span>
              <span className="min-w-0 text-sm leading-relaxed break-words text-ink">
                <MathText text={step} />
              </span>
            </div>
            <div className="ml-9 space-y-2">
              <button
                type="button"
                onClick={() => toggleExplain(index)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-text hover:underline"
              >
                <LightbulbIcon className="h-3.5 w-3.5" />
                {t('solve.explain.button')}
              </button>
              {isOpen && (
                <div id={panelId} className="space-y-2">
                  {cached?.simple ? renderExplanationBox(cached.simple, 'simple') : renderStatus(index, 'simple')}
                  {cached?.simple && !simplerShown.has(index) && (
                    <button type="button" onClick={() => showSimpler(index)} className="text-xs font-semibold text-amber-text hover:underline">
                      {t('solve.explain.simpler')}
                    </button>
                  )}
                  {simplerShown.has(index) &&
                    (cached?.simpler ? renderExplanationBox(cached.simpler, 'simpler') : renderStatus(index, 'simpler'))}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
