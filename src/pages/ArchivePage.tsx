import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getArchiveEntries } from '../lib/archive'
import type { ArchiveEntry } from '../lib/archive'
import { QUESTION_TYPE_LABEL_KEYS } from '../lib/quizTypes'
import { computeQuizTotalSeconds, secondsToDisplayMinutes } from '../lib/estimateTime'
import type { EstimateDifficulty } from '../lib/estimateTime'
import { getQuizIdsWithSongs } from '../lib/songStorage'
import { ArchiveIcon, BookIcon, MusicNoteIcon } from '../components/icons'

function formatCreatedAt(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

export default function ArchivePage() {
  const { t, i18n } = useTranslation()
  const [entries] = useState<ArchiveEntry[]>(() => getArchiveEntries())
  const [songQuizIds, setSongQuizIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    void getQuizIdsWithSongs().then(setSongQuizIds)
  }, [])

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">
          {t('archive.title')}
        </h1>
        <p className="text-sm font-normal text-muted">{t('archive.subtitle')}</p>
      </section>

      {entries.length === 0 ? (
        <div
          data-purpose="archive-empty-state"
          className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center"
        >
          <ArchiveIcon className="h-8 w-8 text-muted" />
          <div>
            <p className="text-sm font-semibold text-ink">{t('archive.empty.title')}</p>
            <p className="mt-1 text-xs text-muted">{t('archive.empty.subtitle')}</p>
          </div>
          <Link
            to="/"
            className="mt-1 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
          >
            {t('archive.empty.cta')}
          </Link>
        </div>
      ) : (
        <ul data-purpose="archive-list" className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
          {entries.map((entry) => {
            const typeLabelKey = QUESTION_TYPE_LABEL_KEYS[entry.questionType] ?? entry.questionType
            const difficultyLabelKey = `params.difficulty.${entry.difficulty}`
            const totalSeconds = computeQuizTotalSeconds(entry.quiz.questions, (entry.difficulty as EstimateDifficulty) ?? 'medium')
            const { underAMinute, minutes } = secondsToDisplayMinutes(totalSeconds)
            const timeLabel = underAMinute ? t('create.result.timeUnderMinute') : t('create.result.timeTotal', { minutes })
            const meta = [
              t('params.questionCount.value', { count: entry.questionCount }),
              t(typeLabelKey),
              t(difficultyLabelKey),
              ...(entry.optionsCount ? [t('params.optionsCount.value', { count: entry.optionsCount })] : []),
              timeLabel,
            ].join(' • ')

            return (
              <li key={entry.id} className="flex items-center justify-between gap-4 p-4 md:p-5">
                <Link to={`/archive/${entry.id}`} className="min-w-0 flex-1 space-y-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink hover:text-amber-text">
                    <span className="truncate">{entry.title}</span>
                    {songQuizIds.has(entry.id) && (
                      <MusicNoteIcon
                        className="h-3.5 w-3.5 shrink-0 text-amber-hover"
                        role="img"
                        aria-hidden={false}
                        aria-label={t('song.archive.hasSongLabel')}
                      />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">{meta}</p>
                  <p className="truncate text-xs text-muted">{formatCreatedAt(entry.createdAt, i18n.language)}</p>
                </Link>

                <div className="flex shrink-0 items-center gap-2.5">
                  <Link
                    to={`/archive/${entry.id}?mode=study`}
                    aria-label={`${t('archive.study')} — ${entry.title}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-amber"
                  >
                    <BookIcon className="h-3.5 w-3.5" />
                    {t('archive.study')}
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
