import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getArchiveEntries, setArchiveEntryStudyMode } from '../lib/archive'
import type { ArchiveEntry } from '../lib/archive'
import { ArchiveIcon } from '../components/icons'

const QUESTION_TYPE_LABEL_KEY: Record<string, string> = {
  mcq: 'params.questionType.mcq',
  'true-false': 'params.questionType.trueFalse',
  'fill-blanks': 'params.questionType.fillBlanks',
  'short-answer': 'params.questionType.shortAnswer',
}

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
  const [entries, setEntries] = useState<ArchiveEntry[]>(() => getArchiveEntries())

  const handleToggleStudyMode = (entry: ArchiveEntry) => {
    const nextValue = !entry.studyMode
    setArchiveEntryStudyMode(entry.id, nextValue)
    setEntries((current) => current.map((item) => (item.id === entry.id ? { ...item, studyMode: nextValue } : item)))
  }

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
            className="mt-1 rounded-xl bg-amber px-4 py-2 text-xs font-bold text-navy shadow-sm transition-all hover:scale-[1.02] hover:bg-amber-hover active:scale-[0.98]"
          >
            {t('archive.empty.cta')}
          </Link>
        </div>
      ) : (
        <ul data-purpose="archive-list" className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
          {entries.map((entry) => {
            const typeLabelKey = QUESTION_TYPE_LABEL_KEY[entry.questionType] ?? entry.questionType
            const difficultyLabelKey = `params.difficulty.${entry.difficulty}`
            const meta = [
              t('params.questionCount.value', { count: entry.questionCount }),
              t(typeLabelKey),
              t(difficultyLabelKey),
            ].join(' • ')

            return (
              <li key={entry.id} className="flex items-center justify-between gap-4 p-4 md:p-5">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-ink">{entry.title}</p>
                  <p className="truncate text-xs text-muted">{meta}</p>
                  <p className="truncate text-xs text-muted">{formatCreatedAt(entry.createdAt, i18n.language)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="hidden text-xs font-semibold text-ink sm:inline">{t('archive.studyMode')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={entry.studyMode}
                    aria-label={`${t('archive.studyMode')} — ${entry.title}`}
                    onClick={() => handleToggleStudyMode(entry)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      entry.studyMode ? 'bg-amber' : 'bg-warm-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full border border-warm-border bg-card transition-transform ${
                        entry.studyMode ? 'translate-x-5 border-white' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
