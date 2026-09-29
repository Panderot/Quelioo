import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { HomeIcon } from '../components/icons'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div
      data-purpose="not-found-page"
      className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center"
    >
      <HomeIcon className="h-8 w-8 text-muted" />
      <div>
        <p className="text-sm font-semibold text-ink">{t('notFound.title')}</p>
        <p className="mt-1 text-xs text-muted">{t('notFound.subtitle')}</p>
      </div>
      <Link
        to="/"
        className="mt-1 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
      >
        {t('notFound.cta')}
      </Link>
    </div>
  )
}
