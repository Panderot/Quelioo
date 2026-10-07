import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthCard, AuthHeading } from '../../components/auth/AuthLayout'
import { callbackUrl, isNetworkError, isValidEmail, startCooldown, useCooldown } from '../../components/auth/authHelpers'
import { FormMessage, OutlineButton, TextField } from '../../components/auth/fields'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { supabase } from '../../lib/supabase'

interface CheckEmailState {
  email?: string
  kind?: 'signup' | 'recovery'
}

/** "Check your email" for sign-up confirmation and password-reset links, with a resend button and a 60 s cooldown. */
export default function CheckEmailPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('auth.checkEmail.title'))
  const location = useLocation()
  const state = (location.state ?? {}) as CheckEmailState
  const kind = state.kind === 'recovery' ? 'recovery' : 'signup'
  const [typedEmail, setTypedEmail] = useState('')
  const email = (state.email ?? typedEmail).trim()
  const cooldownKey = `${kind}:${email.toLowerCase()}`
  const cooldown = useCooldown(cooldownKey)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'sent' | 'failed' | null>(null)

  const resend = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!isValidEmail(email) || cooldown > 0) return
    setBusy(true)
    setResult(null)
    const { error } =
      kind === 'recovery'
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl() })
        : await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackUrl() } })
    setBusy(false)
    // The answer never says whether the address has an account; only a network failure is reported.
    if (error && isNetworkError(error)) {
      setResult('failed')
      return
    }
    startCooldown(cooldownKey)
    setResult('sent')
  }

  const body = !email ? t('auth.checkEmail.bodyNoEmail') : kind === 'recovery' ? t('auth.forgot.sentBody', { email }) : t('auth.checkEmail.body', { email })

  return (
    <AuthCard>
      <AuthHeading title={t('auth.checkEmail.title')} subtitle={body} />
      <p className="text-sm text-muted">{t('auth.checkEmail.spam')}</p>
      <form onSubmit={(event) => void resend(event)} noValidate data-purpose="check-email-form" className="space-y-3">
        {!state.email && <TextField label={t('auth.email')} type="email" name="email" autoComplete="email" inputMode="email" value={typedEmail} onChange={(event) => setTypedEmail(event.target.value)} hint={t('auth.checkEmail.noAddress')} />}
        {result === 'sent' && <FormMessage tone="success">{t('auth.checkEmail.resent')}</FormMessage>}
        {result === 'failed' && <FormMessage tone="error">{t('auth.checkEmail.resendFailed')}</FormMessage>}
        <OutlineButton type="submit" disabled={busy || cooldown > 0 || !isValidEmail(email)}>
          {cooldown > 0 ? t('auth.checkEmail.resendIn', { seconds: cooldown }) : t('auth.checkEmail.resend')}
        </OutlineButton>
      </form>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link to="/sign-in" className="font-semibold text-amber-text hover:underline">
          {t('auth.backToSignIn')}
        </Link>
        {kind === 'signup' && (
          <Link to="/sign-up" className="font-semibold text-muted hover:underline">
            {t('auth.checkEmail.wrongEmail')}
          </Link>
        )}
      </div>
    </AuthCard>
  )
}
