import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LoadError, SkeletonList } from '../components/DataStates'
import { SpinnerIcon, TrophyIcon } from '../components/icons'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { buildCsv, buildXlsx, downloadFile, XLSX_TYPE } from '../lib/live/exportResults'
import type { Sheet } from '../lib/live/exportResults'
import { LiveApiError, createLiveGame, fetchLiveResults } from '../lib/live/api'
import type { LiveResultsResponse } from '../lib/live/api'
import { formatWhen } from '../lib/live/format'

function fileStem(title: string, iso: string): string {
  const slug = title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'live-game'
  return `quelio-live-${slug}-${iso.slice(0, 10)}`
}

/** /live/:id/results: how a finished game went, per question and per player, with Excel and CSV downloads. */
export default function LiveResultsPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('live.results.title'))
  const navigate = useNavigate()
  const [data, setData] = useState<LiveResultsResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  const [playingAgain, setPlayingAgain] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setState('loading')
    try {
      setData(await fetchLiveResults(id))
      setState('ready')
    } catch (caught) {
      setState(caught instanceof LiveApiError && caught.status === 404 ? 'missing' : 'failed')
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the page's data on mount
    void load()
  }, [load])

  if (state === 'loading') return <SkeletonList />
  if (state === 'failed') return <LoadError onRetry={() => void load()} />
  if (state === 'missing' || !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center">
        <p className="text-sm font-semibold text-ink">{t('live.board.notFound')}</p>
        <Link to="/live" className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy hover:border-amber">
          {t('live.results.back')}
        </Link>
      </div>
    )
  }

  const { game, summary, ranking } = data
  const stats = summary?.questions ?? []
  const running = game.state === 'lobby' || game.state === 'question' || game.state === 'reveal'

  const sheets = (): Sheet[] => [
    {
      name: t('live.results.rankingTitle'),
      rows: [[t('live.results.rank'), t('live.results.nickname'), t('live.results.score')], ...(ranking ?? []).map((row) => [row.rank, row.nickname, row.score])],
    },
    {
      name: t('live.results.questionsTitle'),
      rows: [
        ['#', t('live.results.question'), t('live.results.answeredCount'), t('live.results.correctCount'), t('live.results.successShort')],
        ...stats.map((stat, i) => [i + 1, stat.text, stat.answered, stat.correct, Math.round(stat.successRate * 100)]),
      ],
    },
  ]
  const stem = fileStem(game.quizTitle, data.createdAt)
  const exportExcel = () => downloadFile(`${stem}.xlsx`, buildXlsx(sheets()), XLSX_TYPE)
  const exportCsv = () => downloadFile(`${stem}.csv`, buildCsv(sheets(), i18n.language === 'tr' ? ';' : ','), 'text/csv;charset=utf-8')

  const playAgain = async () => {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const created = await createLiveGame(game.quizId, game.settings)
      navigate(`/live/${created.id}`)
    } catch {
      navigate(`/live/new?quiz=${game.quizId}`)
    }
  }

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <Link to="/live" className="text-xs font-semibold text-amber-text hover:underline">
          {t('live.results.back')}
        </Link>
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold text-navy">
          <TrophyIcon className="h-7 w-7 text-amber-text" />
          {t('live.results.title')}
        </h1>
      </section>

      {running && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-amber/50 bg-amber/10 p-4">
          <p className="text-sm font-semibold text-ink">{t('live.results.notFinished')}</p>
          <Link to={`/live/${game.id}`} className="rounded-xl bg-amber px-4 py-2 text-xs font-bold text-navy hover:bg-amber-hover">
            {t('live.results.openBoard')}
          </Link>
        </div>
      )}

      <dl data-purpose="live-results-facts" className="grid gap-px overflow-hidden rounded-[14px] border border-warm-border bg-warm-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t('live.results.date'), formatWhen(data.createdAt, i18n.language)],
          [t('live.results.quiz'), game.quizTitle],
          [t('live.results.players'), String(summary?.playerCount ?? 0)],
          [t('live.results.average'), String(summary?.averageScore ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="bg-card p-4">
            <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</dt>
            <dd data-purpose="live-fact" className="mt-1 truncate text-lg font-semibold text-ink">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {stats.length > 0 && (
        <section data-purpose="live-question-stats" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-4 md:p-5">
          <h2 className="text-sm font-bold text-ink">{t('live.results.questionsTitle')}</h2>
          <ol className="space-y-3">
            {stats.map((stat, i) => {
              const percent = Math.round(stat.successRate * 100)
              const hardest = summary?.hardest === i
              return (
                <li key={stat.index} data-hardest={hardest} className={`space-y-1.5 rounded-xl p-3 ${hardest ? 'bg-error/10 ring-1 ring-error/40' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <p className="min-w-0 text-sm text-ink">
                      <span className="font-bold">{i + 1}.</span> {stat.text}
                    </p>
                    <p className="shrink-0 text-sm font-bold text-navy tabular-nums">{t('live.results.success', { percent })}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-warm-border" aria-hidden>
                    <div className={`h-full rounded-full ${hardest ? 'bg-error' : 'bg-success'}`} style={{ width: `${percent}%` }} />
                  </div>
                  {hardest && <p className="text-xs font-bold text-error">{t('live.results.hardest')}</p>}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section data-purpose="live-results-ranking" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-4 md:p-5">
        <h2 className="text-sm font-bold text-ink">{t('live.results.rankingTitle')}</h2>
        {data.rankingPurged ? (
          <p className="text-sm text-muted">{t('live.results.purged')}</p>
        ) : !ranking || ranking.length === 0 ? (
          <p className="text-sm text-muted">{t('live.results.noPlayers')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold tracking-wide text-muted uppercase">
                <th className="py-2 pr-3">{t('live.results.rank')}</th>
                <th className="py-2 pr-3">{t('live.results.nickname')}</th>
                <th className="py-2 text-right">{t('live.results.score')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-border">
              {ranking.map((row) => (
                <tr key={`${row.rank}-${row.nickname}`} data-purpose="live-rank-row">
                  <td className="py-2 pr-3 font-bold text-amber-text tabular-nums">{row.rank}</td>
                  <td className="py-2 pr-3 font-semibold text-ink">{row.nickname}</td>
                  <td className="py-2 text-right font-bold text-navy tabular-nums">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!data.rankingPurged && <p className="text-xs text-muted">{t('live.results.retention')}</p>}
      </section>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" data-purpose="live-export-xlsx" onClick={exportExcel} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-semibold text-ink hover:border-amber">
          {t('live.results.exportExcel')}
        </button>
        <button type="button" data-purpose="live-export-csv" onClick={exportCsv} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-semibold text-ink hover:border-amber">
          {t('live.results.exportCsv')}
        </button>
        <button type="button" data-purpose="live-results-play-again" onClick={() => void playAgain()} disabled={playingAgain} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber px-4 text-sm font-bold text-navy hover:bg-amber-hover disabled:opacity-60">
          {playingAgain && <SpinnerIcon className="h-4 w-4" />}
          {t('live.results.playAgain')}
        </button>
      </div>
    </>
  )
}
