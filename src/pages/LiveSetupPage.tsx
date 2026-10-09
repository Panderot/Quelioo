import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LoadError, SkeletonList } from '../components/DataStates'
import { SpinnerIcon, TrophyIcon } from '../components/icons'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getArchiveEntry, useArchive } from '../lib/archive'
import { createLiveGame, LiveApiError } from '../lib/live/api'
import { LIVE_DEFAULT_SETTINGS, LIVE_MAX_PLAYERS, LIVE_TIME_OPTIONS, planLiveQuestions, sanitizeSettings } from '../lib/live/core'
import type { LiveSettings } from '../lib/live/core'
import { QUESTION_TYPE_LABEL_KEYS } from '../lib/quizTypes'

const SETTINGS_KEY = 'quelio.live.settings.v1'

function loadSettings(): LiveSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? sanitizeSettings(JSON.parse(raw)) : LIVE_DEFAULT_SETTINGS
  } catch {
    return LIVE_DEFAULT_SETTINGS
  }
}

function saveSettings(settings: LiveSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Not remembered; the defaults come back next time.
  }
}

function Toggle({ label, checked, onChange, purpose }: { label: string; checked: boolean; onChange: (value: boolean) => void; purpose: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input data-purpose={purpose} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-amber" />
    </label>
  )
}

