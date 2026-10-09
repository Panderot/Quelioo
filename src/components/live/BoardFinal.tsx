import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { LiveRankRow, LiveState } from '../../lib/live/core'
import Confetti from '../study/Confetti'

interface BoardFinalProps {
  state: LiveState
  busy: boolean
  onPlayAgain: () => void
}

const PODIUM_ORDER = [1, 0, 2] as const
const PODIUM_HEIGHT = ['h-[clamp(11rem,28vh,18rem)]', 'h-[clamp(8.5rem,21vh,14rem)]', 'h-[clamp(6.5rem,16vh,11rem)]']
const PODIUM_COLOR = ['bg-amber text-navy', 'bg-navy text-paper', 'bg-amber-text text-white']

/** Podium for the first three, then the whole ranking, with a short confetti burst (not under reduced motion). */
export default function BoardFinal({ state, busy, onPlayAgain }: BoardFinalProps) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const ranking: LiveRankRow[] = state.ranking ?? []
  const finished = state.game.state === 'finished'
  const top = ranking.slice(0, 3)

  return (
    <div data-purpose="live-final" className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-8 px-6 py-8 lg:px-12">
      {finished && ranking.length > 0 && !reducedMotion && <Confetti />}
      <h1 className="text-center font-serif text-5xl font-semibold text-navy md:text-6xl">{t('live.board.final.title')}</h1>

      {!finished ? (
        <div className="space-y-2 text-center">
          <p className="text-3xl text-ink">{t('live.board.final.ended')}</p>
          <p className="text-xl text-muted">{t('live.board.final.endedIdle')}</p>
        </div>
      ) : ranking.length === 0 ? (
        <p className="text-center text-3xl text-muted">{t('live.board.final.noPlayers')}</p>
      ) : (
        <ol data-purpose="live-podium" className="mx-auto flex w-full max-w-4xl items-end justify-center gap-4">
          {PODIUM_ORDER.map((place) => {
            const row = top[place]
            if (!row) return <li key={place} className="flex-1" aria-hidden />
            return (
              <li key={place} data-purpose={`live-podium-${place + 1}`} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                <span className="max-w-full truncate font-serif text-[clamp(1.5rem,3vw,3rem)] font-semibold text-ink">{row.nickname}</span>
                <span className="text-2xl font-bold text-muted tabular-nums">{t('live.board.final.points', { count: row.score })}</span>
                <div className={`flex w-full items-start justify-center rounded-t-2xl pt-4 font-serif text-6xl font-semibold ${PODIUM_COLOR[place]} ${PODIUM_HEIGHT[place]}`}>
                  <span>{t(`live.board.final.place${place + 1}`)}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {ranking.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-3xl font-semibold text-navy">{t('live.board.final.fullRanking')}</h2>
          <ol data-purpose="live-ranking" className="grid gap-2 md:grid-cols-2">
            {ranking.map((row) => (
              <li key={`${row.rank}-${row.playerId ?? row.nickname}`} className="flex items-center gap-4 rounded-2xl border border-warm-border bg-card px-5 py-3 text-2xl">
                <span className="w-12 font-serif text-3xl font-semibold text-amber-text">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{row.nickname}</span>
                <span className="font-bold text-navy tabular-nums">{row.score}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3 pb-6">
        <Link to={`/live/${state.game.id}/results`} className="inline-flex min-h-14 items-center rounded-xl bg-amber px-8 text-2xl font-bold text-navy hover:bg-amber-hover">
          {t('live.board.final.resultsPage')}
        </Link>
        <button type="button" data-purpose="live-play-again" onClick={onPlayAgain} disabled={busy} className="min-h-14 rounded-xl border border-warm-border bg-card px-8 text-2xl font-semibold text-ink hover:border-amber disabled:opacity-60">
          {t('live.board.final.playAgain')}
        </button>
        <Link to="/live" className="inline-flex min-h-14 items-center rounded-xl border border-warm-border bg-card px-8 text-2xl font-semibold text-ink hover:border-amber">
          {t('live.board.leave')}
        </Link>
      </div>
    </div>
  )
}
