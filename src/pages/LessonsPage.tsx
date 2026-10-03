import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getLessonStatus } from '../api/lesson'
import UndoToast from '../components/flashcards/UndoToast'
import NewLessonPanel from '../components/lessons/NewLessonPanel'
import { HeadphonesIcon, LockIcon, SearchIcon, TrashIcon } from '../components/icons'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatUsd } from '../lib/lesson'
import { lessonLines, segmentKey, voiceFor } from '../lib/lessonAudio'
import { deleteLesson, getAllLessons, isLessonStoragePersistent, lessonStatus, monthLessonSpendUsd, pruneSegments, putLesson, subscribeLessons } from '../lib/lessonStorage'
import type { StoredLesson } from '../lib/lessonStorage'
import { clearStoredOwnerAccessCode, getStoredOwnerAccessCode } from '../lib/ownerAccessCode'
import { useSearchParamState } from '../hooks/useSearchParamState'

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

export default function LessonsPage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('lessons.title'))

  const [lessons, setLessons] = useState<StoredLesson[] | null>(null)
  const [requiresAccessCode, setRequiresAccessCode] = useState(true)
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null)
  const [hasAccessCode, setHasAccessCode] = useState(() => Boolean(getStoredOwnerAccessCode()))
  const [newOpen, setNewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useSearchParamState('q')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<StoredLesson | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => void getAllLessons().then((all) => !cancelled && setLessons(all))
    load()
    const unsubscribe = subscribeLessons(load)
    void getLessonStatus().then((status) => {
      if (cancelled) return
      setRequiresAccessCode(status.requiresAccessCode)
      setMonthlyBudget(status.monthlyBudgetUsd)
    })
    // Recorded audio that no saved line uses any more (edited lines, deleted lessons) is removed.
    void getAllLessons().then((all) => {
      const keep = new Set(
        all.flatMap((lesson) =>
          lesson.episodes.flatMap((episode) =>
            episode.script ? lessonLines(episode.script.sections).map((line) => segmentKey(line, voiceFor(line.speaker, episode.voices), lesson.options.language)) : [],
          ),
        ),
      )
      void pruneSegments(keep)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!busy) return undefined
    const handler = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [busy])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return (lessons ?? []).filter((lesson) => !query || `${lesson.title} ${lesson.sourceLabel}`.toLocaleLowerCase().includes(query))
  }, [lessons, search])

  const handleDelete = async (lesson: StoredLesson) => {
    await deleteLesson(lesson.id)
    setConfirmDeleteId(null)
    setDeleted(lesson)
  }

  const handleUndo = async () => {
    if (!deleted) return
    const lesson = deleted
    setDeleted(null)
    await putLesson(lesson)
  }

  const handleLock = () => {
    clearStoredOwnerAccessCode()
    setHasAccessCode(false)
  }

  const handleBusyChange = useCallback((value: boolean) => {
    setBusy(value)
    if (!value) setHasAccessCode(Boolean(getStoredOwnerAccessCode()))
  }, [])

  const newLessonButton = (className: string) => (
    <button type="button" onClick={() => setNewOpen(true)} className={className}>
      <HeadphonesIcon className="h-4 w-4" />
      {t('lessons.newLesson')}
    </button>
  )

  return (
    <>
      <section data-purpose="page-intro" className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">{t('lessons.title')}</h1>
          <p className="text-sm font-normal text-muted">{t('lessons.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {(hasAccessCode || !requiresAccessCode) && (
          <p data-purpose="lessons-month-spend" className="text-xs text-muted">
            {monthlyBudget !== null
              ? t('lessons.monthSpendBudget', { cost: formatUsd(monthLessonSpendUsd()), budget: formatUsd(monthlyBudget) })
              : t('lessons.monthSpend', { cost: formatUsd(monthLessonSpendUsd()) })}
          </p>
        )}
        {hasAccessCode && (
          <button
            type="button"
            onClick={handleLock}
            className="flex items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-error/40 hover:text-error"
          >
            <LockIcon className="h-3.5 w-3.5" />
            {t('ownerAccess.lock')}
          </button>
        )}
        </div>
      </section>

      {newOpen ? (
        <NewLessonPanel onClose={() => setNewOpen(false)} requiresAccessCode={requiresAccessCode} lessons={lessons ?? []} onBusyChange={handleBusyChange} />
      ) : (
        newLessonButton('flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-amber text-sm font-bold text-navy transition-colors hover:bg-amber-hover')
      )}

      {!isLessonStoragePersistent() && <p className="text-xs text-muted">{t('lessons.storageNote')}</p>}

      {lessons !== null && lessons.length > 0 && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('lessons.searchPlaceholder')}
            aria-label={t('lessons.searchPlaceholder')}
            className="w-full rounded-lg border border-warm-border bg-card py-2 pr-3 pl-9 text-sm text-ink"
          />
        </div>
      )}

      {lessons !== null && lessons.length === 0 && (
        <div data-purpose="lessons-empty" className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center">
          <HeadphonesIcon className="h-8 w-8 text-muted" />
          <div>
            <p className="text-sm font-semibold text-ink">{t('lessons.empty.title')}</p>
            <p className="mt-1 text-xs text-muted">{t('lessons.empty.subtitle')}</p>
          </div>
          {!newOpen && newLessonButton('mt-1 flex items-center gap-2 rounded-xl bg-amber px-4 py-2 text-xs font-bold text-navy transition-colors hover:bg-amber-hover')}
        </div>
      )}

      {lessons !== null && lessons.length > 0 && filtered.length === 0 && <p className="text-center text-sm text-muted">{t('lessons.noResults')}</p>}

      {filtered.length > 0 && (
        <ul data-purpose="lessons-list" className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
          {filtered.map((lesson) => {
            const status = lessonStatus(lesson)
            const source = lesson.sourceLabel ? `${t(`lessons.sourceKinds.${lesson.sourceKind}`)}: ${lesson.sourceLabel}` : t(`lessons.sourceKinds.${lesson.sourceKind}`)
            return (
              <li key={lesson.id} data-purpose="lesson-row" className="space-y-2 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link to={`/lessons/${lesson.id}`} className="block truncate text-sm font-semibold text-ink hover:text-amber-text">
                      {lesson.title}
                    </Link>
                    <p className="truncate text-xs text-muted">{source}</p>
                    <p className="text-xs text-muted">
                      {[t('lessons.row.episodes', { count: lesson.episodes.length }), t(`lessons.styles.${lesson.options.style}`), formatDate(lesson.createdAt, i18n.language)].join(' • ')}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${status === 'audio' ? 'bg-success/10 text-success' : 'bg-amber/15 text-amber-text'}`}>
                    {t(`lessons.status.${status}`)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/lessons/${lesson.id}`} className="rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral">
                    {t('lessons.row.open')}
                  </Link>
                  {confirmDeleteId === lesson.id ? (
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-xs font-medium text-ink">{t('lessons.row.confirmDelete')}</span>
                      <button type="button" onClick={() => void handleDelete(lesson)} className="rounded-lg bg-error/10 px-2.5 py-1.5 text-xs font-bold text-error hover:bg-error/20">
                        {t('lessons.row.delete')}
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink">
                        {t('create.question.cancelAction')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      title={t('lessons.row.delete')}
                      aria-label={t('lessons.row.delete')}
                      onClick={() => setConfirmDeleteId(lesson.id)}
                      className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-error/10 hover:text-error"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {deleted && <UndoToast key={deleted.id} message={t('lessons.deletedUndo')} onUndo={() => void handleUndo()} onDismiss={() => setDeleted(null)} />}
    </>
  )
}
