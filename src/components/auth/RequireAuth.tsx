import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../../lib/auth/authStore'
import { LogoMark } from '../Logo'
import { AuthCard, AuthHeading } from './AuthLayout'

/** Calm full-page splash while the saved session is being checked. */
export function AuthSplash() {
  const { t } = useTranslation()
  return (
    <div data-purpose="auth-splash" role="status" aria-busy="true" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
      <LogoMark className="h-10 w-10 animate-pulse motion-reduce:animate-none" tone="onLight" />
      <span className="sr-only">{t('auth.loading')}</span>
    </div>
  )
}

/** Shown when the build has no Supabase settings (and is not the fake test backend). */
export function ConfigMissing() {
  const { t } = useTranslation()
  return (
    <div data-purpose="config-missing" className="flex min-h-screen items-center justify-center bg-paper p-4">
      <AuthCard>
        <AuthHeading title={t('auth.config.title')} subtitle={t('auth.config.body')} />
      </AuthCard>
    </div>
  )
}

/** Everything behind it needs a session; signed-out visitors go to sign-in and come back afterwards. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <AuthSplash />
  if (status === 'signedOut') {
    const next = `${location.pathname}${location.search}${location.hash}`
    const query = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
    return <Navigate to={`/sign-in${query}`} replace />
  }
  return <>{children}</>
}
