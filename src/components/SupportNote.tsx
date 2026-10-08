import { useTranslation } from 'react-i18next'

export const SUPPORT_EMAIL = 'info@motiqai.com'

/** "Need help? info@motiqai.com": the one support address, shown in the auth footer, the account page, the legal pages and load errors. */
export default function SupportNote({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <p data-purpose="support-note" className={`text-xs text-muted ${className}`}>
      {t('support.prefix')}{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-amber-text underline">
        {SUPPORT_EMAIL}
      </a>
    </p>
  )
}
