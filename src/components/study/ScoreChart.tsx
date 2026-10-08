import { useTranslation } from 'react-i18next'

import { bestScore, fullSessions, percent } from '../../lib/study'
import type { StudyResults } from '../../lib/study'

const MAX_BARS = 10

/** Small bar chart of the first-try score of the last full sessions of a quiz, with the best score. */
export default function ScoreChart({ results }: { results: StudyResults }) {
  const { t, i18n } = useTranslation()
  const sessions = fullSessions(results).slice(-MAX_BARS)
  const best = bestScore(results)
  if (sessions.length === 0) return <p className="text-sm text-muted">{t('study.history.empty')}</p>

  const dateFormat = new Intl.DateTimeFormat(i18n.language === 'hyw' ? 'hy' : i18n.language, { day: 'numeric', month: 'short' })
  const summary = sessions.map((session) => `${session.firstTry}/${session.total}`).join(', ')

  return (
    <figure data-purpose="study-history-chart" className="space-y-2">
      <div role="img" aria-label={`${t('study.history.chartLabel')}: ${summary}`} className="flex h-28 items-end gap-2">
        {sessions.map((session) => {
          const share = percent(session.firstTry, session.total)
          return (
            <div key={session.id} data-score={`${session.firstTry}/${session.total}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] font-bold text-ink tabular-nums">
                {session.firstTry}/{session.total}
              </span>
              <div className={`w-full max-w-9 rounded-t-md ${session === best ? 'bg-amber' : 'bg-amber/45'}`} style={{ height: `${Math.max(4, share * 0.6)}px` }} />
              <span className="text-[10px] text-muted">{dateFormat.format(new Date(session.at))}</span>
            </div>
          )
        })}
      </div>
      {best && (
        <figcaption className="text-xs font-semibold text-muted">
          {t('study.history.best', { score: `${best.firstTry}/${best.total}` })}
        </figcaption>
      )}
    </figure>
  )
}
