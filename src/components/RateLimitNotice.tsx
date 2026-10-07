import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RATE_LIMITED_EVENT } from '../lib/auth/apiFetch'

const VISIBLE_MS = 6000

/** Navy toast shown when any API call is answered with "too many requests". */
export default function RateLimitNotice() {
  const { t } = useTranslation()
  const [shownAt, setShownAt] = useState<number | null>(null)

  useEffect(() => {
    const handle = () => setShownAt(Date.now())
    window.addEventListener(RATE_LIMITED_EVENT, handle)
    return () => window.removeEventListener(RATE_LIMITED_EVENT, handle)
  }, [])

  useEffect(() => {
    if (shownAt === null) return
    const timer = setTimeout(() => setShownAt(null), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [shownAt])

  if (shownAt === null) return null
  return (
    <div
      data-purpose="rate-limit-notice"
      role="status"
      className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-warm-border bg-navy px-4 py-3 text-sm text-paper shadow-lg"
    >
      {t('errors.rateLimited')}
    </div>
  )
}
