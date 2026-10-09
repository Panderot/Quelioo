import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LanguageSwitcher from '../components/LanguageSwitcher'
import { LogoMark } from '../components/Logo'
import { SpinnerIcon } from '../components/icons'
import PlayScreen from '../components/live/PlayScreen'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { LiveApiError, checkLiveCode, joinLiveGame } from '../lib/live/api'
import { LIVE_CODE_LENGTH, LIVE_NICKNAME_MAX, formatCode, normalizeCodeInput } from '../lib/live/core'
import { clearPlayerSession, loadPlayerSession, savePlayerSession } from '../lib/live/playerSession'

type Step = 'code' | 'nickname'

/** The student's side, /katil and /katil/123456: no account, no sign-in page, no landing page. A 6-digit code, a nickname,
 * and then the game. A stored player token brings a student who reloaded back to the same seat. */
export default function JoinPage() {
  const { code: codeParam } = useParams<{ code?: string }>()
  const { t } = useTranslation()
  useDocumentTitle(t('live.join.title'))
  const navigate = useNavigate()
  const [session, setSession] = useState(() => loadPlayerSession())
  const [step, setStep] = useState<Step>('code')
  const [codeText, setCodeText] = useState(() => (codeParam ? formatCode(codeParam.replace(/\D/g, '').slice(0, LIVE_CODE_LENGTH)) : ''))
  const [validCode, setValidCode] = useState<string | null>(null)
  const [quizTitle, setQuizTitle] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoChecked = useRef(false)

  // A stored seat for another code than the one in the link is not this game: the link wins.
  const resumable = session && (!codeParam || session.code === codeParam.replace(/\D/g, '')) ? session : null

  const failure = useCallback(
    (caught: unknown) => {
      const code = caught instanceof LiveApiError ? caught.code : 'generic'
      return t(`live.join.errors.${code}`, { defaultValue: t('live.join.errors.generic') })
    },
    [t],
  )

  const checkCode = useCallback(
    async (raw: string) => {
      const code = normalizeCodeInput(raw)
      if (!code) {
        setError(t('live.join.errors.bad_code'))
        return
      }
      setBusy(true)
      setError(null)
      try {
        const result = await checkLiveCode(code)
        if (!result.ok && result.problem) {
          setError(t(`live.join.errors.${result.problem}`, { defaultValue: t('live.join.errors.generic') }))
        } else {
          setValidCode(code)
          setQuizTitle(result.quizTitle)
          setStep('nickname')
        }
      } catch (caught) {
        setError(failure(caught))
      } finally {
        setBusy(false)
      }
    },
    [failure, t],
  )

  // The QR code opens /katil/<code>: check it straight away so the student only has to type a nickname.
  useEffect(() => {
    if (autoChecked.current || resumable || !codeParam) return
    autoChecked.current = true
    void checkCode(codeParam)
  }, [codeParam, resumable, checkCode])

  const onCodeSubmit = (event: FormEvent) => {
    event.preventDefault()
    void checkCode(codeText)
  }

  const onJoin = async (event: FormEvent) => {
    event.preventDefault()
    if (!validCode || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await joinLiveGame(validCode, nickname)
      const seat = { code: validCode, token: result.token, nickname: result.state.me?.nickname ?? nickname }
      savePlayerSession(seat)
      setSession({ ...seat, at: Date.now() })
      if (!codeParam || codeParam !== validCode) navigate(`/katil/${validCode}`, { replace: true })
    } catch (caught) {
      setError(failure(caught))
    } finally {
      setBusy(false)
    }
  }

  const backToForm = useCallback(
    (reason?: 'removed' | 'finished' | 'unavailable') => {
      clearPlayerSession()
      setSession(null)
      setStep('code')
      setValidCode(null)
      setError(reason ? t(`live.join.errors.${reason}`) : null)
      navigate('/katil', { replace: true })
    },
    [navigate, t],
  )

  const inGame = resumable !== null

  return (
    <div data-purpose="join-page" className="min-h-screen bg-paper">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-5">
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <LogoMark className="h-7 w-7" tone="onLight" />
            <span className="font-serif text-xl font-semibold text-navy">{t('app.name')}</span>
          </span>
          <LanguageSwitcher syncProfile={false} />
        </header>

        {inGame ? (
          <PlayScreen key={resumable.token} token={resumable.token} onGone={backToForm} />
        ) : (
          <main className="space-y-5 rounded-2xl border border-warm-border bg-card p-5">
            {step === 'code' ? (
              <form onSubmit={onCodeSubmit} className="space-y-4" noValidate>
                <div className="space-y-1">
                  <h1 className="font-serif text-3xl font-semibold text-navy">{t('live.join.title')}</h1>
                  <p className="text-sm text-muted">{t('live.join.subtitle')}</p>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('live.join.codeLabel')}</span>
                  <input
                    data-purpose="join-code"
                    value={codeText}
                    onChange={(event) => setCodeText(formatCode(event.target.value.replace(/\D/g, '').slice(0, LIVE_CODE_LENGTH)))}
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    maxLength={LIVE_CODE_LENGTH + 1}
                    placeholder={t('live.join.codePlaceholder')}
                    className="h-16 w-full rounded-xl border border-warm-border bg-card px-4 text-center font-serif text-4xl font-semibold tracking-[0.2em] text-navy tabular-nums placeholder:text-muted/50"
                  />
                </label>
                {error && (
                  <p role="alert" data-purpose="join-error" className="text-sm font-semibold text-error">
                    {error}
                  </p>
                )}
                <button type="submit" data-purpose="join-code-next" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber px-5 text-base font-bold text-navy hover:bg-amber-hover disabled:opacity-60">
                  {busy && <SpinnerIcon className="h-4 w-4" />}
                  {busy ? t('live.join.checking') : t('live.join.next')}
                </button>
              </form>
            ) : (
              <form onSubmit={(event) => void onJoin(event)} className="space-y-4" noValidate>
                <div className="space-y-1">
                  <h1 className="font-serif text-3xl font-semibold text-navy">{t('live.join.title')}</h1>
                  <p className="text-sm text-muted">
                    <span className="font-semibold tabular-nums text-ink">{validCode ? formatCode(validCode) : ''}</span>
                    {quizTitle ? ` · ${quizTitle}` : ''}
                  </p>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('live.join.nicknameLabel')}</span>
                  <input
                    data-purpose="join-nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="words"
                    autoFocus
                    maxLength={LIVE_NICKNAME_MAX * 2}
                    placeholder={t('live.join.nicknamePlaceholder')}
                    className="h-14 w-full rounded-xl border border-warm-border bg-card px-4 text-xl font-semibold text-ink placeholder:font-normal placeholder:text-muted"
                  />
                  <span className="block text-xs text-muted">{t('live.join.nicknameHint')}</span>
                </label>
                {error && (
                  <p role="alert" data-purpose="join-error" className="text-sm font-semibold text-error">
                    {error}
                  </p>
                )}
                <button type="submit" data-purpose="join-submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber px-5 text-base font-bold text-navy hover:bg-amber-hover disabled:opacity-60">
                  {busy && <SpinnerIcon className="h-4 w-4" />}
                  {busy ? t('live.join.joining') : t('live.join.join')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('code')
                    setError(null)
                    navigate('/katil', { replace: true })
                  }}
                  className="w-full text-center text-sm font-semibold text-amber-text hover:underline"
                >
                  {t('live.join.other')}
                </button>
              </form>
            )}
            <p data-purpose="join-privacy" className="border-t border-warm-border pt-4 text-xs text-muted">
              {t('live.join.privacy')}
            </p>
          </main>
        )}
      </div>
    </div>
  )
}
