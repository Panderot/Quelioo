import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ExplainApiError, explainStep } from '../api/explainStep'
import type { ExplainErrorCode, ExplainLevel, StepExplanation } from '../api/explainStep'
import type { SolveResult } from '../api/solve'
import { updateSolutionExtras } from '../lib/solutionStorage'
import { STEP_EXPLANATIONS_KEY } from '../lib/stepExplanations'
import type { StepExplanationCache } from '../lib/stepExplanations'
import MathText from './MathText'
import { LightbulbIcon, SpinnerIcon, WarningIcon } from './icons'

const TRY_FIRST_STORAGE_KEY = 'quelio.solveTryFirst.v1'

function readTryFirst(): boolean {
  try {
    return window.localStorage.getItem(TRY_FIRST_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeTryFirst(value: boolean) {
  try {
    window.localStorage.setItem(TRY_FIRST_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage unavailable (private mode) — the switch still works for this view.
  }
}

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

const pendingKey = (stepIndex: number, level: ExplainLevel) => `${stepIndex}:${level}`

interface SolutionViewProps {
  result: SolveResult
  /** Id of the saved Solutions record, once known — explanations are cached into it. */
  solutionId?: string | null
  /** Explanations already cached in the saved record (reopened from the Archive). */
  initialExplanations?: StepExplanationCache
  className?: string
  /** Extra content between the solution card and its actions (e.g. a storage note, future tools). */
  children?: ReactNode
}

/** The one rendering of a solved problem — used right after solving and when reopening a saved
 * solution from the Archive, so actions added here (step reveal, explain) work in both places. */
export default function SolutionView({ result, solutionId = null, initialExplanations, className = '', children }: SolutionViewProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const switchLabelId = useId()
  const stepCount = result.steps.length

  // ---- Step-by-step reveal ("Let me try first") ----
  const [tryFirst, setTryFirst] = useState(readTryFirst)
  const [revealed, setRevealed] = useState(0)
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  const answerRef = useRef<HTMLDivElement>(null)
  const focusTargetRef = useRef<number | null>(null)

  const visibleSteps = tryFirst ? Math.min(revealed, stepCount) : stepCount
  const answerVisible = !tryFirst || revealed > stepCount

  useEffect(() => {
    const target = focusTargetRef.current
    if (target === null) return
    focusTargetRef.current = null
    const element = target < stepCount ? stepRefs.current[target] : answerRef.current
    element?.focus()
  }, [revealed, stepCount])

  const toggleTryFirst = () => {
    const next = !tryFirst
    setTryFirst(next)
    setRevealed(0)
    writeTryFirst(next)
  }

  const revealNext = () => {
    focusTargetRef.current = revealed
    setRevealed(revealed + 1)
  }

  const revealAll = () => {
    focusTargetRef.current = Math.min(revealed, stepCount)
    setRevealed(stepCount + 1)
  }

  // ---- "Explain this step" ----
  const [explanations, setExplanations] = useState<StepExplanationCache>(() => initialExplanations ?? {})
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set())
  const [simplerShown, setSimplerShown] = useState<Set<number>>(() => new Set())
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const [errors, setErrors] = useState<Record<string, ExplainErrorCode>>({})
  const controllersRef = useRef(new Set<AbortController>())
  // Only write back once something new was fetched — not when just showing what was loaded.
  const dirtyRef = useRef(false)

  useEffect(() => {
    const controllers = controllersRef.current
    return () => controllers.forEach((controller) => controller.abort())
  }, [])

  // Persist into the Solutions record; also catches up explanations fetched before the save finished.
  useEffect(() => {
    if (!solutionId || !dirtyRef.current) return
    void updateSolutionExtras(solutionId, STEP_EXPLANATIONS_KEY, explanations).catch(() => {
      // Storage full/unavailable — the in-memory cache still makes repeats free for this view.
    })
  }, [solutionId, explanations])

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
          question: result.question,
          steps: result.steps,
          answer: result.answer,
          stepIndex,
          level,
          ...(previous ? { previousExplanation: [previous.explanation, previous.example].filter(Boolean).join('\n') } : {}),
          language: i18n.language,
        },
        controller.signal,
      )
      dirtyRef.current = true
      setExplanations((current) => ({ ...current, [stepIndex]: { ...current[stepIndex], [level]: explanation } }))
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

  const handleCreateQuiz = () => {
    const prefillText = buildQuizPrefillText(result, {
      topic: t('solve.prefill.topicLabel'),
      question: t('solve.prefill.questionLabel'),
      steps: t('solve.prefill.stepsLabel'),
      answer: t('solve.prefill.answerLabel'),
    })
    navigate('/', { state: { prefillText } })
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

  return (
    <div data-purpose="solve-result" className={`space-y-4 pb-6 ${className}`}>
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-warm-border bg-card px-4 py-3">
        <span id={switchLabelId} className="text-sm font-semibold text-ink">
          {t('solve.reveal.toggle')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={tryFirst}
          aria-labelledby={switchLabelId}
          onClick={toggleTryFirst}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${tryFirst ? 'bg-amber' : 'bg-warm-border'}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full border border-warm-border bg-card transition-transform ${
              tryFirst ? 'translate-x-5 border-white' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

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

        {visibleSteps > 0 && (
          <ol className="space-y-3">
            {result.steps.slice(0, visibleSteps).map((step, index) => {
              const isOpen = openSteps.has(index)
              const cached = explanations[index]
              const panelId = `step-explain-${switchLabelId}-${index}`
              return (
                <li
                  key={index}
                  ref={(element) => {
                    stepRefs.current[index] = element
                  }}
                  tabIndex={-1}
                  data-purpose="solve-step"
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
                          <button
                            type="button"
                            onClick={() => showSimpler(index)}
                            className="text-xs font-semibold text-amber-text hover:underline"
                          >
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
        )}

        {answerVisible && result.answer && (
          <div
            ref={answerRef}
            tabIndex={-1}
            data-purpose="solve-answer"
            className="ml-9 flex w-fit max-w-[calc(100%-2.25rem)] flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-amber/15 px-3.5 py-2 text-sm leading-snug font-bold text-navy outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          >
            <span className="text-xs font-semibold tracking-wide text-amber-text uppercase">{t('solve.result.answerLabel')}</span>
            <MathText text={result.answer} className="min-w-0 break-words" />
          </div>
        )}

        {tryFirst && !answerVisible && (
          <div data-purpose="reveal-controls" className="space-y-2">
            <p className="text-xs text-muted">{t('solve.reveal.progress', { shown: visibleSteps, total: stepCount })}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={revealNext}
                className="inline-flex w-full items-center justify-center rounded-xl border-2 border-navy bg-card px-4 py-2 text-sm font-bold text-navy transition-colors hover:bg-navy/5 sm:w-auto"
              >
                {t('solve.reveal.next')}
              </button>
              <button
                type="button"
                onClick={revealAll}
                className="inline-flex w-full items-center justify-center rounded-xl border border-warm-border bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-amber sm:w-auto"
              >
                {t('solve.reveal.showAll')}
              </button>
            </div>
          </div>
        )}

        {answerVisible && result.tip && (
          <div className="rounded-xl border border-warm-border bg-paper p-3.5 text-xs text-muted">
            <span className="font-semibold text-ink">{t('solve.result.tipLabel')}: </span>
            <MathText text={result.tip} />
          </div>
        )}

        {answerVisible && result.mistakes.length > 0 && (
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
