import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { Ref, SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { GradeApiError, gradeAnswer } from '../api/gradeAnswer'
import { SolveExtraApiError } from '../api/postJson'
import { fetchSimilarProblem } from '../api/similar'
import type { SimilarErrorCode } from '../api/similar'
import type { SolveResult } from '../api/solve'
import type { SimilarItem, SimilarVerdict } from '../lib/solutionExtras'
import { withExplanation } from '../lib/stepExplanations'
import ExplainableSteps from './ExplainableSteps'
import MathText from './MathText'
import { CheckIcon, SpinnerIcon, XIcon } from './icons'

// Keep the avoid list (and request) small: only the most recent problems matter for variety.
const MAX_AVOID = 10
const MAX_STUDENT_ANSWER_CHARS = 300

type CheckErrorCode = 'grade_failed' | 'empty'

interface SimilarProblemsProps {
  source: SolveResult
  items: SimilarItem[]
  onItemsChange: (update: (items: SimilarItem[]) => SimilarItem[]) => void
  ref?: Ref<PanelHandle>
}

/** Imperative handle for the parent's action buttons: requests happen in the click, never in an effect. */
export interface PanelHandle {
  open: () => void
}

function SimilarCard({
  item,
  index,
  onChange,
}: {
  item: SimilarItem
  index: number
  onChange: (update: (item: SimilarItem) => SimilarItem) => void
}) {
  const { t, i18n } = useTranslation()
  const inputId = useId()
  const [draft, setDraft] = useState(item.studentAnswer)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<CheckErrorCode | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
    [],
  )

  const setVerdict = (verdict: SimilarVerdict, feedback: string) =>
    onChange((current) => ({ ...current, studentAnswer: draft.trim(), verdict, feedback, revealed: true }))

  const handleCheck = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const answer = draft.trim()
    if (!answer || checking) return
    setChecking(true)
    setCheckError(null)
    try {
      // Simple values/expressions are compared locally (mathjs, loaded on demand)…
      const { compareMathAnswers } = await import('../lib/mathAnswer')
      const local = item.problem.checkValue ? compareMathAnswers(answer, item.problem.checkValue) : null
      if (local !== null) {
        setVerdict(local ? 'correct' : 'incorrect', '')
        return
      }
      // …anything else is graded on the server.
      const controller = new AbortController()
      abortRef.current = controller
      const graded = await gradeAnswer(
        {
          type: 'short-answer',
          question: item.problem.question.slice(0, 1000),
          modelAnswer: item.problem.answer.slice(0, 1000),
          keyPoints: [],
          evidence: item.problem.steps.join(' ').slice(0, 500),
          studentAnswer: answer,
          language: i18n.language,
        },
        controller.signal,
      )
      setVerdict(graded.verdict, graded.feedback)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setCheckError(error instanceof GradeApiError && error.code === 'empty' ? 'empty' : 'grade_failed')
    } finally {
      setChecking(false)
    }
  }

  const verdictStyles: Record<SimilarVerdict, string> = {
    correct: 'text-success',
    partial: 'text-amber-text',
    incorrect: 'text-error',
  }

  return (
    <li data-purpose="similar-item" className="space-y-3 rounded-xl border border-warm-border bg-paper p-4">
      <p className="text-xs font-bold tracking-wide text-amber-text uppercase">{t('solve.similar.itemTitle', { number: index + 1 })}</p>
      <p className="text-sm font-semibold text-ink">
        <MathText text={item.problem.question} />
      </p>

      <form onSubmit={(event) => void handleCheck(event)} className="space-y-1.5">
        <label htmlFor={inputId} className="text-xs font-semibold text-ink">
          {t('solve.similar.answerLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            value={draft}
            maxLength={MAX_STUDENT_ANSWER_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('solve.similar.answerPlaceholder')}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-warm-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!draft.trim() || checking}
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-navy bg-card px-4 py-2 text-sm font-bold text-navy transition-colors hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking && <SpinnerIcon className="h-4 w-4" />}
            {t('solve.similar.check')}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="space-y-1">
        {item.verdict && (
          <p data-purpose="similar-verdict" data-verdict={item.verdict} className={`flex items-center gap-1.5 text-sm font-semibold ${verdictStyles[item.verdict]}`}>
            {item.verdict === 'correct' ? <CheckIcon className="h-4 w-4" /> : item.verdict === 'incorrect' ? <XIcon className="h-4 w-4" /> : null}
            {t(`solve.similar.verdict.${item.verdict}`)}
          </p>
        )}
        {item.verdict && item.feedback && <p className="text-xs text-muted">{item.feedback}</p>}
        {checkError && (
          <p role="alert" className="text-xs text-error">
            {t(`solve.similar.checkErrors.${checkError}`)}
          </p>
        )}
      </div>

      {item.revealed ? (
        <div data-purpose="similar-solution" className="space-y-3 border-t border-warm-border pt-3">
          <ExplainableSteps
            question={item.problem.question}
            steps={item.problem.steps}
            answer={item.problem.answer}
            explanations={item.explanations}
            onExplained={(stepIndex, level, explanation) =>
              onChange((current) => ({ ...current, explanations: withExplanation(current.explanations, stepIndex, level, explanation) }))
            }
            stepPurpose="similar-step"
          />
          <div
            data-purpose="similar-answer"
            className="ml-9 flex w-fit max-w-[calc(100%-2.25rem)] flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-amber/15 px-3.5 py-2 text-sm leading-snug font-bold text-navy"
          >
            <span className="text-xs font-semibold tracking-wide text-amber-text uppercase">{t('solve.result.answerLabel')}</span>
            <MathText text={item.problem.answer} className="min-w-0 break-words" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onChange((current) => ({ ...current, revealed: true }))}
          className="text-xs font-semibold text-amber-text hover:underline"
        >
          {t('solve.similar.showSolution')}
        </button>
      )}
    </li>
  )
}

