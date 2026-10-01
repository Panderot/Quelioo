import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import SolutionView from '../components/SolutionView'
import { CalculatorIcon } from '../components/icons'
import { getSolution } from '../lib/solutionStorage'
import type { StoredSolution } from '../lib/solutionStorage'

const BACK_HREF = '/archive?tab=solutions'

function formatCreatedAt(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

/** A saved solution, reopened from the Archive in the same view Solve shows right after solving. */
export default function ArchiveSolutionPage() {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams()
  const [loaded, setLoaded] = useState<{ id: string; solution: StoredSolution | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    void getSolution(id).then((solution) => {
      if (!cancelled) setLoaded({ id, solution })
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const solution = loaded?.id === id ? loaded.solution : undefined
  const thumbnailUrl = useMemo(() => (solution?.thumbnail ? URL.createObjectURL(solution.thumbnail) : null), [solution])
  useEffect(() => () => {
    if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
  }, [thumbnailUrl])

  const backLink = (
    <Link to={BACK_HREF} className="text-xs font-semibold text-amber-text hover:underline">
      {t('archive.solutions.detail.backToSolutions')}
    </Link>
  )

  if (solution === undefined) return null

  if (solution === null) {
    return (
      <div
        data-purpose="solution-not-found"
        className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center"
      >
        <CalculatorIcon className="h-8 w-8 text-muted" />
        <div>
          <p className="text-sm font-semibold text-ink">{t('archive.solutions.detail.notFoundTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('archive.solutions.detail.notFoundBody')}</p>
        </div>
        {backLink}
      </div>
    )
  }

  return (
    <>
      <section data-purpose="page-intro" className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight break-words text-navy lg:text-3xl">
            {solution.result.topic || t('archive.tabs.solutions')}
          </h1>
          <p className="text-sm font-normal text-muted">{formatCreatedAt(solution.createdAt, i18n.language)}</p>
        </div>
        {backLink}
      </section>

      {thumbnailUrl && (
        <img
          data-purpose="solution-thumbnail"
          src={thumbnailUrl}
          alt={t('archive.solutions.thumbnailAlt')}
          className="mx-auto block max-h-[50vh] max-w-full rounded-2xl border border-warm-border object-contain"
        />
      )}

      <SolutionView
        key={solution.id}
        result={solution.result}
        solutionId={solution.id}
        initialExtras={solution.extras}
      />
    </>
  )
}
