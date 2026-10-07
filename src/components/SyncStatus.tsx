import { useTranslation } from 'react-i18next'

import { useSyncStatus } from '../lib/data/writeQueue'
import { SpinnerIcon, WarningIcon } from './icons'

/** Small pill next to the language switcher: nothing while everything is saved. */
export default function SyncStatus() {
  const { t } = useTranslation()
  const { pending, failed } = useSyncStatus()
  if (!failed && pending === 0) return null
  return (
    <span
      data-purpose="sync-status"
      role="status"
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${failed ? 'bg-error/5 text-error' : 'text-muted'}`}
    >
      {failed ? <WarningIcon className="h-3.5 w-3.5" /> : <SpinnerIcon className="h-3.5 w-3.5" />}
      {failed ? t('sync.failed') : t('sync.saving')}
    </span>
  )
}