/** "Similar problem": verified practice problems of the same kind, answered and checked on the page. */
export default function SimilarProblems({ source, items, onItemsChange, ref }: SimilarProblemsProps) {
  const { t, i18n } = useTranslation()
  const headingId = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<SimilarErrorCode | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(items.length > 0)
  const [scrollToken, setScrollToken] = useState(0)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
    [],
  )

  const fetchNext = async () => {
    if (abortRef.current) return
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const problem = await fetchSimilarProblem(
        {
          question: source.question,
          steps: source.steps,
          answer: source.answer,
          topic: source.topic,
          language: i18n.language,
          avoid: items.map((item) => item.problem.question).slice(-MAX_AVOID),
        },
        controller.signal,
      )
      onItemsChange((current) => [...current, { problem, studentAnswer: '', verdict: null, feedback: '', revealed: false, explanations: {} }])
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof SolveExtraApiError ? (caught.code as SimilarErrorCode) : 'upstream')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  // The parent's "Similar problem" button: show the panel, fetch the first problem if there is none yet.
  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true)
      setScrollToken((token) => token + 1)
      if (items.length === 0) void fetchNext()
    },
  }))

  useEffect(() => {
    if (scrollToken > 0) sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [scrollToken])

  if (!visible && items.length === 0) return null

  return (
    <section
      ref={sectionRef}
      data-purpose="similar-panel"
      aria-labelledby={headingId}
      className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6"
    >
      <h2 id={headingId} className="font-serif text-lg font-semibold text-navy">
        {t('solve.similar.title')}
      </h2>

      {items.length > 0 && (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <SimilarCard
              key={`${index}-${item.problem.question}`}
              item={item}
              index={index}
              onChange={(update) => onItemsChange((current) => current.map((entry, position) => (position === index ? update(entry) : entry)))}
            />
          ))}
        </ol>
      )}

      {loading && (
        <p data-purpose="similar-loading" className="flex items-center gap-2 text-sm text-muted">
          <SpinnerIcon className="h-4 w-4 text-amber-text" />
          {t('solve.similar.loading')}
        </p>
      )}

      {error && !loading && (
        <p data-purpose="similar-error" role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-error">
          <span>{t(`solve.similar.errors.${error}`)}</span>
          {error !== 'rate_limited' && (
            <button type="button" onClick={() => void fetchNext()} className="font-semibold underline">
              {t('solve.explain.retry')}
            </button>
          )}
        </p>
      )}

      {items.length > 0 && !loading && (
        <button
          type="button"
          onClick={() => void fetchNext()}
          className="inline-flex w-full items-center justify-center rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber sm:w-auto"
        >
          {t('solve.similar.another')}
        </button>
      )}
    </section>
  )
}
