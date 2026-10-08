import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useIsPageActive } from '../../hooks/usePageActive'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useSpeech } from '../../hooks/useSpeech'
import { getKeyPoints, otherShortAnswers } from '../../lib/quiz'
import type { QuizQuestion } from '../../lib/quiz'
import { getRightOrder, letterFor } from '../../lib/matching'
import { mathToPlainText } from '../../lib/mathPlain'
import { getHints } from '../../lib/hints'
import {
  buildSession,
  emptyAnswer,
  evaluateAnswer,
  formatClock,
  hasAnswer,
  matchingKey,
  newRecord,
  newSessionId,
  speechLanguage,
} from '../../lib/study'
import type { AnswerValue, Confidence, EvalContext, QuestionRecord, StudyKind, StudyResume, StudySession, TimerSetting } from '../../lib/study'
import type { StudyPrefs } from '../../lib/studyPrefs'
import type { ArchiveEntry } from '../../lib/archive'
import { CheckIcon, ClockIcon, CloseIcon, LightbulbIcon, SpinnerIcon, VolumeIcon } from '../icons'
import { HintBox } from '../HintControls'
import MathText from '../MathText'
import StudyAnswerInput from './StudyAnswerInput'
import type { OptionMark } from './StudyAnswerInput'

export interface RunSummary {
  session: StudySession
  qids: string[]
  records: Record<string, QuestionRecord>
}

interface StudyRunProps {
  entry: ArchiveEntry
  kind: StudyKind
  scope: 'full' | 'subset'
  qids: string[]
  timer: TimerSetting
  initial?: StudyResume
  prefs: StudyPrefs
  focus: boolean
  onToggleFocus: () => void
  onPrefsChange: (prefs: StudyPrefs) => void
  onSaveResume: (resume: StudyResume) => void
  onFinish: (summary: RunSummary) => void
  onExit: () => void
}

const TICK_MS = 250
const STREAK_PULSE_EVERY = 3

const isTwoChoice = (question: QuizQuestion | undefined) =>
  question?.type === 'true-false' || (question?.type === 'mcq' && question.options.length === 2)

type Feedback ={ status: 'retry' | 'correct' | 'revealed'; text?: string } | null

