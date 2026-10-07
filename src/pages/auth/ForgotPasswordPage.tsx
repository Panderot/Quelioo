import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthCard, AuthHeading } from '../../components/auth/AuthLayout'
import { callbackUrl, isNetworkError, isValidEmail, startCooldown } from '../../components/auth/authHelpers'
import { FormMessage, PrimaryButton, TextField } from '../../components/auth/fields'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { supabase } from '../../lib/supabase'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('auth.forgot.title'))
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [networkFailed, setNetworkFailed] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setNetworkFailed(false)
    if (!isValidEmail(email)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl() })
    setBusy(false)
    if (error && isNetworkError(error)) {
      setNetworkFailed(true)
      return
    }
    // Same screen whether or not the address has an account.
    startCooldown(`recovery:${email.trim().toLowerCase()}`)
    navigate('/check-email', { state: { email: email.trim(), kind: 'recovery' }, replace: true })
  }

  return (
    <AuthCard>
      <AuthHeading title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} />
      <form onSubmit={(event) => void submit(event)} noValidate data-purpose="forgot-form" className="space-y-4">
        <TextField
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={invalid ? t('auth.emailInvalid') : null}
        />
        {networkFailed && <FormMessage tone="error">{t('auth.networkError')}</FormMessage>}
        <PrimaryButton busy={busy}>{busy ? t('auth.forgot.submitting') : t('auth.forgot.submit')}</PrimaryButton>
      </form>
      <Link to="/sign-in" className="block text-center text-sm font-semibold text-amber-text hover:underline">
        {t('auth.backToSignIn')}
      </Link>
    </AuthCard>
  )
}
