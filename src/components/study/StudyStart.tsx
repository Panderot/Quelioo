import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_EXAM_SECONDS_PER_QUESTION, bestScore, lastFullSession } from '../../lib/study'
import type { StudyKind, StudyResults, TimerMode, TimerSetting } from '../../lib/study'
import { defaultKindTimer } from '../../lib/studyPrefs'
import type { KindTimer, StudyPrefs } from '../../lib/studyPrefs'
import { CloseIcon } from '../icons'

interface StudyStartProps {
  title: string
  questionCount: number
  results: StudyResults
  quickCount: number
  prefs: StudyPrefs
  onStart: (kind: StudyKind, timer: TimerSetting) => void
  onResume: () => void
  onExit: () => void
}

const KINDS: StudyKind[] = ['normal', 'exam', 'quick']

/** The short screen before a session: pick the study type and an optional timer; offers to continue an unfinished session. */
export default function StudyStart({ title, questionCount, results, quickCount, prefs, onStart, onResume, onExit }: StudyStartProps) {
  const { t } = useTranslation()
  const initialKind: StudyKind = prefs.kind === 'quick' && quickCount === 0 ? 'normal' : prefs.kind
  const [kind, setKind] = useState<StudyKind>(initialKind)
  // With an unfinished session only its card is shown; the type and timer choices come after "Start over".
  const [startingOver, setStartingOver] = useState(false)
  const defaultMinutes = Math.max(1, Math.round((questionCount * DEFAULT_EXAM_SECONDS_PER_QUESTION) / 60))
  // Each study type keeps its own timer choice; switching type shows that type's choice, never another's.
  const [drafts, setDrafts] = useState<Record<StudyKind, KindTimer>>(() => ({
    normal: { ...defaultKindTimer('normal'), ...prefs.timers.normal },
    exam: { ...defaultKindTimer('exam'), ...prefs.timers.exam },
    quick: { ...defaultKindTimer('quick'), ...prefs.timers.quick },
  }))
  const draft = drafts[kind]
  const timerMode: TimerMode = draft.mode
  const totalMinutes = draft.totalMinutes ?? defaultMinutes
  const questionSeconds = draft.questionSeconds
  const patchDraft = (patch: Partial<KindTimer>) => setDrafts((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }))
  const setTimerMode = (mode: TimerMode) => patchDraft({ mode })
  const setTotalMinutes = (minutes: number) => patchDraft({ totalMinutes: minutes })
  const setQuestionSeconds = (seconds: number) => patchDraft({ questionSeconds: seconds })
  const resume = results.resume
  const last = lastFullSession(results)
  const best = bestScore(results)
  // The student's timer choice is always honoured, "Off" included: no countdown unless they pick one.
  const effectiveMode: TimerMode = timerMode
  const count = kind === 'quick' ? quickCount : questionCount

  const start = () => {
    const timer: TimerSetting = {
      mode: effectiveMode,
      totalSeconds: Math.max(1, totalMinutes) * 60,
      questionSeconds: Math.max(5, questionSeconds),
    }
    onStart(kind, timer)
  }

  const numberField = 'h-11 w-24 rounded-xl border border-warm-border bg-card px-3 text-base text-ink'

  return (
    <section data-purpose="study-start" className="mx-auto w-full max-w-2xl space-y-5" aria-label={t('study.label')}>
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
      </div>

      <div className="space-y-1 text-center">
        <h2 className="font-serif text-2xl leading-snug font-semibold break-words text-navy">{title}</h2>
        <p className="text-sm text-muted">
          {t('params.questionCount.value', { count: questionCount })}
          {last && ` • ${t('study.history.last', { score: `${last.firstTry}/${last.total}` })}`}
          {best && ` • ${t('study.history.best', { score: `${best.firstTry}/${best.total}` })}`}
        </p>
      </div>

      {resume && !startingOver && (
        <div data-purpose="study-resume" className="space-y-3 rounded-[14px] border border-amber/40 bg-amber/10 p-4">
          <div>
            <p className="text-sm font-bold text-ink">{t('study.start.resumeTitle')}</p>
            <p className="text-xs text-muted">
              {t('study.start.resumeBody', { current: Math.min(resume.index + 1, resume.qids.length), total: resume.qids.length })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={onResume} autoFocus className="min-h-11 rounded-xl bg-amber px-5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover">
              {t('study.start.resume')}
            </button>
            <button
              type="button"
              onClick={() => setStartingOver(true)}
              className="min-h-11 rounded-xl border border-warm-border bg-card px-5 text-sm font-bold text-ink transition-colors hover:border-amber"
            >
              {t('study.start.restart')}
            </button>
          </div>
        </div>
      )}

      {(!resume || startingOver) && (
        <>
          <fieldset className="space-y-2.5">
            <legend className="mx-auto mb-1 text-xs font-bold tracking-wide text-muted uppercase">{t('study.start.typeLegend')}</legend>
            {KINDS.map((option) => {
              const disabled = option === 'quick' && quickCount === 0
              const selected = kind === option
              return (
                <label
                  key={option}
                  className={`flex min-h-[56px] items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    disabled ? 'cursor-not-allowed border-warm-border opacity-60' : selected ? 'cursor-pointer border-amber bg-amber/12' : 'cursor-pointer border-warm-border bg-card hover:border-focus-neutral'
                  }`}
                >
                  <input
                    type="radio"
                    name="study-kind"
                    value={option}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => {
                      setKind(option)
                    }}
                    className="mt-1 h-5 w-5 shrink-0 accent-amber"
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-base font-bold text-ink">
                      {t(`study.kinds.${option}.name`)}
                      {option === 'quick' && !disabled && <span className="ml-2 text-xs font-semibold text-muted">{t('study.kinds.quick.count', { count: quickCount })}</span>}
                    </span>
                    <span className="block text-sm text-muted">{disabled ? t('study.kinds.quick.none') : t(`study.kinds.${option}.description`)}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          <fieldset className="space-y-2.5">
            <legend className="mx-auto mb-1 text-xs font-bold tracking-wide text-muted uppercase">{t('study.timer.legend')}</legend>
            <div role="radiogroup" aria-label={t('study.timer.legend')} className="flex flex-wrap justify-center gap-2">
              {(['off', 'total', 'question'] as TimerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={effectiveMode === mode}
                  onClick={() => {
                    setTimerMode(mode)
                  }}
                  className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors ${effectiveMode === mode ? 'border-amber bg-amber/12 text-ink' : 'border-warm-border bg-card text-ink hover:border-focus-neutral'}`}
                >
                  {t(`study.timer.${mode}`)}
                </button>
              ))}
            </div>
            {effectiveMode === 'total' && (
              <label className="flex items-center justify-center gap-2 text-sm text-ink">
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={totalMinutes}
                  onChange={(event) => setTotalMinutes(Math.min(600, Math.max(1, Number(event.target.value) || 1)))}
                  aria-label={t('study.timer.totalMinutes')}
                  className={numberField}
                />
                {t('study.timer.minutesUnit')}
              </label>
            )}
            {effectiveMode === 'question' && (
              <label className="flex items-center justify-center gap-2 text-sm text-ink">
                <input
                  type="number"
                  min={5}
                  max={3600}
                  value={questionSeconds}
                  onChange={(event) => setQuestionSeconds(Math.min(3600, Math.max(5, Number(event.target.value) || 5)))}
                  aria-label={t('study.timer.questionSeconds')}
                  className={numberField}
                />
                {t('study.timer.secondsUnit')}
              </label>
            )}
          </fieldset>

          <button
            type="button"
            onClick={start}
            disabled={count === 0}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-amber px-6 text-base font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50 "
          >
            {t('study.start.begin')}
          </button>
        </>
      )}
    </section>
  )
}
