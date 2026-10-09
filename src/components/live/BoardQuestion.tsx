import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { optionCount } from '../../lib/live/core'
import type { LiveState } from '../../lib/live/core'
import MathText from '../MathText'
import { CheckIcon, PauseIcon, PlayIcon } from '../icons'
import ConfirmDialog from './ConfirmDialog'
import { useOptionLabel } from './optionLabel'
import { OptionShape } from './shapes'
import { optionStyle } from './shapeStyles'

interface BoardQuestionProps {
  state: LiveState
  /** Milliseconds left (question) or null (reveal). */
  remainingMs: number | null
  busy: boolean
  onPause: () => void
  onResume: () => void
  onSkip: () => void
  onEndNow: () => void
  onNext: () => void
  onFinish: () => void
}

function Timer({ remainingMs, limitSeconds, paused }: { remainingMs: number | null; limitSeconds: number; paused: boolean }) {
  const { t } = useTranslation()
  const seconds = remainingMs === null ? 0 : Math.ceil(remainingMs / 1000)
  const low = remainingMs !== null && seconds <= 5
  const share = remainingMs === null ? 0 : Math.min(1, remainingMs / (limitSeconds * 1000))
  return (
    <div data-purpose="live-timer" role="timer" aria-label={t('live.board.question.timeLeft', { count: seconds })} className="flex items-center gap-4">
      <div className="hidden h-4 w-48 overflow-hidden rounded-full bg-warm-border md:block" aria-hidden>
        <div className={`h-full rounded-full ${low ? 'bg-error' : 'bg-amber'}`} style={{ width: `${share * 100}%`, transition: 'width 120ms linear' }} />
      </div>
      <div className={`grid h-24 min-w-24 place-items-center rounded-2xl px-4 font-serif text-6xl font-semibold tabular-nums md:h-28 md:min-w-28 md:text-7xl ${low ? 'bg-error text-white' : 'bg-navy text-paper'}`}>
        <span data-purpose="live-seconds">{paused ? <PauseIcon className="h-10 w-10" /> : seconds}</span>
      </div>
    </div>
  )
}

