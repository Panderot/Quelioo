import { useTranslation } from 'react-i18next'

import { bestScore, fullSessions, percent } from '../../lib/study'
import type { StudyResults } from '../../lib/study'

const MAX_BARS = 10
/** Up to this many bars, every bar shows its date and time; with more, the date is shown once per day. */
const FULL_LABEL_BARS = 5

/** Small bar chart of the first-try score of the last full sessions of a quiz, with the best score. */
export default function ScoreChart({ results }: { results: StudyResults }) {
  const { t, i18n } = useTranslation()
  const sessions = fullSessions(results).slice(-MAX_BARS)
  const best = bestScore(results)
  if (sessions.length === 0) return <p className="text-sm text-muted">{t('study.history.empty')}</p>

  const locale = i18n.language === 'hyw' ? 'hy' : i18n.language
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const fullFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' })
  const dayKey = (at: string) => new Date(at).toDateString()
  const summary = sessions.map((session) => `${session.firstTry}/${session.total}`).join(', ')

  return (
    <figure data-purpose="study-history-chart" className="space-y-2">
      <div role="img" aria-label={`${t('study.history.chartLabel')}: ${summary}`} className="flex h-28 items-end gap-2">
        {sessions.map((session, index) => {
          const share = percent(session.firstTry, session.total)
          const at = new Date(session.at)
          const score = `${session.firstTry}/${session.total}`
          const tip = `${fullFormat.format(at)} · ${t(`study.kinds.${session.kind}.name`)} · ${score}`
          const showDate = sessions.length <= FULL_LABEL_BARS || index === 0 || dayKey(sessions[index - 1].at) !== dayKey(session.at)
          return (
            <div key={session.id} data-score={`${session.firstTry}/${session.total}`} title={tip} aria-label={tip} tabIndex={0} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-amber">
              <span className="text-[11px] font-bold text-ink tabular-nums">
                {session.firstTry}/{session.total}
              </span>
              <div className={`w-full max-w-9 rounded-t-md ${session === best ? 'bg-amber' : 'bg-amber/45'}`} style={{ height: `${Math.max(4, share * 0.6)}px` }} />
              <span className="flex flex-col items-center text-center text-[10px] leading-tight text-muted">
                {showDate && <span data-purpose="study-bar-date">{dateFormat.format(at)}</span>}
                <span data-purpose="study-bar-time" className="tabular-nums">
                  {timeFormat.format(at)}
                </span>
              </span>
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
