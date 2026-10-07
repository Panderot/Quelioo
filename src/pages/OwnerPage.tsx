import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchUsageSummary } from '../api/account'
import type { UsageSummary } from '../api/account'
import { getLessonStatus, verifyAndStoreLessonAccessCode } from '../api/lesson'
import { SkeletonList } from '../components/DataStates'
import { LockIcon } from '../components/icons'
import OwnerAccessGate from '../components/OwnerAccessGate'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAuth } from '../lib/auth/authStore'
import { formatUsd } from '../lib/lesson'
import { getAllLessons, lessonCostUsd, type StoredLesson } from '../lib/lessonStorage'
import { clearStoredOwnerAccessCode, getStoredOwnerAccessCode } from '../lib/ownerAccessCode'
import NotFoundPage from './NotFoundPage'

/** Only accounts whose profile role is 'admin' see the owner page; everyone else gets the not-found page. */
export default function OwnerPage() {
  const { profile, profileFailed } = useAuth()
  if (profile === null && !profileFailed) return <SkeletonList rows={2} />
  return profile?.role === 'admin' ? <OwnerPageContent /> : <NotFoundPage />
}

/** Owner-only view (no navigation link): the only place in the app that shows spend. In production
 * it needs the shared owner code; students never get a code, so they never see a dollar amount. */
function OwnerPageContent() {
  const { t } = useTranslation()
  useDocumentTitle(t('ownerPage.title'))

  const [requiresAccessCode, setRequiresAccessCode] = useState(true)
  const [budget, setBudget] = useState<number | null>(null)
  const [unlocked, setUnlocked] = useState(() => Boolean(getStoredOwnerAccessCode()))
  const [lessons, setLessons] = useState<StoredLesson[]>([])
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [usageFailed, setUsageFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getLessonStatus().then((status) => {
      if (cancelled) return
      setRequiresAccessCode(status.requiresAccessCode)
      setBudget(status.monthlyBudgetUsd)
    })
    void getAllLessons().then((all) => !cancelled && setLessons(all))
    void fetchUsageSummary().then(
      (summary) => !cancelled && setUsage(summary),
      () => !cancelled && setUsageFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const allowed = unlocked || !requiresAccessCode

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">{t('ownerPage.title')}</h1>
        <p className="text-sm font-normal text-muted">{t('ownerPage.subtitle')}</p>
      </section>

      {!allowed ? (
        <div className="mx-auto max-w-sm">
          <OwnerAccessGate verify={verifyAndStoreLessonAccessCode} onUnlocked={() => setUnlocked(true)} />
        </div>
      ) : (
        <section data-purpose="owner-spend" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5">
          <p data-purpose="owner-month-spend" className="text-sm font-semibold text-ink">
            {usage === null
              ? usageFailed
                ? t('ownerUsage.loadFailed')
                : t('data.loading')
              : budget !== null
                ? t('ownerPage.monthSpendBudget', { cost: formatUsd(usage.totalUsd), budget: formatUsd(budget) })
                : t('ownerUsage.total', { cost: formatUsd(usage.totalUsd) })}
          </p>
          {usage && usage.byFeature.length > 0 && (
            <div data-purpose="owner-usage-by-feature" className="space-y-1">
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('ownerUsage.byFeature')}</p>
              <ul className="divide-y divide-warm-border text-xs text-ink">
                {usage.byFeature.map((entry) => (
                  <li key={entry.feature} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate">{entry.feature}</span>
                    <span className="shrink-0 text-muted">{formatUsd(entry.costUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lessons.length > 0 && (
            <ul className="divide-y divide-warm-border text-xs text-ink">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{lesson.title}</span>
                  <span className="shrink-0 text-muted">{formatUsd(lessonCostUsd(lesson))}</span>
                </li>
              ))}
            </ul>
          )}
          {unlocked && (
            <button
              type="button"
              onClick={() => {
                clearStoredOwnerAccessCode()
                setUnlocked(false)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-error/40 hover:text-error"
            >
              <LockIcon className="h-3.5 w-3.5" />
              {t('ownerAccess.lock')}
            </button>
          )}
        </section>
      )}
    </>
  )
}
