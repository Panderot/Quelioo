import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LoadError, SkeletonList } from '../components/DataStates'
import { SearchIcon, TrophyIcon } from '../components/icons'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useArchive } from '../lib/archive'
import { isActiveState, planLiveQuestions } from '../lib/live/core'
import { formatWhen } from '../lib/live/format'
import { useMyLiveGames } from '../lib/live/games'

/** The teacher hub (/live): a short explanation, "Start a game" with the Archive quiz picker, the game in progress and past games. */
export default function LivePage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('live.hub.title'))
  const archive = useArchive()
  const mine = useMyLiveGames()
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')

  const running = mine.games.filter((game) => isActiveState(game.state))
  // A lobby cancelled before anyone joined leaves nothing worth listing.
  const past = mine.games.filter((game) => !isActiveState(game.state) && !(game.state === 'ended' && game.summary?.playerCount === 0))

  const choices = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(i18n.language)
    return archive.entries
      .filter((entry) => !needle || entry.title.toLocaleLowerCase(i18n.language).includes(needle))
      .map((entry) => ({ entry, playable: planLiveQuestions(entry.quiz.questions).questions.length }))
  }, [archive.entries, query, i18n.language])

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold text-navy">
          <TrophyIcon className="h-7 w-7 text-amber-text" />
          {t('live.hub.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted">{t('live.hub.intro')}</p>
        <div className="pt-2">
          <button
            type="button"
            data-purpose="live-start-game"
            aria-expanded={picking}
            onClick={() => setPicking((value) => !value)}
            className="min-h-11 rounded-xl bg-amber px-5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover"
          >
            {t('live.hub.start')}
          </button>
        </div>
      </section>

      {picking && (
        <section data-purpose="live-quiz-picker" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">{t('live.hub.pickTitle')}</h2>
            <p className="text-xs text-muted">{t('live.hub.pickHint')}</p>
          </div>
          <label className="relative block">
            <span className="sr-only">{t('live.hub.search')}</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('live.hub.search')}
              className="h-11 w-full rounded-[10px] border border-warm-border bg-card pr-4 pl-10 text-sm text-ink placeholder:text-muted"
            />
          </label>
          {!archive.loaded ? (
            archive.failed ? (
              <LoadError onRetry={archive.reload} />
            ) : (
              <SkeletonList rows={3} />
            )
          ) : archive.entries.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted">{t('live.hub.noQuizzes')}</p>
              <Link to="/" className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy hover:border-amber">
                {t('live.hub.createQuiz')}
              </Link>
            </div>
          ) : choices.length === 0 ? (
            <p className="text-sm text-muted">{t('live.hub.noMatches')}</p>
          ) : (
            <ul data-purpose="live-quiz-list" className="max-h-96 divide-y divide-warm-border overflow-y-auto rounded-xl border border-warm-border">
              {choices.map(({ entry, playable }) => (
                <li key={entry.id}>
                  <Link to={`/live/new?quiz=${entry.id}`} data-purpose="live-pick-quiz" className="flex items-center justify-between gap-4 p-3 hover:bg-paper md:p-4">
                    <span className="min-w-0 space-y-0.5">
                      <span className="block truncate text-sm font-semibold text-ink">{entry.title}</span>
                      <span className="block truncate text-xs text-muted">{formatWhen(entry.createdAt, i18n.language)}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${playable > 0 ? 'text-amber-text' : 'text-muted'}`}>
                      {playable > 0 ? t('live.hub.playable', { count: playable }) : t('live.hub.noPlayable')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!mine.loaded ? (
        <SkeletonList rows={2} />
      ) : mine.failed ? (
        <LoadError onRetry={mine.reload} />
      ) : (
        <>
          {running.length > 0 && (
            <section data-purpose="live-running" className="space-y-3">
              <h2 className="text-sm font-bold text-ink">{t('live.hub.resumeTitle')}</h2>
              <ul className="space-y-2">
                {running.map((game) => (
                  <li key={game.id} className="flex items-center justify-between gap-4 rounded-[14px] border border-amber/50 bg-amber/10 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{game.quizTitle}</p>
                      <p className="truncate text-xs text-muted">
                        {t('live.hub.resumeItem', { when: formatWhen(game.createdAt, i18n.language), code: game.code })} ·{' '}
                        {t(game.state === 'lobby' ? 'live.hub.stateLobby' : 'live.hub.stateRunning')} · {t('live.board.lobby.count', { count: game.players })}
                      </p>
                    </div>
                    <Link to={`/live/${game.id}`} data-purpose="live-resume-game" className="shrink-0 rounded-xl bg-amber px-4 py-2 text-xs font-bold text-navy hover:bg-amber-hover">
                      {t('live.hub.resume')}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section data-purpose="live-history" className="space-y-3">
            <h2 className="text-sm font-bold text-ink">{t('live.hub.historyTitle')}</h2>
            {past.length === 0 ? (
              <p className="rounded-[14px] border border-dashed border-warm-border p-6 text-center text-sm text-muted">{t('live.hub.historyEmpty')}</p>
            ) : (
              <ul className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
                {past.map((game) => (
                  <li key={game.id} className="flex items-center justify-between gap-4 p-4 md:p-5">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-ink">{game.quizTitle}</p>
                      <p className="truncate text-xs text-muted">{formatWhen(game.createdAt, i18n.language)}</p>
                      <p className="truncate text-xs text-muted">
                        {game.state === 'ended' ? t('live.hub.stateCancelled') : game.summary ? t('live.hub.historyMeta', { count: game.summary.playerCount, average: game.summary.averageScore }) : t('live.hub.stateEnded')}
                      </p>
                    </div>
                    <Link to={`/live/${game.id}/results`} data-purpose="live-history-results" className="shrink-0 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:border-amber">
                      {t('live.hub.results')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
