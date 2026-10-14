import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthCard, AuthHeading } from '../../components/auth/AuthLayout'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

const SECTIONS = {
  terms: ['use', 'content', 'ai'],
  privacy: ['data', 'ai', 'control'],
} as const

/** Placeholder Terms of Use (/kullanim-sartlari) and Privacy Notice (/gizlilik), public, with a visible draft notice. */
export default function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useTranslation()
  useDocumentTitle(t(`legal.${kind}.title`))
  const navigate = useNavigate()
  const location = useLocation()
  // "Back" returns to where the reader came from (sign-up form, account page); a direct visit goes home.
  const canGoBack = location.key !== 'default'

  return (
    <AuthCard wide>
      <div data-purpose={`legal-${kind}`} className="space-y-6">
        <AuthHeading title={t(`legal.${kind}.title`)} subtitle={t(`legal.${kind}.intro`)} />
        <div data-purpose="legal-draft-notice" role="note" className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-ink">
          <p className="font-bold text-amber-text">{t('legal.draftTitle')}</p>
          <p className="mt-0.5">{t('legal.draftBody')}</p>
        </div>
        {SECTIONS[kind].map((section) => (
          <section key={section} className="space-y-1.5">
            <h2 className="font-serif text-lg font-semibold text-navy">{t(`legal.${kind}.${section}Title`)}</h2>
            <p className="text-sm leading-relaxed text-ink">{t(`legal.${kind}.${section}Body`)}</p>
          </section>
        ))}
        {canGoBack ? (
          <button type="button" onClick={() => navigate(-1)} className="text-sm font-semibold text-amber-text hover:underline">
            {t('legal.back')}
          </button>
        ) : (
          <Link to="/" className="text-sm font-semibold text-amber-text hover:underline">
            {t('legal.back')}
          </Link>
        )}
      </div>
    </AuthCard>
  )
}
