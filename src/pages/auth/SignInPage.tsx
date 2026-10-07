import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthCard, AuthHeading } from '../../components/auth/AuthLayout'
import { callbackUrl, isNetworkError, isValidEmail, resolveNext, storeNext, useEnabledProviders } from '../../components/auth/authHelpers'
import { FormMessage, GoogleButton, OrDivider, PrimaryButton, TextField } from '../../components/auth/fields'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useAuth } from '../../lib/auth/authStore'
import { supabase } from '../../lib/supabase'

type Problem = 'invalid' | 'unconfirmed' | 'network' | 'generic' | null

export default function SignInPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('auth.signIn.title'))
  const location = useLocation()
  const { status } = useAuth()
  const providers = useEnabledProviders()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)
  const [resendNote, setResendNote] = useState(false)

  const next = resolveNext(location.search)
  // A signed-in visitor has nothing to do here: back to where they were headed.
  if (status === 'signedIn') return <Navigate to={next} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setProblem(null)
    setResendNote(false)
    if (!isValidEmail(email)) {
      setEmailError(true)
      return
    }
    setEmailError(false)
    setBusy(true)
    storeNext(next === '/' ? null : next)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (!error) return // The session event moves the page on (see the redirect above).
    if (error.code === 'email_not_confirmed') setProblem('unconfirmed')
    else if (isNetworkError(error)) setProblem('network')
    else if (error.status === 400 || error.status === 401 || error.code === 'invalid_credentials') setProblem('invalid')
    else setProblem('generic')
  }

  const resend = async () => {
    setResendNote(false)
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: callbackUrl() } })
    if (!error || !isNetworkError(error)) setResendNote(true)
  }

  const google = async () => {
    storeNext(next === '/' ? null : next)
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } })
  }

  const message = problem === 'invalid' ? t('auth.signIn.invalid') : problem === 'unconfirmed' ? t('auth.signIn.unconfirmed') : problem === 'network' ? t('auth.networkError') : t('auth.genericError')

  return (
    <AuthCard>
      <AuthHeading title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')} />
      {providers.google && (
        <>
          <GoogleButton onClick={() => void google()} />
          <OrDivider />
        </>
      )}
      <form onSubmit={(event) => void submit(event)} noValidate data-purpose="sign-in-form" className="space-y-4">
        <TextField
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError ? t('auth.emailInvalid') : null}
        />
        <TextField label={t('auth.password')} type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-amber-text hover:underline">
            {t('auth.signIn.forgot')}
          </Link>
        </div>
        {problem && <FormMessage tone="error">{message}</FormMessage>}
        {problem === 'unconfirmed' && (
          <div className="space-y-2">
            <button type="button" onClick={() => void resend()} className="text-sm font-semibold text-amber-text hover:underline">
              {t('auth.signIn.resend')}
            </button>
            {resendNote && <FormMessage tone="success">{t('auth.signIn.resendSent')}</FormMessage>}
          </div>
        )}
        <PrimaryButton busy={busy} disabled={!email || !password}>
          {busy ? t('auth.signIn.submitting') : t('auth.signIn.submit')}
        </PrimaryButton>
      </form>
      <p className="text-center text-sm text-muted">
        {t('auth.signIn.noAccount')}{' '}
        <Link to={`/sign-up${location.search}`} className="font-semibold text-amber-text hover:underline">
          {t('auth.signIn.signUpLink')}
        </Link>
      </p>
    </AuthCard>
  )
}
