import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useReducedMotion } from '../../hooks/useReducedMotion'
import { LiveApiError, sendLiveAnswer } from '../../lib/live/api'
import { optionCount } from '../../lib/live/core'
import type { LiveState } from '../../lib/live/core'
import { useLiveState, useRemainingMs } from '../../lib/live/useLiveState'
import MathText from '../MathText'
import { CheckIcon } from '../icons'
import Confetti from '../study/Confetti'
import { OptionShape } from './shapes'
import { optionStyle } from './shapeStyles'

interface PlayScreenProps {
  token: string
  /** The seat is gone (removed, game deleted): the page goes back to the join form with `reason`. */
  onGone: (reason: 'removed' | 'finished' | 'unavailable') => void
  /** The student leaves a finished game for the code screen ("Join a new game"). */
  onLeave: () => void
}

/** Keeps the phone awake while a game is on (Wake Lock API, where the browser has it). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
      } catch {
        // Refused (battery saver, hidden tab): the screen may dim, the game still works.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => undefined)
    }
  }, [active])
}

function optionLabelOf(state: LiveState, index: number, trueText: string, falseText: string): string {
  const question = state.question
  if (!question) return ''
  return question.kind === 'truefalse' ? (index === 0 ? trueText : falseText) : (question.options[index] ?? '')
}

/** The phone during a game: waiting, answering, the result of each question and the final screen. */
export default function PlayScreen({ token, onGone, onLeave }: PlayScreenProps) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { state, error, offline, serverNow, refresh } = useLiveState({ kind: 'player', token })
  const remaining = useRemainingMs(state, serverNow)
  const [sent, setSent] = useState<{ index: number; answer: number[] } | null>(null)
  // What is chosen / what failed belongs to one question: a new question starts clean without resetting anything.
  const [pick, setPick] = useState<{ index: number; options: number[] }>({ index: -1, options: [] })
  const [failedIndex, setFailedIndex] = useState(-1)
  const sending = useRef(false)
  useWakeLock(state !== null && state.game.state !== 'finished' && state.game.state !== 'ended')

  useEffect(() => {
    if (!error) return
    onGone(error.status === 403 ? 'removed' : error.status === 404 ? 'finished' : 'unavailable')
  }, [error, onGone])

  const index = state?.question?.index ?? -1
  const gameState = state?.game.state
  const picked = pick.index === index ? pick.options : []
  const sendError = failedIndex === index

  // The deadline passed: ask the server what happened (it reveals the question a moment after).
  const deadline = state?.game.deadlineAt ?? null
  useEffect(() => {
    if (deadline === null) return
    const timer = window.setTimeout(refresh, Math.max(0, deadline - serverNow()) + 600)
    return () => window.clearTimeout(timer)
  }, [deadline, refresh, serverNow])

  const submit = useCallback(
    async (answer: number[]) => {
      if (!state?.question || sending.current) return
      const questionIndex = state.question.index
      sending.current = true
      setSent({ index: questionIndex, answer })
      setFailedIndex(-1)
      try {
        await sendLiveAnswer(token, questionIndex, answer)
      } catch (caught) {
        if (caught instanceof LiveApiError && caught.status === 409 && caught.code === 'duplicate') {
          // Already counted (a second tap, or a retry after a lost reply).
        } else if (caught instanceof LiveApiError && caught.status === 409) {
          // Too late, or no longer the current question: the next state says what to show.
          setSent(null)
          refresh()
        } else {
          setSent(null)
          setFailedIndex(questionIndex)
        }
      } finally {
        sending.current = false
      }
    },
    [state, token, refresh],
  )

  if (!state) {
    return (
      <p role="status" className="py-16 text-center text-base text-muted">
        {t('live.board.loading')}
      </p>
    )
  }

  const me = state.me
  const question = state.question
  const answeredHere = Boolean(me?.answered) || sent?.index === index
  const timeUp = remaining !== null && remaining <= 0 && !state.game.paused
  const trueText = t('live.true')
  const falseText = t('live.false')

  const header = (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-navy px-4 py-3 text-paper">
      <span data-purpose="play-nickname" className="min-w-0 truncate text-base font-bold">
        {me?.nickname}
      </span>
      <span data-purpose="play-score" className="shrink-0 text-base font-bold tabular-nums">
        {me?.score ?? 0}
      </span>
    </div>
  )

  let body
  if (state.game.state === 'lobby') {
    body = (
      <div data-purpose="play-waiting" className="space-y-3 py-10 text-center">
        <h1 className="font-serif text-3xl font-semibold text-navy">{t('live.play.waitTitle')}</h1>
        <p className="text-base text-muted">{t('live.play.waitBody', { nickname: me?.nickname })}</p>
        <p className="text-sm font-semibold text-amber-text">{t('live.play.waitCount', { count: state.counts.players })}</p>
      </div>
    )
  } else if (state.game.state === 'question' && question) {
    const count = optionCount(question)
    const multi = question.kind === 'multi'
    const disabled = answeredHere || timeUp || state.game.paused
    body = (
      <div data-purpose="play-question" className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-muted">
            <span>{t('live.play.progress', { current: question.index + 1, total: question.total })}</span>
            <span data-purpose="play-seconds" role="timer" className="rounded-full bg-card px-3 py-1 text-lg font-bold text-navy tabular-nums ring-1 ring-warm-border">
              {state.game.paused ? t('live.play.paused') : Math.ceil((remaining ?? 0) / 1000)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-warm-border" aria-hidden>
            <div className="h-full rounded-full bg-amber" style={{ width: `${remaining === null ? 0 : Math.min(100, (remaining / (question.limitSeconds * 1000)) * 100)}%`, transition: 'width 120ms linear' }} />
          </div>
          <p data-purpose="play-question-text" className="text-base leading-snug text-ink">
            <MathText text={question.text} />
          </p>
          {multi && <p className="text-sm font-semibold text-amber-text">{t('live.play.multiNote')}</p>}
        </div>

        {answeredHere ? (
          <div data-purpose="play-sent" className="space-y-1 rounded-2xl border border-warm-border bg-card p-6 text-center">
            <CheckIcon className="mx-auto h-8 w-8 text-success" />
            <p className="font-serif text-2xl font-semibold text-navy">{t('live.play.sent')}</p>
            <p data-purpose="play-sent-note" className="text-sm text-muted">
              {state.counts.answered >= state.counts.players ? t('live.play.waitResult') : t('live.play.waitOthers')}
            </p>
          </div>
        ) : timeUp ? (
          <p data-purpose="play-time-up" className="rounded-2xl border border-warm-border bg-card p-6 text-center font-serif text-2xl font-semibold text-navy">
            {t('live.play.timeUp')}
          </p>
        ) : null}

        {!answeredHere && !timeUp && (
          <>
            <ul className="grid grid-cols-2 gap-3">
              {Array.from({ length: count }, (_, option) => {
                const style = optionStyle(question.kind, option)
                const selected = picked.includes(option)
                const label = optionLabelOf(state, option, trueText, falseText)
                return (
                  <li key={option} className={count === 5 && option === 4 ? 'col-span-2' : ''}>
                    <button
                      type="button"
                      data-purpose="play-option"
                      data-option={option}
                      aria-pressed={multi ? selected : undefined}
                      aria-label={t('live.shape.option', { n: option + 1, shape: t(`live.shape.${style.key}`) }) + (label ? `: ${label}` : '')}
                      disabled={disabled}
                      onClick={() => (multi ? setPick({ index: question.index, options: picked.includes(option) ? picked.filter((entry) => entry !== option) : [...picked, option] }) : void submit([option]))}
                      style={{ backgroundColor: style.background, color: style.color }}
                      className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center transition-transform active:scale-[0.98] disabled:opacity-50 ${selected ? 'ring-4 ring-navy ring-offset-2 ring-offset-paper' : ''}`}
                    >
                      <OptionShape kind={question.kind} option={option} className="h-9 w-9 shrink-0" />
                      {label && (
                        <span className="line-clamp-3 w-full text-base leading-tight font-bold break-words">
                          <MathText text={label} />
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            {multi && (
              <button
                type="button"
                data-purpose="play-confirm"
                disabled={picked.length === 0 || disabled}
                onClick={() => void submit([...picked].sort((a, b) => a - b))}
                className="min-h-14 w-full rounded-2xl bg-navy px-5 text-lg font-bold text-paper disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('live.play.confirm')}
              </button>
            )}
          </>
        )}
        {sendError && (
          <p role="alert" className="text-center text-sm font-semibold text-error">
            {t('live.play.reconnecting')}
          </p>
        )}
      </div>
    )
  } else if (state.game.state === 'reveal' && me?.last && state.reveal && question) {
    const last = me.last
    const correctLabels = state.reveal.correct
    body = (
      <div data-purpose="play-result" data-correct={last.correct} className="space-y-4 py-4 text-center">
        <p
          data-purpose="play-result-text"
          className={`rounded-2xl px-4 py-8 font-serif text-4xl font-semibold ${last.correct ? 'bg-success text-white' : me.answered ? 'bg-error text-white' : 'bg-card text-navy ring-1 ring-warm-border'}`}
        >
          {last.correct ? t('live.play.resultCorrect', { points: last.gained }) : me.answered ? t('live.play.resultWrong') : t('live.play.resultNone')}
        </p>
        <p data-purpose="play-rank" className="text-lg font-bold text-navy">
          {t('live.play.rankLine', { rank: me.rank, score: me.score })}
        </p>
        {last.correct && last.streak >= 2 && (
          <p data-purpose="play-streak" className="inline-block rounded-full bg-amber/20 px-4 py-1 text-sm font-bold text-amber-text">
            {t('live.play.streak', { count: last.streak, bonus: last.bonus })}
          </p>
        )}
        <ul className="flex flex-wrap justify-center gap-2" aria-label={t('live.board.reveal.correct')}>
          {correctLabels.map((option) => {
            const style = optionStyle(question.kind, option)
            return (
              <li key={option} className="inline-flex max-w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold" style={{ backgroundColor: style.background, color: style.color }}>
                <OptionShape kind={question.kind} option={option} className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  <MathText text={optionLabelOf(state, option, trueText, falseText)} />
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  } else if (state.game.state === 'finished') {
    const podium = (me?.rank ?? 99) <= 3
    body = (
      <div data-purpose="play-final" className="space-y-3 py-8 text-center">
        {podium && !reducedMotion && <Confetti />}
        <h1 className="font-serif text-4xl font-semibold text-navy">{t('live.play.finalTitle')}</h1>
        <p data-purpose="play-final-rank" className="text-xl font-bold text-ink">
          {t('live.play.finalRank', { rank: me?.rank, players: state.counts.players })}
        </p>
        <p className="text-lg font-semibold text-amber-text tabular-nums">{t('live.play.finalPoints', { score: me?.score ?? 0 })}</p>
        {podium && <p className="text-base font-semibold text-success">{t('live.play.podium')}</p>}
        <p className="text-base text-muted">{t('live.play.finalMessage')}</p>
        <button type="button" data-purpose="play-join-new" onClick={onLeave} className="mt-4 min-h-12 w-full rounded-xl bg-amber px-5 text-base font-bold text-navy hover:bg-amber-hover">
          {t('live.play.joinAnother')}
        </button>
      </div>
    )
  } else {
    body = (
      <div className="py-10 text-center">
        <p data-purpose="play-ended" className="font-serif text-2xl font-semibold text-navy">
          {t(state.game.endReason === 'cancelled' ? 'live.play.cancelled' : 'live.play.ended')}
        </p>
        <button type="button" data-purpose="play-join-new" onClick={onLeave} className="mt-4 min-h-12 w-full rounded-xl bg-amber px-5 text-base font-bold text-navy hover:bg-amber-hover">
          {t('live.play.joinAnother')}
        </button>
      </div>
    )
  }

  return (
    <div data-purpose="play-screen" data-state={gameState} className="space-y-4">
      {header}
      {offline && (
        <p role="status" data-purpose="play-offline" className="rounded-xl bg-error/10 px-4 py-2 text-center text-sm font-bold text-error">
          {t('live.play.reconnecting')}
        </p>
      )}
      {body}
    </div>
  )
}
