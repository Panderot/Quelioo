import { useTranslation } from 'react-i18next'

import { SpinnerIcon, SunIcon } from './icons'

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
        disabled={isLoading}
        aria-busy={isLoading}
        className="group flex h-14 w-full items-center justify-center gap-3 rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-all hover:-translate-y-px hover:bg-amber-hover hover:shadow-lg hover:shadow-amber/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
      >
        {isLoading ? <SpinnerIcon className="h-5 w-5 text-navy" /> : <SunIcon className="h-5 w-5 text-navy" />}
        <span className="tracking-wide">{isLoading ? t('cta.generating') : t('cta.generate')}</span>
      </button>
    </section>
  )
}
