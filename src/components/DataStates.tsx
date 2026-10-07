import { useTranslation } from 'react-i18next'

interface SkeletonListProps {
  rows?: number
  label?: string
}

/** Calm placeholder rows while account data loads (shimmer is off under prefers-reduced-motion). */
export function SkeletonList({ rows = 4, label }: SkeletonListProps) {
  const { t } = useTranslation()
  return (
    <div data-purpose="skeleton-list" role="status" aria-busy="true" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label ?? t('data.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className="h-16 rounded-[14px] border border-warm-border bg-card">
          <div className="m-4 h-3 w-1/3 animate-pulse rounded-full bg-warm-border motion-reduce:animate-none" />
          <div className="mx-4 h-3 w-2/3 animate-pulse rounded-full bg-warm-border/60 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  )
}

interface LoadErrorProps {
  onRetry: () => void
  message?: string
}

/** Error card with a retry button, for a list or page whose data could not be loaded. */
export function LoadError({ onRetry, message }: LoadErrorProps) {
  const { t } = useTranslation()
  return (
    <div data-purpose="load-error" role="alert" className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-8 text-center">
      <p className="text-sm font-semibold text-ink">{message ?? t('data.loadFailed')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-10 rounded-xl border border-warm-border bg-card px-4 py-2 text-sm font-bold text-navy transition-colors hover:border-amber"
      >
        {t('data.retry')}
      </button>
    </div>
  )
}
