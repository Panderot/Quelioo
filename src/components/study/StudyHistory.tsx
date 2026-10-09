import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { ArchiveEntry } from '../../lib/archive'
import { fullSessions, parseStudyResults } from '../../lib/study'
import { BookIcon, TrophyIcon } from '../icons'
import ScoreChart from './ScoreChart'

/** On the quiz page: the scores of past study sessions and the way into Study Mode. */
export default function StudyHistory({ entry }: { entry: ArchiveEntry }) {
  const { t } = useTranslation()
  const results = parseStudyResults(entry.results)
  const hasHistory = fullSessions(results).length > 0

  return (
    <section data-purpose="study-history" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{t('study.history.title')}</h3>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/archive/${entry.id}?mode=study`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-warm-border bg-card px-3.5 text-sm font-semibold text-ink transition-colors hover:border-amber"
          >
            <BookIcon className="h-4 w-4" />
            {t('archive.study')}
          </Link>
          <Link
            to={`/live/new?quiz=${entry.id}`}
            data-purpose="archive-live"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-warm-border bg-card px-3.5 text-sm font-semibold text-ink transition-colors hover:border-amber"
          >
            <TrophyIcon className="h-4 w-4" />
            {t('archive.live')}
          </Link>
        </div>
      </div>
      {hasHistory ? <ScoreChart results={results} /> : <p className="text-sm text-muted">{t('study.history.empty')}</p>}
    </section>
  )
}
