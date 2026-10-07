import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'

import { AuthCard, AuthHeading } from '../../components/auth/AuthLayout'
import { MIN_PASSWORD_LENGTH, callbackUrl, isNetworkError, isValidEmail, resolveNext, startCooldown, storeNext, useEnabledProviders } from '../../components/auth/authHelpers'
import { FormMessage, GoogleButton, OrDivider, PasswordStrengthHint, PrimaryButton, TextField } from '../../components/auth/fields'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useAuth } from '../../lib/auth/authStore'
import { supabase } from '../../lib/supabase'

type Problem = 'network' | 'rate' | 'generic' | null

export default function SignUpPage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('auth.signUp.title'))
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useAuth()
  const providers = useEnabledProviders()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)

  const next = resolveNext(location.search)
  if (status === 'signedIn') return <Navigate to={next} replace />

  const emailError = submitted && !isValidEmail(email) ? t('auth.emailInvalid') : null
  const passwordError = submitted && password.length < MIN_PASSWORD_LENGTH ? t('auth.passwordTooShort') : null
  const termsError = submitted && !accepted ? t('auth.signUp.termsRequired') : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setProblem(null)
    if (!isValidEmail(email) || password.length < MIN_PASSWORD_LENGTH || !accepted) return
    setBusy(true)
    storeNext(next === '/' ? null : next)
    const language = i18n.resolvedLanguage ?? 'en'
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: callbackUrl(), data: { ui_language: language, ...(name.trim() ? { display_name: name.trim() } : {}) } },
    })
    setBusy(false)
    if (error) {
      // Never hint whether the address is taken: only network and rate-limit problems are shown.
      if (isNetworkError(error)) setProblem('network')
      else if (error.code === 'over_email_send_rate_limit' || error.status === 429) setProblem('rate')
      else if (error.code === 'weak_password') setProblem(null)
      else setProblem('generic')
      return
    }
    // With email confirmation switched off the sign-up signs in at once; the redirect above takes over.
    if (data.session) return
    startCooldown(`signup:${email.trim().toLowerCase()}`)
    navigate('/check-email', { state: { email: email.trim(), kind: 'signup' }, replace: true })
  }

  const google = async () => {
    storeNext(next === '/' ? null : next)
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } })
  }

  return (
    <AuthCard>
      <AuthHeading title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')} />
      {providers.google && (
        <>
          <GoogleButton onClick={() => void google()} />
          <OrDivider />
        </>
      )}
      <form onSubmit={(event) => void submit(event)} noValidate data-purpose="sign-up-form" className="space-y-4">
        <TextField label={t('auth.displayName')} optionalLabel={t('auth.optional')} type="text" name="name" autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        <TextField
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
        />
        <TextField label={t('auth.password')} type="password" name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} error={passwordError}>
          <PasswordStrengthHint password={password} />
        </TextField>
        <div className="space-y-1.5">
          <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="terms"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              aria-invalid={termsError ? true : undefined}
              className="mt-0.5 h-5 w-5 shrink-0 accent-amber"
            />
            <span>
              <Trans
                i18nKey="auth.signUp.terms"
                components={{
                  terms: <Link to="/kullanim-sartlari" target="_blank" className="font-semibold text-amber-text underline" />,
                  privacy: <Link to="/gizlilik" target="_blank" className="font-semibold text-amber-text underline" />,
                }}
              />
            </span>
          </label>
          {termsError && (
            <p role="alert" className="text-xs font-semibold text-error">
              {termsError}
            </p>
          )}
        </div>
        {problem && <FormMessage tone="error">{problem === 'network' ? t('auth.networkError') : problem === 'rate' ? t('errors.rateLimited') : t('auth.genericError')}</FormMessage>}
        <PrimaryButton busy={busy}>{busy ? t('auth.signUp.submitting') : t('auth.signUp.submit')}</PrimaryButton>
      </form>
      <p className="text-center text-sm text-muted">
        {t('auth.signUp.hasAccount')}{' '}
        <Link to={`/sign-in${location.search}`} className="font-semibold text-amber-text hover:underline">
          {t('auth.signUp.signInLink')}
        </Link>
      </p>
    </AuthCard>
  )
}
