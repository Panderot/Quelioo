import { useTranslation } from 'react-i18next'

import { SparkleIcon, SpinnerIcon } from './icons'

interface GenerateButtonProps {
  isLoading: boolean
  onClick: () => void
}

export default function GenerateButton({ isLoading, onClick }: GenerateButtonProps) {
  const { t } = useTranslation()

  return (
    <section data-purpose="primary-action-cta" className="pt-2 pb-6">
      <button
        type="button"
        onClick={onClick}
        aria-busy={isLoading}
        className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-brand-600 via-indigo-600 to-royal-600 p-4 text-base font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.008] hover:shadow-indigo-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 active:scale-[0.995]"
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
        {isLoading ? (
          <SpinnerIcon className="h-5 w-5 text-white" />
        ) : (
          <SparkleIcon className="h-5 w-5 text-amber-300 transition-transform animate-spin-slow group-hover:rotate-12" />
        )}
        <span className="tracking-wide">{isLoading ? t('cta.generating') : t('cta.generate')}</span>
      </button>
    </section>
  )
}
