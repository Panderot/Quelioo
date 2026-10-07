import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LoadError, SkeletonList } from './DataStates'
import { deleteSolution, getAllSolutions, restoreSolution, withThumbnailBlob } from '../lib/solutionStorage'
import type { StoredSolution } from '../lib/solutionStorage'
import MathText from './MathText'
import { CalculatorIcon, SearchIcon, TrashIcon } from './icons'

const UNDO_WINDOW_MS = 6000

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

/** Everything a student might search for, as one lowercase haystack. */
function searchText(solution: StoredSolution, locale: string): string {
  const { result } = solution
  return [result.topic, result.question, result.intro, result.answer, result.tip, ...result.steps, ...result.mistakes]
    .join(' ')
    .toLocaleLowerCase(locale)
}

/** The Archive "Solutions" tab: saved solutions with search, delete (+ undo) and open. */
export default function SolutionsList() {
  const { t, i18n } = useTranslation()
  const [solutions, setSolutions] = useState<StoredSolution[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // In the URL (?q=), so the search is still there after opening a solution and coming back, or a reload.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const setSearch = (value: string) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set('q', value)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<{ solution: StoredSolution; index: number } | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void getAllSolutions().then(
      (all) => {
        if (!cancelled) {
          setSolutions(all)
          setLoadFailed(false)
        }
      },
      () => {
        if (!cancelled) setLoadFailed(true)
      },
    )
    return () => {
      cancelled = true
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    }
  }, [reloadKey])

  // One object URL per local thumbnail per load, revoked together; account thumbnails come as signed URLs.
  const thumbnailUrls = useMemo(
    () =>
      new Map(
        (solutions ?? []).flatMap((solution) =>
          solution.thumbnail ? [[solution.id, URL.createObjectURL(solution.thumbnail)] as const] : solution.thumbnailUrl ? [[solution.id, solution.thumbnailUrl] as const] : [],
        ),
      ),
    [solutions],
  )
  useEffect(
    () => () =>
      thumbnailUrls.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }),
    [thumbnailUrls],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(i18n.language)
    if (!solutions) return []
    return query ? solutions.filter((solution) => searchText(solution, i18n.language).includes(query)) : solutions
  }, [solutions, search, i18n.language])

  const handleDeleteConfirmed = async (solution: StoredSolution) => {
    const index = solutions?.findIndex((entry) => entry.id === solution.id) ?? 0
    const kept = await withThumbnailBlob(solution) // so Undo can put the thumbnail back
    await deleteSolution(solution.id)
    setSolutions((current) => (current ?? []).filter((entry) => entry.id !== solution.id))
    setConfirmDeleteId(null)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setDeleted({ solution: kept, index })
    undoTimeoutRef.current = setTimeout(() => setDeleted(null), UNDO_WINDOW_MS)
  }

  const handleUndoDelete = async () => {
    if (!deleted) return
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    const { solution, index } = deleted
    setDeleted(null)
    try {
      await restoreSolution(solution)
    } catch {
      return
    }
    setSolutions((current) => {
      const next = [...(current ?? [])]
      next.splice(Math.min(index, next.length), 0, solution)
      return next
    })
  }

  if (loadFailed && solutions === null) {
    return (
      <LoadError
        onRetry={() => {
          setLoadFailed(false)
          setReloadKey((key) => key + 1)
        }}
      />
    )
  }
  if (solutions === null) return <SkeletonList />

  const undoToast = deleted && (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-warm-border bg-navy px-4 py-3 text-sm text-paper shadow-lg"
    >
      <span>{t('archive.solutions.deletedUndo')}</span>
      <button type="button" onClick={() => void handleUndoDelete()} className="font-bold text-amber hover:underline">
        {t('create.question.undo')}
      </button>
    </div>
  )

  if (solutions.length === 0) {
    return (
      <>
        <div
          data-purpose="solutions-empty-state"
          className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center"
        >
          <CalculatorIcon className="h-8 w-8 text-muted" />
          <div>
            <p className="text-sm font-semibold text-ink">{t('archive.solutions.empty.title')}</p>
            <p className="mt-1 text-xs text-muted">{t('archive.solutions.empty.subtitle')}</p>
          </div>
          <Link
            to="/solve"
            className="mt-1 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
          >
            {t('archive.solutions.empty.cta')}
          </Link>
        </div>
        {undoToast}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('archive.solutions.searchPlaceholder')}
          aria-label={t('archive.solutions.searchPlaceholder')}
          className="w-full rounded-lg border border-warm-border bg-card py-2 pr-3 pl-9 text-sm text-ink placeholder:text-muted"
        />
      </div>

      {filtered.length === 0 ? (
        <p data-purpose="solutions-no-matches" className="rounded-[14px] border border-warm-border bg-card p-6 text-center text-sm text-muted">
          {t('archive.solutions.noMatches')}
        </p>
      ) : (
        <ul data-purpose="solutions-list" className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
          {filtered.map((solution) => {
            const thumbnailUrl = thumbnailUrls.get(solution.id)
            const topic = solution.result.topic || t('solve.prefill.topicLabel')
            return (
              <li key={solution.id} data-purpose="solution-row" className="flex items-center gap-3 p-4 md:gap-4 md:p-5">
                <Link to={`/archive/solutions/${solution.id}`} className="group flex min-w-0 flex-1 items-center gap-3 md:gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-warm-border bg-paper">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt={t('archive.solutions.thumbnailAlt')} className="h-full w-full object-cover" />
                    ) : (
                      <CalculatorIcon className="h-5 w-5 text-muted" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate text-sm font-semibold text-ink group-hover:text-amber-text">{topic}</span>
                    <span className="block truncate text-xs text-ink/80">
                      <MathText text={solution.result.question} />
                    </span>
                    <span className="block truncate text-xs text-muted">{formatDate(solution.createdAt, i18n.language)}</span>
                  </span>
                </Link>

                {confirmDeleteId === solution.id ? (
                  <span className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                    <span className="text-xs font-medium text-ink">{t('archive.solutions.confirmDelete')}</span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDeleteConfirmed(solution)}
                        className="rounded-lg bg-error/10 px-2.5 py-1.5 text-xs font-bold text-error hover:bg-error/20"
                      >
                        {t('archive.solutions.delete')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink"
                      >
                        {t('create.question.cancelAction')}
                      </button>
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    title={t('archive.solutions.delete')}
                    aria-label={t('archive.solutions.deleteLabel', { topic })}
                    onClick={() => setConfirmDeleteId(solution.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-error/10 hover:text-error"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {undoToast}
    </div>
  )
}
