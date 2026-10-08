import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthCard, AuthHeading } from '../../components/auth/AuthLayout'
import { readStoredNext, storeNext } from '../../components/auth/authHelpers'
import { AuthSplash } from '../../components/auth/RequireAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useAuth } from '../../lib/auth/authStore'
import { supabase } from '../../lib/supabase'
import type { EmailOtpType } from '@supabase/supabase-js'

type Outcome = { kind: 'ok'; destination: string } | { kind: 'expired' } | { kind: 'invalid' } | { kind: 'denied' } | { kind: 'pending' }

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

// One verification per link: React StrictMode runs effects twice in development and a token can be
// used only once, so the first attempt's promise is shared by every later run for the same URL.
const attempts = new Map<string, Promise<Outcome>>()

function readParams(search: string, hash: string): URLSearchParams {
  const params = new URLSearchParams(search)
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ''))) if (!params.has(key)) params.set(key, value)
  return params
}

function failureOf(error: { code?: string; message?: string } | null | undefined): Outcome {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase()
  return text.includes('expired') ? { kind: 'expired' } : { kind: 'invalid' }
}

async function verify(search: string, hash: string): Promise<Outcome> {
  const params = readParams(search, hash)
  const errorCode = params.get('error_code') ?? params.get('error')
  if (errorCode) {
    if (errorCode === 'otp_expired') return { kind: 'expired' }
    if (errorCode === 'access_denied' && !params.get('error_code')) return { kind: 'denied' }
    return /expired/i.test(params.get('error_description') ?? '') ? { kind: 'expired' } : { kind: 'invalid' }
  }
  const stored = readStoredNext() ?? '/'

  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) return failureOf(error)
    // Changing the address needs both mailboxes to confirm: after the first link the change is still pending.
    if (type === 'email_change' && data.user?.new_email) return { kind: 'pending' }
    if (type === 'recovery') return { kind: 'ok', destination: '/reset-password' }
    if (type === 'email_change') return { kind: 'ok', destination: '/account?emailChanged=1' }
    return { kind: 'ok', destination: stored }
  }

  const code = params.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return failureOf(error)
    return { kind: 'ok', destination: stored }
  }
  return { kind: 'invalid' }
}

/** Landing page for email links and the Google round trip: verifies the link, then moves on or explains. */
export default function AuthCallbackPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('auth.callback.verifying'))
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useAuth()
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    const key = `${location.search}${location.hash}`
    let attempt = attempts.get(key)
    if (!attempt) {
      attempt = verify(location.search, location.hash)
      attempts.set(key, attempt)
    }
    let cancelled = false
    void attempt.then((result) => {
      if (!cancelled) setOutcome(result)
    })
    return () => {
      cancelled = true
    }
  }, [location.search, location.hash])

  const destination = outcome?.kind === 'ok' ? outcome.destination : null
  useEffect(() => {
    // Wait for the session to reach the app before moving on, so the protected page never bounces back.
    if (destination && status === 'signedIn') {
      storeNext(null)
      navigate(destination, { replace: true })
    }
  }, [destination, status, navigate])

  if (!outcome || outcome.kind === 'ok') return <AuthSplash />

  if (outcome.kind === 'pending') {
    return (
      <AuthCard>
        <AuthHeading title={t('auth.callback.pendingTitle')} subtitle={t('auth.callback.pendingBody')} />
        <Link to="/account" className="block text-center text-sm font-semibold text-amber-text hover:underline">
          {t('auth.callback.toAccount')}
        </Link>
      </AuthCard>
    )
  }

  const linkType = readParams(location.search, location.hash).get('type')
  const newLinkPath = linkType && linkType !== 'recovery' ? '/check-email' : '/forgot-password'

  const copy =
    outcome.kind === 'expired'
      ? { title: t('auth.callback.expiredTitle'), body: t('auth.callback.expiredBody') }
      : outcome.kind === 'denied'
        ? { title: t('auth.callback.denied'), body: '' }
        : { title: t('auth.callback.invalidTitle'), body: t('auth.callback.invalidBody') }

  return (
    <AuthCard>
      <AuthHeading title={copy.title} subtitle={copy.body || undefined} />
      <div className="space-y-3">
        {outcome.kind !== 'denied' && (
          <Link
            to={newLinkPath}
            className="flex h-12 w-full items-center justify-center rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-colors hover:bg-amber-hover"
          >
            {t('auth.callback.requestNew')}
          </Link>
        )}
        <Link to="/sign-in" className="block text-center text-sm font-semibold text-amber-text hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </div>
    </AuthCard>
  )
}
