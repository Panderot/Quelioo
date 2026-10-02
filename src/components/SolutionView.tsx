import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { SolveResult } from '../api/solve'
import type { CheckWorkResult } from '../api/checkWork'
import { ANOTHER_WAY_KEY, CHECK_WORK_KEY, readAnotherWay, readCheckWork, readSimilarItems, SIMILAR_PROBLEMS_KEY } from '../lib/solutionExtras'
import type { SimilarItem, StoredAnotherWay } from '../lib/solutionExtras'
import { updateSolutionExtras } from '../lib/solutionStorage'
import { readStepExplanations, STEP_EXPLANATIONS_KEY, withExplanation } from '../lib/stepExplanations'
import type { StepExplanationCache } from '../lib/stepExplanations'
import { generateCards } from '../api/cards'
import AddCardsDialog from './flashcards/AddCardsDialog'
import AnotherWayPanel from './AnotherWayPanel'
import CheckWorkPanel from './CheckWorkPanel'
import ExplainableSteps from './ExplainableSteps'
import MathText from './MathText'
import MoreMenu from './MoreMenu'
import SimilarProblems from './SimilarProblems'
import type { PanelHandle } from './SimilarProblems'
import { CheckIcon, RefreshIcon, WarningIcon } from './icons'

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

type ExtraKey = typeof STEP_EXPLANATIONS_KEY | typeof SIMILAR_PROBLEMS_KEY | typeof ANOTHER_WAY_KEY | typeof CHECK_WORK_KEY

/** Plain-text version of a solution, used as the source for "Make flashcards". */
function solutionSourceText(result: SolveResult): string {
  return [
    result.topic,
    result.question,
    result.intro,
    ...result.steps.map((step, index) => `${index + 1}. ${step}`),
    result.answer && `Answer: ${result.answer}`,
    result.tip && `Tip: ${result.tip}`,
    ...result.mistakes.map((mistake) => `Common mistake: ${mistake}`),
  ]
    .filter(Boolean)
    .join('\n')
}

interface SolutionViewProps {
  result: SolveResult
  /** Id of the saved Solutions record, once known — explanations, similar problems and the other method are saved into it. */
  solutionId?: string | null
  /** The saved record's extras (reopened from the Archive). */
  initialExtras?: Record<string, unknown>
  className?: string
  /** Extra content between the solution card and its actions (e.g. a storage note). */
  children?: ReactNode
}

/** The one rendering of a solved problem — used right after solving and when reopening a saved
 * solution from the Archive, so every action here works in both places. */
export default function SolutionView({ result, solutionId = null, initialExtras, className = '', children }: SolutionViewProps) {
  const { t } = useTranslation()
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

  // ---- Data saved into the Solutions record ----
  const [explanations, setExplanations] = useState<StepExplanationCache>(() => readStepExplanations(initialExtras, stepCount))
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>(() => readSimilarItems(initialExtras))
  const [anotherWay, setAnotherWay] = useState<StoredAnotherWay | null>(() => readAnotherWay(initialExtras))
  const [checkWork, setCheckWork] = useState<CheckWorkResult | null>(() => readCheckWork(initialExtras))
  // Only keys changed in this view are written back — not what was just loaded.
  const dirtyRef = useRef(new Set<ExtraKey>())

  const markDirty = (key: ExtraKey) => dirtyRef.current.add(key)

  // Persist into the Solutions record; also catches up on changes made before the save finished.
  useEffect(() => {
    if (!solutionId) return
    const values: Record<ExtraKey, unknown> = {
      [STEP_EXPLANATIONS_KEY]: explanations,
      [SIMILAR_PROBLEMS_KEY]: similarItems,
      [ANOTHER_WAY_KEY]: anotherWay,
      [CHECK_WORK_KEY]: checkWork,
    }
    for (const key of dirtyRef.current) {
      void updateSolutionExtras(solutionId, key, values[key]).catch(() => {
        // Storage full/unavailable — everything still works for this view from memory.
      })
    }
  }, [solutionId, explanations, similarItems, anotherWay, checkWork])

  // ---- Actions ----
  const similarRef = useRef<PanelHandle>(null)
  const anotherWayRef = useRef<PanelHandle>(null)
  const checkWorkRef = useRef<PanelHandle>(null)

  const handleCreateQuiz = () => {
    const prefillText = buildQuizPrefillText(result, {
      topic: t('solve.prefill.topicLabel'),
      question: t('solve.prefill.questionLabel'),
      steps: t('solve.prefill.stepsLabel'),
      answer: t('solve.prefill.answerLabel'),
    })
    navigate('/', { state: { prefillText } })
  }

  const outlineAction =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber sm:w-auto'

  // "Make flashcards": the whole solution is the source text for /api/cards (solution mode).
  const [flashcardsOpen, setFlashcardsOpen] = useState(false)
  const generateSolutionCards = useCallback(
    (signal: AbortSignal) =>
      generateCards({ mode: 'solution', text: solutionSourceText(result), language: 'auto', avoid: [] }, signal),
    [result],
  )

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

        <ExplainableSteps
          question={result.question}
          steps={result.steps}
          answer={result.answer}
          visibleCount={visibleSteps}
          explanations={explanations}
          onExplained={(stepIndex, level, explanation) => {
            markDirty(STEP_EXPLANATIONS_KEY)
            setExplanations((current) => withExplanation(current, stepIndex, level, explanation))
          }}
          registerStep={(index, element) => {
            stepRefs.current[index] = element
          }}
        />

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

      {/* At most three actions in a row; the rest live in the More menu. Stacks below 640px. */}
      <div data-purpose="solution-actions" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
        <button type="button" onClick={() => checkWorkRef.current?.open()} className={outlineAction}>
          <CheckIcon className="h-4 w-4" />
          {t('solve.actions.checkWork')}
        </button>
        <button type="button" onClick={() => similarRef.current?.open()} className={outlineAction}>
          <RefreshIcon className="h-4 w-4" />
          {t('solve.actions.similar')}
        </button>
        <MoreMenu
          items={[
            {
              key: 'another-way',
              label: t('solve.actions.anotherWay'),
              onSelect: () => anotherWayRef.current?.open(),
            },
            {
              key: 'create-quiz',
              label: t('solve.cta.createQuiz'),
              onSelect: handleCreateQuiz,
            },
            {
              key: 'flashcards',
              label: t('flashcards.solution.action'),
              onSelect: () => setFlashcardsOpen(true),
            },
          ]}
        />
      </div>

      {flashcardsOpen && (
        <AddCardsDialog
          title={t('flashcards.solution.action')}
          defaultDeckName={result.topic || t('flashcards.untitledDeck')}
          source="solution"
          sourceRef={solutionId}
          generate={generateSolutionCards}
          onClose={() => setFlashcardsOpen(false)}
        />
      )}

      <CheckWorkPanel
        ref={checkWorkRef}
        source={result}
        value={checkWork}
        onChange={(value) => {
          markDirty(CHECK_WORK_KEY)
          setCheckWork(value)
        }}
      />

      <SimilarProblems
        ref={similarRef}
        source={result}
        items={similarItems}
        onItemsChange={(update) => {
          markDirty(SIMILAR_PROBLEMS_KEY)
          setSimilarItems(update)
        }}
      />

      <AnotherWayPanel
        ref={anotherWayRef}
        source={result}
        value={anotherWay}
        onChange={(value) => {
          markDirty(ANOTHER_WAY_KEY)
          setAnotherWay(value)
        }}
      />

      <p className="text-center text-xs text-muted">{t('solve.footerNote')}</p>
    </div>
  )
}
