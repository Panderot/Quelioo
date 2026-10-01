import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import type { QuizPair } from '../lib/quiz'
import { buildAnswerKeyLine, checkMatchingAnswer, letterFor } from '../lib/matching'
import type { MatchingCheckResult } from '../lib/matching'
import MathText from './MathText'
import { HintBox, HintButton } from './HintControls'
import { CheckIcon, CloseIcon } from './icons'

interface MatchingColumnsProps {
  pairs: QuizPair[]
  rightOrder: number[]
  showAnswers: boolean
  hints?: string[]
  /** Fires once, the first time the student completes a full check (right or wrong) — used to
   * unlock the "Show explanation" link without spoiling it before then. */
  onFirstCheck?: () => void
  /** Fires every time a complete check is run (students may recheck after editing their answer) —
   * used by Study Mode to auto-grade the question from the latest check. */
  onGraded?: (allCorrect: boolean) => void
  onHintUsed?: () => void
}

/** Two-column matching display with a checkable student answer field, shared by the editable
 * result view and Study Mode so both use the same shuffle, layout and checking behavior. */
export default function MatchingColumns({ pairs, rightOrder, showAnswers, hints = [], onFirstCheck, onGraded, onHintUsed }: MatchingColumnsProps) {
  const { t } = useTranslation()
  const [answerText, setAnswerText] = useState('')
  const [result, setResult] = useState<MatchingCheckResult | null>(null)
  const [hasCheckedOnce, setHasCheckedOnce] = useState(false)
  const [revealedHints, setRevealedHints] = useState(0)

  // A stable signature of the actual pair content (not the array reference) — resets the
  // student's in-progress answer and check state when the question is edited, regenerated or
  // replaced, without resetting on every unrelated re-render.
  const pairsSignature = useMemo(() => pairs.map((pair) => `${pair.left}\u0000${pair.right}`).join('\u0001') + '|' + rightOrder.join(','), [pairs, rightOrder])

  // Adjust state during render (React's recommended alternative to an effect here) rather than
  // in a useEffect, so the reset is applied before this render commits instead of after an extra pass.
  const [prevSignature, setPrevSignature] = useState(pairsSignature)
  if (prevSignature !== pairsSignature) {
    setPrevSignature(pairsSignature)
    setAnswerText('')
    setResult(null)
    setHasCheckedOnce(false)
    setRevealedHints(0)
  }

  const runCheck = () => {
    const outcome = checkMatchingAnswer(answerText, pairs.length, rightOrder)
    setResult(outcome)
    if (outcome.status === 'checked') {
      if (!hasCheckedOnce) {
        setHasCheckedOnce(true)
        onFirstCheck?.()
      }
      onGraded?.(outcome.allCorrect)
    }
  }

  const handleAnswerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      runCheck()
    }
  }

  const perPairCorrect = result?.status === 'checked' ? result.perPairCorrect : null

  const boxClasses = (revealed: boolean) =>
    `flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm break-words ${
      revealed ? 'border-amber/40 bg-amber/12 font-semibold text-ink' : 'border-warm-border text-ink'
    }`

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4">
        <ol className="space-y-2">
          {pairs.map((pair, index) => (
            <li key={index} className={boxClasses(showAnswers)}>
              <span className="shrink-0 font-bold text-muted">{index + 1}.</span>
              <span className="min-w-0 flex-1">
                <MathText text={pair.left} />
              </span>
              {showAnswers && <CheckIcon className="h-4 w-4 shrink-0 text-amber-hover" />}
              {perPairCorrect &&
                (perPairCorrect[index] ? (
                  <CheckIcon
                    className="h-4 w-4 shrink-0 text-success"
                    aria-label={t('create.result.matchingCorrectMarkLabel')}
                    aria-hidden={false}
                  />
                ) : (
                  <CloseIcon
                    className="h-4 w-4 shrink-0 text-error"
                    aria-label={t('create.result.matchingIncorrectMarkLabel')}
                    aria-hidden={false}
                  />
                ))}
            </li>
          ))}
        </ol>
        <ol className="space-y-2">
          {rightOrder.map((pairIndex, position) => (
            <li key={position} className={boxClasses(showAnswers)}>
              <span className="shrink-0 font-bold text-muted">{letterFor(position)}.</span>
              <span className="min-w-0 flex-1">
                <MathText text={pairs[pairIndex].right} />
              </span>
              {showAnswers && <span className="shrink-0 text-xs font-bold text-amber-text">&rarr; {pairIndex + 1}</span>}
            </li>
          ))}
        </ol>
      </div>

      {!showAnswers && <p className="text-xs text-muted">{t('create.result.matchingHint')}</p>}

      <div className="space-y-1.5" data-print-hide>
        <div className="flex items-start gap-2">
          <textarea
            rows={2}
            value={answerText}
            onChange={(event) => setAnswerText(event.target.value)}
            onKeyDown={handleAnswerKeyDown}
            placeholder={t('create.result.matchingAnswerPlaceholder')}
            className="min-w-0 flex-1 resize-none rounded-xl border border-warm-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-solid"
          />
          <HintButton
            hints={hints}
            revealedCount={revealedHints}
            onReveal={() => {
              setRevealedHints((count) => Math.min(hints.length, count + 1))
              onHintUsed?.()
            }}
            hidden={showAnswers || (result?.status === 'checked' && result.allCorrect)}
          />
          <button
            type="button"
            onClick={runCheck}
            title={t('create.result.matchingCheckLabel')}
            aria-label={t('create.result.matchingCheckLabel')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber text-amber-hover transition-colors hover:bg-amber/12"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        </div>

        <HintBox hints={hints} revealedCount={revealedHints} />

        <div aria-live="polite">
          {result?.status === 'unreadable' && <p className="text-xs font-medium text-muted">{t('create.result.matchingHintUnreadable')}</p>}
          {result?.status === 'incomplete' && (
            <p className="text-xs font-medium text-muted">{t('create.result.matchingHintIncomplete', { n: pairs.length })}</p>
          )}
          {result?.status === 'checked' &&
            (result.allCorrect ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <CheckIcon className="h-3.5 w-3.5" />
                {t('create.result.matchingResultCorrect')}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
                <CloseIcon className="h-3.5 w-3.5" />
                {t('create.result.matchingResultIncorrect')}
              </p>
            ))}
        </div>
      </div>

      {showAnswers && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-bold tracking-wide text-amber-text">{buildAnswerKeyLine(rightOrder)}</p>
          <ul className="space-y-1 text-sm break-words text-ink">
            {pairs.map((pair, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="font-semibold">
                  <MathText text={pair.left} />
                </span>
                <span className="shrink-0 text-muted">&rarr;</span>
                <span>
                  <MathText text={pair.right} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
