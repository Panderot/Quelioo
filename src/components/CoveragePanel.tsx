import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MAX_QUESTION_COUNT, computeCoverage, missingEntries, slotsNeededFor } from '../lib/factCoverage'
import type { FactCoverageRow, FactStatus, QuizCoverage } from '../lib/factCoverage'
import type { QuizQuestion } from '../lib/quiz'
import type { QuestionType } from '../lib/quizTypes'
import { CheckIcon, CloseIcon, SpinnerIcon, WarningIcon, XIcon } from './icons'

interface CoveragePanelProps {
  coverage: QuizCoverage
  questions: QuizQuestion[]
  questionType: string
  /** Full fact statements reveal answers: shown only with Show answers on. */
  showAnswers: boolean
  /** Edit view only: the "Add questions for missing facts" action. */
  onAddMissing?: () => void
  isAddingMissing?: boolean
}

const DESKTOP_QUERY = '(min-width: 640px)'

function useIsDesktop(): boolean {
  const [matches, setMatches] = useState(() => typeof window === 'undefined' || window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setMatches(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return matches
}

const STATUS_STYLE: Record<FactStatus, string> = {
  covered: 'text-success',
  partial: 'text-amber-text',
  missing: 'text-error',
}

function StatusIcon({ status }: { status: FactStatus }) {
  const className = `mt-0.5 h-4 w-4 shrink-0 ${STATUS_STYLE[status]}`
  if (status === 'covered') return <CheckIcon className={className} aria-hidden />
  if (status === 'partial') return <WarningIcon className={className} aria-hidden />
  return <XIcon className={className} aria-hidden />
}

function FactRow({ row, showAnswers }: { row: FactCoverageRow; showAnswers: boolean }) {
  const { t } = useTranslation()
  return (
    <li data-purpose="coverage-fact" data-status={row.status} className="flex items-start gap-2.5 border-b border-warm-border py-2.5 last:border-b-0">
      <StatusIcon status={row.status} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold break-words text-ink">{row.fact.label}</p>
        {showAnswers && (
          <p data-purpose="coverage-statement" className="text-xs break-words text-muted">
            {row.fact.statement}
          </p>
        )}
      </div>
      <div className="shrink-0 space-y-0.5 text-right text-xs">
        <p className={`font-semibold ${STATUS_STYLE[row.status]}`}>
          {t(`coverage.status.${row.status}`)}
          {row.edited && <span className="font-normal text-muted"> · {t('coverage.edited')}</span>}
        </p>
        <p className="text-muted">
          {row.questionNumbers.length > 0 ? t('coverage.questions', { count: row.questionNumbers.length, list: row.questionNumbers.join(', ') }) : t('coverage.noQuestions')}
        </p>
      </div>
    </li>
  )
}

/**
 * The coverage line of a quiz ("{n}/{m} key facts covered") and its panel: every fact of the facts
 * plan by its topic label, the questions that test it and its status (icon and text). Statements only
 * with Show answers on. An expandable section on desktop, a dialog on mobile.
 */
export default function CoveragePanel({ coverage, questions, questionType, showAnswers, onAddMissing, isAddingMissing = false }: CoveragePanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const panelId = useId()
  const titleId = useId()
  const summary = useMemo(() => computeCoverage(coverage, questions), [coverage, questions])
  const missing = useMemo(() => missingEntries(coverage, questions), [coverage, questions])
  const opensNewQuiz = missing.length > 0 && questions.length + slotsNeededFor(missing, questionType as QuestionType) > MAX_QUESTION_COUNT

  useEffect(() => {
    if (!open || isDesktop) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isDesktop])

  const body = (
    <>
      {!showAnswers && <p className="text-xs text-muted">{t('coverage.answersHidden')}</p>}
      <ul className="max-h-[60vh] overflow-y-auto sm:max-h-none">
        {summary.rows.map((row) => (
          <FactRow key={row.fact.id} row={row} showAnswers={showAnswers} />
        ))}
      </ul>
      {onAddMissing && missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-warm-border pt-3">
          <button
            type="button"
            onClick={onAddMissing}
            disabled={isAddingMissing}
            aria-busy={isAddingMissing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAddingMissing && <SpinnerIcon className="h-3.5 w-3.5" />}
            {isAddingMissing ? t('coverage.adding') : t('coverage.addMissing')}
          </button>
          {opensNewQuiz && <p className="text-xs text-muted">{t('coverage.newQuizHint')}</p>}
        </div>
      )}
    </>
  )

  return (
    <div data-purpose="coverage">
      <button
        type="button"
        data-testid="coverage-line"
        aria-expanded={open}
        aria-controls={isDesktop ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded text-xs text-muted hover:text-ink hover:underline"
      >
        {summary.complete && <CheckIcon className="h-3.5 w-3.5 text-success" aria-hidden />}
        {t('coverage.line', { covered: summary.covered, total: summary.total })}
      </button>

      {open && isDesktop && (
        <section id={panelId} aria-label={t('coverage.panelTitle')} className="mt-3 space-y-2 rounded-xl border border-warm-border bg-paper px-4 py-3">
          <h3 className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('coverage.panelTitle')}</h3>
          {body}
        </section>
      )}

      {open && !isDesktop && (
        <div>
          <button type="button" aria-label={t('coverage.close')} onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 space-y-2 rounded-2xl border border-warm-border bg-card p-5 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 id={titleId} className="font-serif text-base font-semibold text-navy">
                {t('coverage.panelTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('coverage.close')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-ink"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {body}
          </div>
        </div>
      )}
    </div>
  )
}
