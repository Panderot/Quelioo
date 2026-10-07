import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { AccountApiError, deleteMyAccount, exportMyData } from '../api/account'
import DeleteAccountDialog from '../components/auth/DeleteAccountDialog'
import ImportDialog from '../components/auth/ImportDialog'
import { DATA_IMPORTED_EVENT, describeSummary } from '../components/auth/importFormat'
import { MIN_PASSWORD_LENGTH, callbackUrl, isNetworkError, isValidEmail } from '../components/auth/authHelpers'
import { FormMessage, OutlineButton, PasswordStrengthHint, PrimaryButton, TextField } from '../components/auth/fields'
import Select from '../components/Select'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { signOut, updateProfile, useAuth } from '../lib/auth/authStore'
import type { UiLanguage } from '../lib/auth/authStore'
import { detectLegacyData, getImportState } from '../lib/import/importLocalData'
import type { LegacySummary } from '../lib/import/importLocalData'
import { supabase } from '../lib/supabase'

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'hyw', label: 'Հայերէն (Արեւմտահայերէն)' },
]

function Section({ purpose, title, hint, children }: { purpose: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section data-purpose={purpose} className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-serif text-lg font-semibold text-navy">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export default function AccountPage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('account.title'))
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, profile } = useAuth()

  const [name, setName] = useState(profile?.display_name ?? '')
  const [nameState, setNameState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [emailProblem, setEmailProblem] = useState<string | null>(null)
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordSubmitted, setPasswordSubmitted] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordResult, setPasswordResult] = useState<'done' | 'failed' | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)
  const [legacy, setLegacy] = useState<LegacySummary | null>(null)
  // The summary the open dialog was started with: the page re-checks the device after an import and
  // would otherwise close the dialog before the result and the "remove old copy" offer are shown.
  const [importSummary, setImportSummary] = useState<LegacySummary | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const userId = user?.id ?? null
  // Keep the name field in step once the profile arrives (first load) without overwriting typing later.
  const [seededName, setSeededName] = useState(profile !== null)
  if (profile && !seededName) {
    setSeededName(true)
    setName(profile.display_name)
  }

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const check = () => {
      if (getImportState(userId) === 'imported') {
        setLegacy(null)
        return
      }
      void detectLegacyData().then((summary) => {
        if (!cancelled) setLegacy(summary.total > 0 ? summary : null)
      })
    }
    check()
    window.addEventListener(DATA_IMPORTED_EVENT, check)
    return () => {
      cancelled = true
      window.removeEventListener(DATA_IMPORTED_EVENT, check)
    }
  }, [userId])

  if (!user) return null

  const accountError = (error: unknown): string => (error instanceof AccountApiError ? t(`account.errors.${error.code}`) : t('auth.genericError'))

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    setNameState('saving')
    const ok = await updateProfile({ display_name: name.trim() })
    setNameState(ok ? 'saved' : 'failed')
  }

  const changeLanguage = (value: string) => {
    void i18n.changeLanguage(value)
    void updateProfile({ ui_language: value as UiLanguage })
  }

  const changeEmail = async (event: FormEvent) => {
    event.preventDefault()
    setEmailProblem(null)
    setEmailSentTo(null)
    const address = newEmail.trim()
    if (!isValidEmail(address)) {
      setEmailProblem(t('auth.emailInvalid'))
      return
    }
    if (address.toLowerCase() === user.email.toLowerCase()) {
      setEmailProblem(t('account.email.same'))
      return
    }
    setEmailBusy(true)
    const { error } = await supabase.auth.updateUser({ email: address }, { emailRedirectTo: callbackUrl() })
    setEmailBusy(false)
    if (error) {
      setEmailProblem(isNetworkError(error) ? t('auth.networkError') : t('auth.genericError'))
      return
    }
    setEmailSentTo(address)
    setNewEmail('')
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordSubmitted(true)
    setPasswordResult(null)
    if (password.length < MIN_PASSWORD_LENGTH || password !== confirm) return
    setPasswordBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPasswordBusy(false)
    if (error) {
      setPasswordResult('failed')
      return
    }
    setPasswordResult('done')
    setPassword('')
    setConfirm('')
    setPasswordSubmitted(false)
  }

  const download = async () => {
    setExporting(true)
    setExportFailed(false)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `quelio-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setExportFailed(true)
    } finally {
      setExporting(false)
    }
  }

  const confirmDelete = async () => {
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteMyAccount(user.email)
    } catch (error) {
      setDeleteBusy(false)
      setDeleteError(error instanceof AccountApiError ? accountError(error) : t('account.delete.failed'))
      return
    }
    await signOut()
    navigate('/sign-in', { replace: true })
  }

  const passwordError = passwordSubmitted && password.length < MIN_PASSWORD_LENGTH ? t('auth.passwordTooShort') : null
  const confirmError = passwordSubmitted && password !== confirm ? t('auth.passwordMismatch') : null
  const currentLanguage = LANGUAGE_OPTIONS.some((option) => option.value === (profile?.ui_language ?? i18n.resolvedLanguage)) ? (profile?.ui_language ?? i18n.resolvedLanguage ?? 'en') : 'en'
  const hasPassword = user.providers.includes('email')

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">{t('account.title')}</h1>
        <p className="text-sm font-normal text-muted">{t('account.subtitle')}</p>
      </section>

      {searchParams.get('emailChanged') === '1' && <FormMessage tone="success">{t('auth.callback.emailChanged')}</FormMessage>}

      <Section purpose="account-profile" title={t('account.profile.title')}>
        <form onSubmit={(event) => void saveName(event)} className="space-y-4">
          <TextField label={t('account.profile.displayName')} type="text" name="displayName" autoComplete="name" maxLength={80} value={name} onChange={(event) => { setName(event.target.value); setNameState('idle') }} />
          {nameState === 'saved' && <FormMessage tone="success">{t('account.saved')}</FormMessage>}
          {nameState === 'failed' && <FormMessage tone="error">{t('auth.genericError')}</FormMessage>}
          <OutlineButton type="submit" disabled={nameState === 'saving' || name.trim() === (profile?.display_name ?? '')}>
            {nameState === 'saving' ? t('account.saving') : t('account.save')}
          </OutlineButton>
        </form>
        <div className="space-y-1.5">
          <span id="account-language-label" className="text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('account.profile.language')}
          </span>
          <Select id="account-language" labelledBy="account-language-label" value={currentLanguage} options={LANGUAGE_OPTIONS} onChange={changeLanguage} />
        </div>
      </Section>

      <Section purpose="account-email" title={t('account.email.title')} hint={t('account.email.current', { email: user.email })}>
        <form onSubmit={(event) => void changeEmail(event)} noValidate className="space-y-4">
          <TextField label={t('account.email.new')} type="email" name="newEmail" autoComplete="email" inputMode="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} error={emailProblem} />
          {emailSentTo && <FormMessage tone="success">{t('account.email.sent', { email: emailSentTo })}</FormMessage>}
          <OutlineButton type="submit" disabled={emailBusy || !newEmail}>
            {t('account.email.submit')}
          </OutlineButton>
        </form>
      </Section>

      <Section purpose="account-password" title={t('account.password.title')} hint={hasPassword ? undefined : t('account.password.google')}>
        <form onSubmit={(event) => void changePassword(event)} noValidate className="space-y-4">
          <TextField label={t('account.password.new')} type="password" name="newPassword" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} error={passwordError}>
            <PasswordStrengthHint password={password} />
          </TextField>
          <TextField label={t('account.password.confirm')} type="password" name="confirmPassword" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} error={confirmError} />
          {passwordResult === 'done' && <FormMessage tone="success">{t('account.password.done')}</FormMessage>}
          {passwordResult === 'failed' && <FormMessage tone="error">{t('auth.genericError')}</FormMessage>}
          <OutlineButton type="submit" disabled={passwordBusy || !password}>
            {t('account.password.submit')}
          </OutlineButton>
        </form>
      </Section>

      <Section purpose="account-methods" title={t('account.methods.title')}>
        <ul className="space-y-1.5 text-sm text-ink">
          {user.providers.map((provider) => (
            <li key={provider} data-provider={provider} className="rounded-xl border border-warm-border bg-paper px-4 py-2.5 font-semibold">
              {provider === 'google' ? t('account.methods.google') : t('account.methods.email')}
            </li>
          ))}
        </ul>
      </Section>

      <Section purpose="account-sessions" title={t('account.sessions.title')} hint={t('account.sessions.signOutAllHint')}>
        <div className="flex flex-wrap gap-3">
          <OutlineButton onClick={() => void signOut('local')}>{t('account.sessions.signOut')}</OutlineButton>
          <OutlineButton onClick={() => void signOut('global')}>{t('account.sessions.signOutAll')}</OutlineButton>
        </div>
      </Section>

      <Section purpose="account-data" title={t('account.data.title')} hint={t('account.data.downloadHint')}>
        {exportFailed && <FormMessage tone="error">{t('account.data.downloadFailed')}</FormMessage>}
        <div>
          <OutlineButton onClick={() => void download()} disabled={exporting}>
            {exporting ? t('account.data.downloading') : t('account.data.download')}
          </OutlineButton>
        </div>
      </Section>

      {legacy && (
        <Section purpose="account-import" title={t('account.import.title')} hint={t('account.import.hint', { items: describeSummary(t, legacy) })}>
          <div>
            <PrimaryButton type="button" onClick={() => setImportSummary(legacy)}>
              {t('account.import.button')}
            </PrimaryButton>
          </div>
        </Section>
      )}

      <Section purpose="account-delete" title={t('account.delete.title')} hint={t('account.delete.hint')}>
        <div>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null)
              setDeleteOpen(true)
            }}
            className="min-h-10 w-full rounded-xl bg-error/10 px-4 py-2 text-sm font-bold text-error transition-colors hover:bg-error/20 sm:w-auto"
          >
            {t('account.delete.button')}
          </button>
        </div>
      </Section>

      {importSummary && <ImportDialog userId={user.id} summary={importSummary} onClose={() => setImportSummary(null)} />}
      {deleteOpen && <DeleteAccountDialog email={user.email} busy={deleteBusy} error={deleteError} onConfirm={() => void confirmDelete()} onCancel={() => setDeleteOpen(false)} />}
    </>
  )
}