/** The question and the reveal on the projector (they share one layout so the board does not jump). */
export default function BoardQuestion({ state, remainingMs, busy, onPause, onResume, onSkip, onEndNow, onNext, onFinish }: BoardQuestionProps) {
  const { t } = useTranslation()
  const [finishing, setFinishing] = useState(false)
  const question = state.question
  const reveal = state.reveal
  const label = useOptionLabel(question?.kind ?? 'single', question?.options ?? [])
  if (!question) return null
  const revealing = state.game.state === 'reveal' && reveal !== null
  const paused = state.game.paused
  const count = optionCount(question)
  const last = question.index + 1 >= question.total
  const correctSet = new Set(reveal?.correct ?? [])
  const maxCount = Math.max(1, ...(reveal?.counts ?? [0]))

  return (
    <div data-purpose={revealing ? 'live-reveal' : 'live-question'} className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-5 px-6 py-6 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p data-purpose="live-progress" className="text-3xl font-bold text-navy">
          {t('live.board.question.progress', { current: question.index + 1, total: question.total })}
        </p>
        <p data-purpose="live-answered" aria-live="polite" className="rounded-full bg-card px-6 py-2 text-3xl font-bold text-ink ring-1 ring-warm-border">
          {t('live.board.question.answered', { answered: state.counts.answered, players: state.counts.players })}
        </p>
        {!revealing && <Timer remainingMs={remainingMs} limitSeconds={question.limitSeconds} paused={paused} />}
      </div>

      <div className="space-y-3 text-center">
        <h1 data-purpose="live-question-text" className="mx-auto max-w-[1500px] font-serif text-[clamp(1.9rem,3.8vw,4.25rem)] leading-tight font-semibold text-navy">
          <MathText text={question.text} />
        </h1>
        {question.kind === 'multi' && !revealing && <p className="text-2xl font-semibold text-amber-text">{t('live.board.question.multiNote')}</p>}
        {paused && !revealing && (
          <p data-purpose="live-paused" className="inline-block rounded-full bg-amber px-6 py-2 text-2xl font-bold text-navy">
            {t('live.board.question.paused')}
          </p>
        )}
      </div>

      {!revealing ? (
        <ul data-purpose="live-options" className={`grid flex-1 content-center gap-4 ${paused ? 'opacity-40' : ''} ${question.kind === 'truefalse' ? 'grid-cols-2' : 'md:grid-cols-2'}`}>
          {Array.from({ length: count }, (_, index) => {
            const style = optionStyle(question.kind, index)
            return (
              <li
                key={index}
                data-purpose="live-option"
                style={{ backgroundColor: style.background, color: style.color }}
                className={`flex min-h-[clamp(5.5rem,15vh,10rem)] items-center gap-5 rounded-2xl px-6 py-4 ${count === 5 && index === 4 ? 'md:col-span-2' : ''}`}
              >
                <OptionShape kind={question.kind} option={index} className="h-12 w-12 shrink-0 md:h-16 md:w-16" />
                <span className="min-w-0 text-[clamp(1.5rem,2.8vw,3.25rem)] leading-tight font-bold break-words">
                  <MathText text={label(index)} />
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <ul data-purpose="live-chart" aria-label={t('live.board.reveal.chartLabel')} className="flex h-[clamp(15rem,34vh,26rem)] items-end gap-4">
              {Array.from({ length: count }, (_, index) => {
                const style = optionStyle(question.kind, index)
                const votes = reveal.counts[index] ?? 0
                const right = correctSet.has(index)
                return (
                  <li key={index} data-purpose="live-chart-bar" data-correct={right} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center">
                    <span className="text-4xl font-bold text-ink tabular-nums">{votes}</span>
                    <div
                      className={`relative rounded-t-xl ${right ? '' : 'opacity-40'}`}
                      style={{ backgroundColor: style.background, height: `${Math.max(4, (votes / maxCount) * 78)}%` }}
                    >
                      {right && (
                        <span className="absolute top-3 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full bg-success text-white ring-2 ring-white" aria-label={t('live.board.reveal.correct')}>
                          <CheckIcon className="h-6 w-6" />
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center justify-center gap-2 rounded-xl px-2 py-2 ${right ? 'ring-4 ring-success' : 'opacity-60'}`} style={{ backgroundColor: style.background, color: style.color }}>
                      <OptionShape kind={question.kind} option={index} className="h-7 w-7 shrink-0" />
                      <span className="min-w-0 truncate text-xl font-bold">
                        <MathText text={label(index)} />
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
            {reveal.unanswered > 0 && <p className="text-xl font-semibold text-muted">{t('live.board.reveal.unanswered', { count: reveal.unanswered })}</p>}
            {reveal.explanation && (
              <div data-purpose="live-explanation" className="rounded-2xl border border-warm-border bg-card p-5">
                <p className="text-base font-bold tracking-wide text-muted uppercase">{t('live.board.reveal.explanation')}</p>
                <p className="mt-1 text-2xl leading-snug text-ink">
                  <MathText text={reveal.explanation} />
                </p>
              </div>
            )}
          </div>

          {state.game.settings.showLeaderboard && (
            <section data-purpose="live-top5" className="space-y-3">
              <h2 className="font-serif text-3xl font-semibold text-navy">{t('live.board.reveal.top5')}</h2>
              <ol className="space-y-2">
                {reveal.top.map((row) => (
                  <li key={`${row.rank}-${row.nickname}`} className="flex items-center gap-4 rounded-2xl border border-warm-border bg-card px-5 py-3 text-2xl">
                    <span className="w-9 font-serif text-3xl font-semibold text-amber-text">{row.rank}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{row.nickname}</span>
                    <span className="font-bold text-navy tabular-nums">{row.score}</span>
                    {(row.gained ?? 0) > 0 && <span data-purpose="live-top5-gain" className="rounded-full bg-success/15 px-3 py-0.5 text-xl font-bold text-success tabular-nums">{(row.bonus ?? 0) > 0 ? t('live.board.reveal.gainedSplit', { points: (row.gained ?? 0) - (row.bonus ?? 0), bonus: row.bonus }) : t('live.board.reveal.gained', { points: row.gained })}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-warm-border pt-4">
        <p className="text-lg text-muted">{t('live.board.question.keys')}</p>
        <div className="flex flex-wrap items-center gap-3">
          {!revealing && (
            <>
              <button
                type="button"
                data-purpose={paused ? 'live-resume' : 'live-pause'}
                onClick={paused ? onResume : onPause}
                disabled={busy}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-warm-border bg-card px-5 text-lg font-semibold text-ink hover:border-amber disabled:opacity-60"
              >
                {paused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
                {paused ? t('live.board.question.resume') : t('live.board.question.pause')}
              </button>
              <button type="button" data-purpose="live-skip" onClick={onSkip} disabled={busy} title={t('live.board.question.skipNote')} className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-lg font-semibold text-ink hover:border-amber disabled:opacity-60">
                {t('live.board.question.skip')}
              </button>
              <button type="button" data-purpose="live-end-now" onClick={onEndNow} disabled={busy || paused} className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-lg font-semibold text-ink hover:border-amber disabled:opacity-60">
                {t('live.board.question.endNow')}
              </button>
            </>
          )}
          <button type="button" data-purpose="live-finish" onClick={() => setFinishing(true)} disabled={busy} className="min-h-12 rounded-xl border border-warm-border bg-card px-5 text-lg font-semibold text-ink hover:border-error disabled:opacity-60">
            {t('live.board.question.finish')}
          </button>
          {revealing && (
            <button type="button" data-purpose="live-next" onClick={onNext} disabled={busy} className="min-h-14 rounded-xl bg-amber px-8 text-2xl font-bold text-navy hover:bg-amber-hover disabled:opacity-60">
              {last ? t('live.board.reveal.final') : t('live.board.reveal.next')}
            </button>
          )}
        </div>
      </div>

      {finishing && (
        <ConfirmDialog
          title={t('live.board.question.finishTitle')}
          body={t('live.board.question.finishBody')}
          confirmLabel={t('live.board.question.finish')}
          cancelLabel={t('live.board.lobby.cancel')}
          onCancel={() => setFinishing(false)}
          onConfirm={() => {
            setFinishing(false)
            onFinish()
          }}
        />
      )}
    </div>
  )
}
