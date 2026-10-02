import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface OwnerAccessGateProps {
  onUnlocked: () => void
  /** Checks a candidate code against the feature's endpoint (zero-cost) and stores it when accepted. */
  verify: (code: string) => Promise<boolean>
}

/** Production-only shared owner gate (Songs, Audio Lesson; see CLAUDE.md / api/_lib/song-config.ts):
 * lists stay visible without a code; only the step that leads to a real billed call is locked. One
 * stored code unlocks every owner-only feature. */
export default function OwnerAccessGate({ onUnlocked, verify }: OwnerAccessGateProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  const handleUnlock = async () => {
    const trimmed = code.trim()
    if (!trimmed) return
    setChecking(true)
    setError(false)
    const ok = await verify(trimmed)
    setChecking(false)
    if (ok) onUnlocked()
    else setError(true)
  }

  return (
    <div data-purpose="owner-access-gate" className="space-y-3 rounded-xl border border-warm-border bg-paper p-4 text-center">
      <p className="text-sm font-semibold text-ink">{t('ownerAccess.title')}</p>
      <input
        type="password"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void handleUnlock()
        }}
        aria-label={t('ownerAccess.title')}
        className="w-full rounded-lg border border-warm-border bg-card px-3 py-2 text-center text-sm text-ink"
      />
      {error && (
        <p role="alert" className="text-xs font-semibold text-error">
          {t('ownerAccess.wrongCode')}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleUnlock()}
        disabled={!code.trim() || checking}
        aria-busy={checking}
        className="w-full rounded-xl bg-amber py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('ownerAccess.unlock')}
      </button>
    </div>
  )
}
