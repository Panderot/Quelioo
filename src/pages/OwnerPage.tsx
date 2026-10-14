import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchUsageSummary } from '../api/account'
import type { UsageSummary } from '../api/account'
import { SkeletonList } from '../components/DataStates'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAuth } from '../lib/auth/authStore'
import { formatUsd } from '../lib/modelPricing'
import NotFoundPage from './NotFoundPage'

/** Only accounts whose profile role is 'admin' see the owner page; everyone else gets the not-found page. */
export default function OwnerPage() {
  const { profile, profileFailed } = useAuth()
  if (profile === null && !profileFailed) return <SkeletonList rows={2} />
  return profile?.role === 'admin' ? <OwnerPageContent /> : <NotFoundPage />
}

/** Owner-only view (no navigation link): the only place in the app that shows spend. Only admin accounts
 * reach it, so students never see a dollar amount. */
function OwnerPageContent() {
  const { t } = useTranslation()
  useDocumentTitle(t('ownerPage.title'))

  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [usageFailed, setUsageFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchUsageSummary().then(
      (summary) => !cancelled && setUsage(summary),
      () => !cancelled && setUsageFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">{t('ownerPage.title')}</h1>
        <p className="text-sm font-normal text-muted">{t('ownerPage.subtitle')}</p>
      </section>

      <section data-purpose="owner-spend" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5">
        <p data-purpose="owner-month-spend" className="text-sm font-semibold text-ink">
          {usage === null ? (usageFailed ? t('ownerUsage.loadFailed') : t('data.loading')) : t('ownerUsage.total', { cost: formatUsd(usage.totalUsd) })}
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
      </section>
    </>
  )
}
