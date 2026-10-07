import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AuthCard, AuthHeading } from '../../components/auth/AuthLayout'
import { MIN_PASSWORD_LENGTH, isNetworkError } from '../../components/auth/authHelpers'
import { FormMessage, PasswordStrengthHint, PrimaryButton, TextField } from '../../components/auth/fields'
import { AuthSplash } from '../../components/auth/RequireAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useAuth } from '../../lib/auth/authStore'
import { supabase } from '../../lib/supabase'

/** Set a new password. The reset link signs the user in (see the callback page); without that session there is nothing to change. */
export default function ResetPasswordPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('auth.reset.title'))
  const navigate = useNavigate()
  const { status } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<'network' | 'generic' | null>(null)
  const [done, setDone] = useState(false)

  if (status === 'loading') return <AuthSplash />

  if (status === 'signedOut') {
    return (
      <AuthCard>
        <AuthHeading title={t('auth.callback.expiredTitle')} subtitle={t('auth.reset.noSession')} />
        <Link
          to="/forgot-password"
          className="flex h-12 w-full items-center justify-center rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-colors hover:bg-amber-hover"
        >
          {t('auth.reset.requestNew')}
        </Link>
      </AuthCard>
    )
  }

  const passwordError = submitted && password.length < MIN_PASSWORD_LENGTH ? t('auth.passwordTooShort') : null
  const confirmError = submitted && password !== confirm ? t('auth.passwordMismatch') : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setProblem(null)
    if (password.length < MIN_PASSWORD_LENGTH || password !== confirm) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setProblem(isNetworkError(error) ? 'network' : 'generic')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <AuthCard>
        <AuthHeading title={t('auth.reset.success')} />
        <PrimaryButton type="button" onClick={() => navigate('/', { replace: true })}>
          {t('auth.reset.continue')}
        </PrimaryButton>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthHeading title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} />
      <form onSubmit={(event) => void submit(event)} noValidate data-purpose="reset-form" className="space-y-4">
        <TextField label={t('auth.reset.newPassword')} type="password" name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} error={passwordError}>
          <PasswordStrengthHint password={password} />
        </TextField>
        <TextField label={t('auth.confirmPassword')} type="password" name="confirm" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} error={confirmError} />
        {problem && <FormMessage tone="error">{problem === 'network' ? t('auth.networkError') : t('auth.genericError')}</FormMessage>}
        <PrimaryButton busy={busy}>{busy ? t('auth.reset.submitting') : t('auth.reset.submit')}</PrimaryButton>
      </form>
    </AuthCard>
  )
}
