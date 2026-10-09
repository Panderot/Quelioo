import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useArchive } from '../lib/archive'
import { daysAgo, lastFullSession, parseStudyResults } from '../lib/study'
import { QUESTION_TYPE_LABEL_KEYS } from '../lib/quizTypes'
import { computeQuizTotalSeconds, secondsToDisplayMinutes } from '../lib/estimateTime'
import type { EstimateDifficulty } from '../lib/estimateTime'
import { getQuizIdsWithSongs } from '../lib/songStorage'
import { LoadError, SkeletonList } from '../components/DataStates'
import SolutionsList from '../components/SolutionsList'
import { ArchiveIcon, BookIcon, CalculatorIcon, MusicNoteIcon, TrophyIcon } from '../components/icons'

type ArchiveTab = 'quizzes' | 'solutions'
const TAB_ORDER: ArchiveTab[] = ['quizzes', 'solutions']
const TAB_ICONS = { quizzes: ArchiveIcon, solutions: CalculatorIcon }

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
  const archive = useArchive()
  const entries = archive.entries
  const [songQuizIds, setSongQuizIds] = useState<Set<string>>(new Set())
  // The active tab lives in the URL (?tab=solutions) so it survives reload and the back button.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: ArchiveTab = searchParams.get('tab') === 'solutions' ? 'solutions' : 'quizzes'
  const tabRefs = useRef<Record<ArchiveTab, HTMLButtonElement | null>>({ quizzes: null, solutions: null })

  const selectTab = (tab: ArchiveTab) => {
    if (tab === activeTab) return
    setSearchParams(tab === 'solutions' ? { tab: 'solutions' } : {})
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const index = TAB_ORDER.indexOf(activeTab)
    const next =
      event.key === 'Home'
        ? TAB_ORDER[0]
        : event.key === 'End'
          ? TAB_ORDER[TAB_ORDER.length - 1]
          : TAB_ORDER[(index + (event.key === 'ArrowRight' ? 1 : TAB_ORDER.length - 1)) % TAB_ORDER.length]
    selectTab(next)
    tabRefs.current[next]?.focus()
  }

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

      <div role="tablist" aria-label={t('archive.tabs.label')} className="flex items-center gap-2 border-b border-warm-border">
        {TAB_ORDER.map((tab) => {
          const Icon = TAB_ICONS[tab]
          const isActive = tab === activeTab
          return (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[tab] = el
              }}
              id={`archive-tab-${tab}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls="archive-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(tab)}
              onKeyDown={handleTabKeyDown}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-all ${
                isActive ? 'border-amber font-bold text-ink' : 'border-transparent font-semibold text-muted hover:text-ink'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-amber-hover' : 'text-muted'}`} />
              <span>{t(`archive.tabs.${tab}`)}</span>
            </button>
          )
        })}
      </div>

      <div id="archive-panel" role="tabpanel" aria-labelledby={`archive-tab-${activeTab}`}>
        {activeTab === 'solutions' ? (
          <SolutionsList />
        ) : !archive.loaded && archive.failed ? (
          <LoadError onRetry={archive.reload} />
        ) : !archive.loaded ? (
          <SkeletonList />
        ) : entries.length === 0 ? (
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
                t('params.questionCount.value', { count: entry.questionCount === 'auto' ? entry.quiz.questions.length : entry.questionCount }),
                t(typeLabelKey),
                t(difficultyLabelKey),
                ...(entry.optionsCount ? [t('params.optionsCount.value', { count: entry.optionsCount })] : []),
                timeLabel,
              ].join(' • ')

              const lastStudy = entry.results ? lastFullSession(parseStudyResults(entry.results)) : undefined
              const studyAgo = lastStudy ? daysAgo(lastStudy.at) : 0

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
                    {lastStudy && (
                      <p data-purpose="archive-last-study" className="truncate text-xs font-semibold text-amber-text">
                        {t('study.history.lastWhen', {
                          score: `${lastStudy.firstTry}/${lastStudy.total}`,
                          when: t(studyAgo === 0 ? 'study.when.today' : studyAgo === 1 ? 'study.when.yesterday' : 'study.when.daysAgo', { count: studyAgo }),
                        })}
                      </p>
                    )}
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
                    <Link
                      to={`/live/new?quiz=${entry.id}`}
                      data-purpose="archive-live"
                      aria-label={`${t('archive.live')} — ${entry.title}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-amber"
                    >
                      <TrophyIcon className="h-3.5 w-3.5" />
                      {t('archive.live')}
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