export default function StudyRun({ entry, kind, scope, qids, timer, initial, prefs, focus, onToggleFocus, onPrefsChange, onSaveResume, onFinish, onExit }: StudyRunProps) {
  const { t, i18n } = useTranslation()
  const pageActive = useIsPageActive()
  const reducedMotion = useReducedMotion()
  const questions = useMemo(
    () => qids.map((id) => entry.quiz.questions.find((question) => question.id === id)).filter((question): question is QuizQuestion => question !== undefined),
    [entry.quiz.questions, qids],
  )
  const total = questions.length
  const isExam = kind === 'exam'
  const outputLanguage = entry.outputLanguage ?? 'auto'

  const [index, setIndex] = useState(() => Math.min(initial?.index ?? 0, Math.max(0, total - 1)))
  const [records, setRecords] = useState<Record<string, QuestionRecord>>(() => initial?.records ?? {})
  const [value, setValue] = useState<AnswerValue>(() => emptyAnswer(questions[Math.min(initial?.index ?? 0, Math.max(0, total - 1))]))
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(initial?.elapsedMs ?? 0)
  const [questionMs, setQuestionMs] = useState(0)
  const [streak, setStreak] = useState(initial?.streak ?? 0)
  const [pulseKey, setPulseKey] = useState(0)
  const [hintsShown, setHintsShown] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const question = questions[index]
  const record = records[question?.id ?? ''] ?? newRecord()
  const settingsRef = useRef<HTMLDivElement>(null)

  // Everything the timers and key handlers need, without re-creating them on every render.
  const live = useRef({ index, records, value, elapsedMs, questionMs, streak, finishing })
  useEffect(() => {
    live.current = { index, records, value, elapsedMs, questionMs, streak, finishing }
  })

  const context = useMemo<EvalContext>(
    () => ({ outputLanguage, otherAnswers: question ? otherShortAnswers(entry.quiz.questions, question.id) : [] }),
    [outputLanguage, entry.quiz.questions, question],
  )

  const speechLang = speechLanguage(outputLanguage, i18n.language, question?.question ?? '')
  const speech = useSpeech(speechLang)
  const stopSpeech = speech.stop

  const persist = useCallback(
    (nextIndex: number, nextRecords: Record<string, QuestionRecord>, nextStreak: number, nextElapsed: number) => {
      onSaveResume({ kind, scope, qids, index: nextIndex, records: nextRecords, elapsedMs: Math.round(nextElapsed), timer, streak: nextStreak })
    },
    [kind, scope, qids, timer, onSaveResume],
  )

  const updateRecord = useCallback((id: string, patch: Partial<QuestionRecord>) => {
    setRecords((current) => ({ ...current, [id]: { ...(current[id] ?? newRecord()), ...patch } }))
  }, [])

  // ---- finishing -------------------------------------------------------------------------------

  const finish = useCallback(
    async (timedOut: boolean) => {
      if (live.current.finishing) return
      live.current.finishing = true
      setFinishing(true)
      stopSpeech()
      let finalRecords = { ...live.current.records }
      const currentQuestion = questions[live.current.index]
      if (isExam && currentQuestion) {
        const current = finalRecords[currentQuestion.id] ?? newRecord()
        if (!current.done) finalRecords[currentQuestion.id] = { ...current, answer: live.current.value, ms: live.current.questionMs, done: true }
      }
      if (isExam) {
        // Nothing was checked during the exam: grade every given answer now.
        const graded = await Promise.all(
          questions.map(async (item) => {
            const given = finalRecords[item.id]
            if (!given || given.answer === undefined || !hasAnswer(item, given.answer)) return [item.id, { ...(given ?? newRecord()), done: true }] as const
            const correct = await evaluateAnswer(item, given.answer, { outputLanguage, otherAnswers: otherShortAnswers(entry.quiz.questions, item.id) }).then(
              (outcome) => outcome.status === 'correct',
              () => false,
            )
            return [item.id, { ...given, attempts: 1, firstTry: correct, correct, done: true }] as const
          }),
        )
        finalRecords = Object.fromEntries(graded)
      }
      const session = buildSession({
        id: newSessionId(),
        at: new Date().toISOString(),
        kind,
        scope,
        qids,
        records: finalRecords,
        ms: live.current.elapsedMs,
        timedOut,
      })
      onFinish({ session, qids, records: finalRecords })
    },
    [questions, isExam, outputLanguage, entry.quiz.questions, kind, scope, qids, onFinish, stopSpeech],
  )

  // ---- moving on ------------------------------------------------------------------------------

  const goTo = useCallback(
    (nextIndex: number, nextRecords: Record<string, QuestionRecord>) => {
      stopSpeech()
      setIndex(nextIndex)
      setValue(emptyAnswer(questions[nextIndex]))
      setFeedback(null)
      setCheckError(false)
      setQuestionMs(0)
      setHintsShown(0)
      persist(nextIndex, nextRecords, live.current.streak, live.current.elapsedMs)
    },
    [questions, persist, stopSpeech],
  )

  const next = useCallback(() => {
    if (!question || live.current.finishing) return
    let nextRecords = live.current.records
    if (isExam) {
      const current = nextRecords[question.id] ?? newRecord()
      nextRecords = { ...nextRecords, [question.id]: { ...current, answer: live.current.value, ms: live.current.questionMs, done: true } }
      setRecords(nextRecords)
    } else if (!(nextRecords[question.id]?.done ?? false)) {
      return
    }
    if (live.current.index + 1 >= total) {
      if (isExam) live.current.records = nextRecords
      void finish(false)
      return
    }
    goTo(live.current.index + 1, nextRecords)
  }, [question, isExam, total, finish, goTo])

  // ---- checking (normal / quick) ----------------------------------------------------------------

  const applyOutcome = useCallback(
    (outcomeStatus: 'correct' | 'partial' | 'incorrect', text?: string) => {
      if (!question) return
      const current = live.current.records[question.id] ?? newRecord()
      const attempts = current.attempts + 1
      const ms = live.current.questionMs
      let patch: Partial<QuestionRecord>
      let nextStreak: number
      let nextFeedback: Feedback
      if (outcomeStatus === 'correct') {
        patch = { attempts, firstTry: attempts === 1, correct: true, done: true, ms }
        nextStreak = attempts === 1 ? live.current.streak + 1 : 0
        nextFeedback = { status: 'correct', text }
      } else if (attempts >= 2 || isTwoChoice(question)) {
        patch = { attempts, firstTry: false, correct: false, revealed: true, done: true, ms }
        nextStreak = 0
        nextFeedback = { status: 'revealed', text }
      } else {
        patch = { attempts }
        nextStreak = 0
        nextFeedback = { status: 'retry', text }
      }
      const nextRecords = { ...live.current.records, [question.id]: { ...current, ...patch, hints: current.hints } }
      setRecords(nextRecords)
      setStreak(nextStreak)
      setFeedback(nextFeedback)
      if (nextStreak > 0 && nextStreak % STREAK_PULSE_EVERY === 0) setPulseKey((key) => key + 1)
      if (patch.done) {
        live.current.records = nextRecords
        live.current.streak = nextStreak
        persist(Math.min(live.current.index + 1, total - 1), nextRecords, nextStreak, live.current.elapsedMs)
      }
    },
    [question, persist, total],
  )

  const check = useCallback(async () => {
    if (!question || isExam || checking || live.current.finishing) return
    const current = live.current.records[question.id]
    if (current?.done || !hasAnswer(question, live.current.value)) return
    setChecking(true)
    setCheckError(false)
    try {
      const outcome = await evaluateAnswer(question, live.current.value, context)
      applyOutcome(outcome.status, outcome.feedback)
    } catch {
      setCheckError(true)
    } finally {
      setChecking(false)
    }
  }, [question, isExam, checking, context, applyOutcome])

  const timeOutQuestion = useCallback(() => {
    if (!question) return
    if (isExam) {
      next()
      return
    }
    const current = live.current.records[question.id] ?? newRecord()
    if (current.done) return
    const nextRecords = {
      ...live.current.records,
      [question.id]: { ...current, firstTry: false, correct: false, revealed: true, timedOut: true, done: true, ms: live.current.questionMs },
    }
    live.current.records = nextRecords
    live.current.streak = 0
    setRecords(nextRecords)
    setStreak(0)
    setFeedback({ status: 'revealed' })
    persist(Math.min(live.current.index + 1, total - 1), nextRecords, 0, live.current.elapsedMs)
  }, [question, isExam, next, persist, total])

  // ---- clock -----------------------------------------------------------------------------------

  useEffect(() => {
    if (!pageActive || finishing) return undefined
    let last = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = Math.min(now - last, 2000)
      last = now
      if (document.hidden) return
      setElapsedMs((current) => current + delta)
      if (!(live.current.records[questions[live.current.index]?.id ?? '']?.done ?? false)) setQuestionMs((current) => current + delta)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [pageActive, finishing, questions])

  const totalRemainingMs = timer.mode === 'total' ? timer.totalSeconds * 1000 - elapsedMs : null
  const questionRemainingMs = timer.mode === 'question' ? timer.questionSeconds * 1000 - questionMs : null

  useEffect(() => {
    if (totalRemainingMs !== null && totalRemainingMs <= 0 && !finishing) void finish(true)
  }, [totalRemainingMs, finishing, finish])

  useEffect(() => {
    if (questionRemainingMs !== null && questionRemainingMs <= 0 && !finishing && !record.done) timeOutQuestion()
  }, [questionRemainingMs, finishing, record.done, timeOutQuestion])

  // ---- keyboard --------------------------------------------------------------------------------

  useEffect(() => {
    if (!pageActive) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      const inField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      const state = live.current
      const current = questions[state.index]
      if (!current || state.finishing) return
      const done = state.records[current.id]?.done ?? false
      if (event.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false)
        return
      }
      if (inField) return
      if (event.key === 'Enter' || event.key === 'ArrowRight') {
        if (target?.tagName === 'BUTTON' && event.key === 'Enter') return
        event.preventDefault()
        if (isExam || done) next()
        else void check()
        return
      }
      if (done && !isExam) return
      if (current.type === 'mcq') {
        const pressed = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : /^[a-z]$/i.test(event.key) ? event.key.toUpperCase().charCodeAt(0) - 65 : -1
        if (pressed >= 0 && pressed < current.options.length) {
          event.preventDefault()
          setValue(pressed)
          setFeedback(null)
        }
      } else if (current.type === 'true-false') {
        const key = event.key.toLowerCase()
        if (key === '1' || key === 'a') setValue(true)
        else if (key === '2' || key === 'b') setValue(false)
        else return
        event.preventDefault()
        setFeedback(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pageActive, questions, isExam, next, check, settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const close = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [settingsOpen])

  // The page is hidden behind another route: stop reading aloud.
  useEffect(() => {
    if (!pageActive) stopSpeech()
  }, [pageActive, stopSpeech])

  // ---- render ----------------------------------------------------------------------------------

  if (!question) return null

  // Two-choice questions (true/false, 2-option multiple choice): a guess is 50%, so no hints and no second try.
  const hints = isTwoChoice(question) ? [] : getHints(question)
  const done = record.done
  const mark: OptionMark = !done && feedback?.status !== 'retry' ? 'none' : record.correct ? 'correct' : 'wrong'
  const inputDisabled = checking || (done && !isExam)
  const canCheck = hasAnswer(question, value) && !checking
  const isLast = index + 1 >= total
  const progressDone = index + (done ? 1 : 0)

  const readAloud = () => {
    if (speech.speaking) {
      stopSpeech()
      return
    }
    const parts = [mathToPlainText(question.question)]
    if (question.type === 'mcq') question.options.forEach((option, i) => parts.push(`${String.fromCharCode(65 + i)}. ${mathToPlainText(option)}`))
    else if (question.type === 'true-false') parts.push(`${t('create.result.trueLabel')}. ${t('create.result.falseLabel')}.`)
    else if (question.type === 'matching') {
      question.pairs.forEach((pair, i) => parts.push(`${i + 1}. ${mathToPlainText(pair.left)}`))
      getRightOrder(question).forEach((pairIndex, position) => parts.push(`${letterFor(position)}. ${mathToPlainText(question.pairs[pairIndex].right)}`))
    }
    speech.speak(parts.join('. '))
  }

  const clock = totalRemainingMs !== null ? totalRemainingMs : questionRemainingMs
  const lowTime = clock !== null && clock <= 10_000
  const animate = prefs.celebrate && !reducedMotion

  return (
    <section data-purpose="study-run" className="mx-auto w-full max-w-2xl space-y-4" aria-label={t('study.label')}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-warm-border bg-card px-3.5 text-sm font-bold text-ink transition-colors hover:border-amber"
          >
            <CloseIcon className="h-4 w-4" />
            {t('study.exit')}
          </button>
          <span className="rounded-full bg-amber/12 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-text uppercase">{t('study.label')}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {clock !== null && (
              <span
                role="timer"
                aria-label={t('study.timer.remaining')}
                className={`flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold tabular-nums ${lowTime ? 'border-error/50 text-error' : 'border-warm-border text-ink'}`}
              >
                <ClockIcon className="h-4 w-4" />
                {formatClock(clock)}
              </span>
            )}
            {streak > 0 && (
              <span
                key={pulseKey}
                data-purpose="study-streak"
                data-animate={animate ? 'true' : 'false'}
                className={`flex min-h-10 items-center rounded-xl bg-amber/15 px-3 text-sm font-bold text-amber-text ${animate && pulseKey > 0 ? 'animate-streak' : ''}`}
              >
                {t('study.run.streak', { count: streak })}
              </span>
            )}
            {speech.available && (
              <button
                type="button"
                onClick={readAloud}
                aria-pressed={speech.speaking}
                aria-label={speech.speaking ? t('study.run.stopReading') : t('study.run.readAloud')}
                title={speech.speaking ? t('study.run.stopReading') : t('study.run.readAloud')}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${speech.speaking ? 'border-amber bg-amber/12 text-amber-hover' : 'border-warm-border bg-card text-muted hover:border-amber'}`}
              >
                <VolumeIcon className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleFocus}
              aria-pressed={focus}
              className="min-h-10 rounded-xl border border-warm-border bg-card px-3 text-xs font-bold text-ink transition-colors hover:border-amber"
            >
              {focus ? t('study.chrome.focusExit') : t('study.chrome.focus')}
            </button>
            <div ref={settingsRef} className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                aria-expanded={settingsOpen}
                aria-haspopup="true"
                className="min-h-10 rounded-xl border border-warm-border bg-card px-3 text-xs font-bold text-ink transition-colors hover:border-amber"
              >
                {t('study.chrome.settings')}
              </button>
              {settingsOpen && (
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-warm-border bg-card p-3 shadow-lg">
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={prefs.celebrate}
                      onChange={(event) => onPrefsChange({ ...prefs, celebrate: event.target.checked })}
                      className="h-5 w-5 accent-amber"
                    />
                    {t('study.chrome.celebrate')}
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 truncate font-serif text-lg font-semibold text-navy">{entry.quiz.title}</h2>
            <p data-purpose="study-progress" className="shrink-0 text-sm font-bold text-ink tabular-nums" aria-label={t('study.run.progressLabel', { current: index + 1, total })}>
              {index + 1} / {total}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-warm-border/60" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={progressDone}>
            <div className="h-full rounded-full bg-amber transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(progressDone / total) * 100}%` }} />
          </div>
        </div>
      </header>

      <article data-purpose="study-question" className="space-y-5 rounded-[14px] border border-warm-border bg-card p-5 md:p-7">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-amber/12 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-text uppercase">{t(TYPE_LABEL_KEYS[question.type])}</span>
          <button
            type="button"
            onClick={() => updateRecord(question.id, { flagged: !record.flagged })}
            aria-pressed={record.flagged}
            className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold transition-colors ${record.flagged ? 'border-amber bg-amber/15 text-amber-text' : 'border-warm-border text-muted hover:border-amber'}`}
          >
            {record.flagged ? t('study.run.flagged') : t('study.run.flag')}
          </button>
        </div>

        <p className="text-xl leading-snug font-semibold break-words text-ink">
          <MathText text={question.question} />
        </p>

        {isExam && <p className="text-xs text-muted">{t('study.run.examNote')}</p>}

        <StudyAnswerInput
          key={question.id}
          question={question}
          value={value}
          onChange={(next) => {
            setValue(next)
            if (feedback?.status === 'retry') setFeedback(null)
            setCheckError(false)
          }}
          onSubmit={() => (isExam ? next() : void check())}
          disabled={inputDisabled}
          mark={mark}
          revealCorrect={done && !record.correct && !isExam}
        />

        {!isExam && !done && hints.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={hintsShown >= hints.length}
              onClick={() => {
                setHintsShown((count) => Math.min(hints.length, count + 1))
                updateRecord(question.id, { hints: Math.min(hints.length, hintsShown + 1) })
              }}
              className="flex min-h-10 items-center gap-2 rounded-xl border border-warm-border px-3.5 text-sm font-semibold text-ink transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LightbulbIcon className="h-4 w-4" />
              {hintsShown === 0 ? t('create.result.hint') : hintsShown >= hints.length ? t('create.result.noMoreHints') : t('create.result.anotherHint')}
            </button>
            <HintBox hints={hints} revealedCount={hintsShown} />
          </div>
        )}

        <div aria-live="polite" className="space-y-3">
          {checkError && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-sm font-medium text-error">
              {t('create.result.checkError')}
              <button type="button" onClick={() => void check()} className="font-semibold underline">
                {t('create.errors.retry')}
              </button>
            </p>
          )}

          {!isExam && feedback?.status === 'retry' && !done && (
            <div className="space-y-1 rounded-xl border border-error/30 bg-error/10 p-3.5">
              <p className="flex items-center gap-2 text-sm font-bold text-error">
                <CloseIcon className="h-4 w-4" />
                {t('create.result.checkIncorrect')}
              </p>
              {feedback.text && <p className="text-sm break-words text-muted">{feedback.text}</p>}
              {hints.length > 0 && hintsShown < hints.length && <p className="text-sm text-muted">{t('study.run.tryHint')}</p>}
            </div>
          )}

          {!isExam && done && (
            <div
              data-purpose="study-feedback"
              data-state={record.correct ? 'correct' : 'revealed'}
              className={`space-y-2 rounded-xl border p-3.5 ${record.correct ? 'border-success/40 bg-success/10' : 'border-warm-border bg-paper'}`}
            >
              {record.correct ? (
                <p className="flex items-center gap-2 text-base font-bold text-success">
                  <CheckIcon className="h-5 w-5" />
                  {t('study.run.correct')}
                  {!record.firstTry && <span className="text-xs font-semibold text-muted">· {t('study.run.secondTry')}</span>}
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-base font-bold text-ink">
                    {record.timedOut ? <ClockIcon className="h-5 w-5" /> : <CloseIcon className="h-5 w-5 text-error" />}
                    {record.timedOut ? t('study.run.timeUp') : t('study.run.revealedTitle')}
                  </p>
                  <CorrectAnswer question={question} />
                </>
              )}
              {feedback?.text && record.correct && <p className="text-sm break-words text-muted">{feedback.text}</p>}
              {question.explanation.trim() && (entry.includeExplanations ?? true) && (
                <div className="border-t border-warm-border pt-2">
                  <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('create.result.explanationLabel')}</p>
                  <p className="mt-1 text-sm break-words text-ink">
                    <MathText text={question.explanation} />
                  </p>
                </div>
              )}
              {record.correct && (
                <div className="flex flex-wrap items-center gap-2 border-t border-warm-border pt-2" role="group" aria-label={t('study.run.confidenceQuestion')}>
                  <span className="text-xs font-semibold text-muted">{t('study.run.confidenceQuestion')}</span>
                  {(['sure', 'guess'] as Confidence[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={record.confidence === level}
                      onClick={() => updateRecord(question.id, { confidence: record.confidence === level ? undefined : level })}
                      className={`min-h-10 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${record.confidence === level ? 'border-amber bg-amber/15 text-amber-text' : 'border-warm-border text-ink hover:border-amber'}`}
                    >
                      {level === 'sure' ? t('study.run.sure') : t('study.run.guess')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {isExam || done ? (
            <button
              type="button"
              onClick={next}
              disabled={finishing}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber px-6 text-base font-bold text-navy transition-colors hover:bg-amber-hover disabled:opacity-60 sm:w-auto"
            >
              {finishing && <SpinnerIcon className="h-4 w-4" />}
              {isLast ? t('study.run.finish') : t('study.run.next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void check()}
              disabled={!canCheck}
              aria-busy={checking}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber px-6 text-base font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber sm:w-auto"
            >
              {checking && <SpinnerIcon className="h-4 w-4" />}
              {checking ? t('study.run.checking') : t('study.run.check')}
            </button>
          )}
        </div>
      </article>

      {finishing && isExam && (
        <p role="status" className="text-center text-sm font-semibold text-muted">
          {t('study.run.gradingExam')}
        </p>
      )}
    </section>
  )
}

const TYPE_LABEL_KEYS: Record<QuizQuestion['type'], string> = {
  mcq: 'create.question.type.mcq',
  'true-false': 'create.question.type.trueFalse',
  'fill-blanks': 'create.question.type.fillBlanks',
  'short-answer': 'create.question.type.shortAnswer',
  matching: 'create.question.type.matching',
  'open-ended': 'create.question.type.openEnded',
}

/** The right answer of a question, as text, for the revealed state and the end screen. */
export function CorrectAnswer({ question }: { question: QuizQuestion }) {
  const { t } = useTranslation()
  const label = <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('study.run.rightAnswer')}</span>
  switch (question.type) {
    case 'mcq':
      return (
        <p className="text-base break-words text-ink">
          {label} <span className="font-semibold">{String.fromCharCode(65 + question.answerIndex)}. </span>
          <MathText text={question.options[question.answerIndex] ?? ''} />
        </p>
      )
    case 'true-false':
      return (
        <p className="text-base text-ink">
          {label} <span className="font-semibold">{question.answerBool ? t('create.result.trueLabel') : t('create.result.falseLabel')}</span>
        </p>
      )
    case 'matching': {
      const key = matchingKey(question)
      return (
        <div className="space-y-1">
          {label}
          <ul className="space-y-0.5 text-sm text-ink">
            {question.pairs.map((pair, i) => (
              <li key={i} className="break-words">
                <span className="font-semibold">
                  {i + 1} → {key[i]}
                </span>{' '}
                <MathText text={pair.left} /> — <MathText text={pair.right} />
              </li>
            ))}
          </ul>
        </div>
      )
    }
    case 'open-ended':
      return (
        <div className="space-y-1">
          <p className="text-base break-words text-ink">
            {label} <MathText text={question.answer} />
          </p>
          {getKeyPoints(question).length > 1 && (
            <ul className="list-disc pl-5 text-sm text-muted">
              {getKeyPoints(question).map((point, i) => (
                <li key={i}>
                  <MathText text={point} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    default:
      return (
        <p className="text-base break-words text-ink">
          {label} <span className="font-semibold"><MathText text={question.answer} /></span>
        </p>
      )
  }
}