/** /live/new?quiz=<id>: which of the quiz's questions can be played live, the game settings, and "Open the lobby". */
export default function LiveSetupPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('live.setup.title'))
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const archive = useArchive()
  const quizId = searchParams.get('quiz') ?? ''
  const entry = quizId ? getArchiveEntry(quizId) : undefined
  const [settings, setSettings] = useState<LiveSettings>(loadSettings)
  const [showSkipped, setShowSkipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = useMemo(() => (entry ? planLiveQuestions(entry.quiz.questions) : null), [entry])

  if (!entry && !archive.loaded) return archive.failed ? <LoadError onRetry={archive.reload} /> : <SkeletonList />
  if (!entry || !plan) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center">
        <p className="text-sm font-semibold text-ink">{t('live.setup.errorMissing')}</p>
        <Link to="/live" className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy hover:border-amber">
          {t('live.setup.back')}
        </Link>
      </div>
    )
  }

  const playable = plan.questions.length
  const skipped = plan.skipped.length
  const update = (patch: Partial<LiveSettings>) => setSettings((current) => ({ ...current, ...patch }))

  const open = async () => {
    if (busy || playable === 0) return
    setBusy(true)
    setError(null)
    const clean = sanitizeSettings(settings)
    saveSettings(clean)
    try {
      const created = await createLiveGame(entry.id, clean)
      navigate(`/live/${created.id}`)
    } catch (caught) {
      const code = caught instanceof LiveApiError ? caught.code : ''
      setError(code === 'too_many_games' ? t('live.setup.errorTooMany') : code === 'no_playable_questions' ? t('live.setup.errorNoQuestions') : code === 'quiz_not_found' ? t('live.setup.errorMissing') : t('live.setup.errorGeneric'))
      setBusy(false)
    }
  }

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <Link to="/live" className="text-xs font-semibold text-amber-text hover:underline">
          {t('live.setup.back')}
        </Link>
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold text-navy">
          <TrophyIcon className="h-7 w-7 text-amber-text" />
          {t('live.setup.title')}
        </h1>
        <p className="text-sm text-muted">
          {t('live.setup.quiz')}: <span className="font-semibold text-ink">{entry.title}</span>
        </p>
      </section>

      <section data-purpose="live-playable-summary" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-4 md:p-5">
        {playable > 0 ? (
          <>
            <p className="text-sm font-semibold text-ink">
              {t('live.setup.suitable', { count: playable })}, {skipped > 0 ? t('live.setup.skipped', { count: skipped }) : t('live.setup.skippedNone')}
            </p>
            {skipped > 0 && (
              <>
                <button type="button" data-purpose="live-toggle-skipped" aria-expanded={showSkipped} onClick={() => setShowSkipped((value) => !value)} className="text-xs font-semibold text-amber-text hover:underline">
                  {showSkipped ? t('live.setup.hideSkipped') : t('live.setup.showSkipped')}
                </button>
                {showSkipped && (
                  <ul aria-label={t('live.setup.skippedListLabel')} data-purpose="live-skipped-list" className="divide-y divide-warm-border rounded-xl border border-warm-border text-sm">
                    {plan.skipped.map((question) => (
                      <li key={`${question.index}-${question.id}`} className="flex items-start justify-between gap-4 p-3">
                        <span className="min-w-0 text-ink">
                          {question.index + 1}. {question.text}
                        </span>
                        <span className="shrink-0 text-xs text-muted">{question.type === 'mcq' ? t('live.setup.reasonOptions') : t(QUESTION_TYPE_LABEL_KEYS[question.type] ?? question.type)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        ) : (
          <div data-purpose="live-none-playable" className="space-y-2">
            <p className="text-sm font-bold text-ink">{t('live.setup.noneTitle')}</p>
            <p className="text-sm text-muted">{t('live.setup.noneBody')}</p>
            <Link to="/" className="inline-block rounded-xl bg-amber px-4 py-2 text-xs font-bold text-navy hover:bg-amber-hover">
              {t('live.setup.noneCta')}
            </Link>
          </div>
        )}
      </section>

      {playable > 0 && (
        <section data-purpose="live-settings" className="space-y-1 rounded-[14px] border border-warm-border bg-card p-4 md:p-5">
          <h2 className="pb-2 text-sm font-bold text-ink">{t('live.setup.settingsTitle')}</h2>
          <fieldset className="space-y-2 pb-3">
            <legend className="text-sm font-semibold text-ink">{t('live.setup.time')}</legend>
            <div className="flex flex-wrap gap-2">
              {LIVE_TIME_OPTIONS.map((seconds) => (
                <label
                  key={seconds}
                  className={`min-h-10 cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${settings.secondsPerQuestion === seconds ? 'border-amber bg-amber/15 text-navy' : 'border-warm-border text-ink hover:border-focus-neutral'}`}
                >
                  <input type="radio" name="live-seconds" value={seconds} checked={settings.secondsPerQuestion === seconds} onChange={() => update({ secondsPerQuestion: seconds })} className="sr-only" />
                  {t('live.setup.seconds', { count: seconds })}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="divide-y divide-warm-border border-t border-warm-border">
            <Toggle purpose="live-setting-leaderboard" label={t('live.setup.leaderboard')} checked={settings.showLeaderboard} onChange={(value) => update({ showLeaderboard: value })} />
            <Toggle purpose="live-setting-shuffle" label={t('live.setup.shuffle')} checked={settings.shuffleQuestions} onChange={(value) => update({ shuffleQuestions: value })} />
            <Toggle purpose="live-setting-sound" label={t('live.setup.sound')} checked={settings.sound} onChange={(value) => update({ sound: value })} />
            <Toggle purpose="live-setting-late" label={t('live.setup.lateJoin')} checked={settings.lateJoin} onChange={(value) => update({ lateJoin: value })} />
            <label className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm font-semibold text-ink">
                {t('live.setup.maxPlayers')} <span className="font-normal text-muted">({t('live.setup.maxPlayersHint')})</span>
              </span>
              <input
                data-purpose="live-setting-max"
                type="number"
                inputMode="numeric"
                min={1}
                max={LIVE_MAX_PLAYERS}
                value={settings.maxPlayers}
                onChange={(event) => update({ maxPlayers: Math.min(LIVE_MAX_PLAYERS, Math.max(1, Math.round(Number(event.target.value)) || 1)) })}
                className="h-10 w-24 rounded-[10px] border border-warm-border bg-card px-3 text-right text-sm font-semibold text-ink"
              />
            </label>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-error">
          {error}
        </p>
      )}
      <div>
        <button
          type="button"
          data-purpose="live-open-lobby"
          onClick={() => void open()}
          disabled={busy || playable === 0}
          aria-busy={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber px-6 text-sm font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <SpinnerIcon className="h-4 w-4" />}
          {busy ? t('live.setup.opening') : t('live.setup.open')}
        </button>
      </div>
    </>
  )
}
