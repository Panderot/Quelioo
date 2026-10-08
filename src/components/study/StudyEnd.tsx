import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useReducedMotion } from '../../hooks/useReducedMotion'
import { addMistakesToDeck } from '../../lib/mistakesToCards'
import type { MistakesDeckResult } from '../../lib/mistakesToCards'
import { useFlashcards } from '../../lib/flashcardStorage'
import type { ArchiveEntry } from '../../lib/archive'
import { formatDuration, percent } from '../../lib/study'
import type { QuestionRecord, StudyResults, StudySession } from '../../lib/study'
import type { StudyPrefs } from '../../lib/studyPrefs'
import { CheckIcon, CloseIcon } from '../icons'
import MathText from '../MathText'
import Confetti from './Confetti'
import { CorrectAnswer } from './StudyRun'
import ScoreChart from './ScoreChart'

interface StudyEndProps {
  entry: ArchiveEntry
  session: StudySession
  records: Record<string, QuestionRecord>
  results: StudyResults
  prefs: StudyPrefs
  onRetryWrong: () => void
  onFlaggedRound: () => void
  onAgain: () => void
  onToArchive: () => void
}

const CONFETTI_MIN_PERCENT = 80

export default function StudyEnd({ entry, session, records, results, prefs, onRetryWrong, onFlaggedRound, onAgain, onToArchive }: StudyEndProps) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const flashcards = useFlashcards()
  const [cardsResult, setCardsResult] = useState<MistakesDeckResult | null>(null)
  const questionById = new Map(entry.quiz.questions.map((question) => [question.id, question]))
  const score = percent(session.firstTry, session.total)
  const wrong = session.wrongIds.map((id) => questionById.get(id)).filter((question) => question !== undefined)
  const guessed = session.guessIds.map((id) => questionById.get(id)).filter((question) => question !== undefined)
  const flagged = session.flaggedIds.map((id) => questionById.get(id)).filter((question) => question !== undefined)
  const slowest = session.slowestId ? questionById.get(session.slowestId) : undefined
  const confetti = score >= CONFETTI_MIN_PERCENT && prefs.celebrate && !reducedMotion
  const isExam = session.kind === 'exam'

  const makeCards = () => {
    setCardsResult(
      addMistakesToDeck({
        quiz: entry.quiz,
        quizId: entry.id,
        questionIds: new Set(session.wrongIds),
        labels: {
          trueLabel: t('create.result.trueLabel'),
          falseLabel: t('create.result.falseLabel'),
          trueFalsePrefix: t('flashcards.convert.trueFalsePrefix'),
          matchPrefix: t('flashcards.convert.matchPrefix'),
        },
        deckName: t('flashcards.mistakes.deckName', { title: entry.quiz.title }),
        language: entry.outputLanguage ?? 'auto',
        flashcards,
      }),
    )
  }

  const listClasses = 'divide-y divide-warm-border rounded-xl border border-warm-border bg-card'

  return (
    <section data-purpose="study-end" className="mx-auto w-full max-w-2xl space-y-5" aria-label={t('study.end.title')}>
      {confetti && <Confetti />}

      <div className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 text-center md:p-7">
        <p className="text-[11px] font-bold tracking-wide text-amber-text uppercase">{t('study.label')}</p>
        <h2 className="font-serif text-2xl font-semibold text-navy">{t('study.end.title')}</h2>
        <p data-purpose="study-score" className="text-4xl font-bold text-ink tabular-nums">
          {t('study.end.score', { correct: session.firstTry, total: session.total })}
        </p>
        <p className="text-lg font-semibold text-amber-text">{t('study.end.percent', { percent: score })}</p>
        {session.timedOut && <p className="text-sm font-medium text-error">{t('study.end.timedOut')}</p>}
        <dl className="grid grid-cols-1 gap-2 text-sm text-muted sm:grid-cols-3">
          <div className="rounded-xl bg-paper px-3 py-2">
            <dt className="text-[11px] font-bold tracking-wide uppercase">{t('study.end.time')}</dt>
            <dd data-purpose="study-time" className="text-base font-semibold text-ink tabular-nums">
              {formatDuration(session.ms)}
            </dd>
          </div>
          {!isExam && (
            <div className="rounded-xl bg-paper px-3 py-2">
              <dt className="text-[11px] font-bold tracking-wide uppercase">{t('study.end.secondTryLabel')}</dt>
              <dd className="text-base font-semibold text-ink tabular-nums">{t('study.end.secondTry', { count: session.secondTry })}</dd>
            </div>
          )}
          {slowest && (
            <div className="min-w-0 rounded-xl bg-paper px-3 py-2">
              <dt className="text-[11px] font-bold tracking-wide uppercase">{t('study.end.slowest')}</dt>
              <dd className="truncate text-base font-semibold text-ink" title={slowest.question}>
                {formatDuration(records[slowest.id]?.ms ?? 0)} · <MathText text={slowest.question} />
              </dd>
            </div>
          )}
        </dl>
      </div>

      {wrong.length === 0 ? (
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-success">
          <CheckIcon className="h-4 w-4" />
          {t('study.end.allRight')}
        </p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-ink">{t('study.end.wrongTitle', { count: wrong.length })}</h3>
          <ul data-purpose="study-wrong-list" className={listClasses}>
            {wrong.map((question) => (
              <li key={question.id} className="space-y-1.5 p-4">
                <p className="text-sm font-semibold break-words text-ink">
                  <MathText text={question.question} />
                </p>
                <CorrectAnswer question={question} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {isExam && (
        <details open data-purpose="study-all-answers" className="rounded-xl border border-warm-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-bold text-ink">{t('study.end.allAnswers')}</summary>
          <ol className="mt-3 space-y-4">
            {entry.quiz.questions
              .filter((question) => records[question.id])
              .map((question) => (
                <li key={question.id} className="space-y-1">
                  <p className="flex items-start gap-2 text-sm font-semibold break-words text-ink">
                    {records[question.id].firstTry ? (
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label={t('create.result.checkCorrectMarkLabel')} aria-hidden={false} />
                    ) : (
                      <CloseIcon className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-label={t('create.result.checkIncorrectMarkLabel')} aria-hidden={false} />
                    )}
                    <span className="min-w-0">
                      <MathText text={question.question} />
                    </span>
                  </p>
                  <CorrectAnswer question={question} />
                  {question.explanation.trim() && (entry.includeExplanations ?? true) && (
                    <p className="text-sm break-words text-muted">
                      <MathText text={question.explanation} />
                    </p>
                  )}
                </li>
              ))}
          </ol>
        </details>
      )}

      {guessed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-ink">{t('study.end.guessedTitle', { count: guessed.length })}</h3>
          <ul data-purpose="study-guessed-list" className={listClasses}>
            {guessed.map((question) => (
              <li key={question.id} className="p-4 text-sm break-words text-ink">
                <MathText text={question.question} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {flagged.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-ink">{t('study.end.flaggedTitle', { count: flagged.length })}</h3>
          <ul data-purpose="study-flagged-list" className={listClasses}>
            {flagged.map((question) => (
              <li key={question.id} className="p-4 text-sm break-words text-ink">
                <MathText text={question.question} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-[14px] border border-warm-border bg-card p-5">
        <h3 className="text-sm font-bold text-ink">{t('study.history.title')}</h3>
        <ScoreChart results={results} />
      </div>

      {cardsResult && (
        <p role="status" data-purpose="mistakes-result" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-success">
          {cardsResult.count > 0
            ? t('flashcards.convert.added', { count: cardsResult.count, name: cardsResult.deckName })
            : t('flashcards.mistakes.allThere', { name: cardsResult.deckName })}
          <Link to={`/flashcards/${cardsResult.deckId}`} className="text-amber-text hover:underline">
            {t('flashcards.convert.openDeck')}
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        {wrong.length > 0 && (
          <button type="button" onClick={onRetryWrong} className="min-h-12 rounded-xl bg-amber px-5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover">
            {t('study.end.retryWrong', { count: wrong.length })}
          </button>
        )}
        {flagged.length > 0 && (
          <button type="button" onClick={onFlaggedRound} className="min-h-12 rounded-xl border-2 border-navy px-5 text-sm font-bold text-navy hover:bg-navy/5">
            {t('study.end.flaggedRound', { count: flagged.length })}
          </button>
        )}
        <button type="button" onClick={onAgain} className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-sm font-bold text-ink transition-colors hover:border-amber">
          {t('study.end.again')}
        </button>
        {wrong.length > 0 && (
          <button type="button" onClick={makeCards} className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-sm font-bold text-ink transition-colors hover:border-amber">
            {t('flashcards.mistakes.action', { count: wrong.length })}
          </button>
        )}
        <button type="button" onClick={onToArchive} className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-sm font-bold text-ink transition-colors hover:border-amber">
          {t('study.end.toArchive')}
        </button>
      </div>
    </section>
  )
}
