import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { verifyAndStoreMusicAccessCode } from '../api/song'

interface MusicAccessGateProps {
  onUnlocked: () => void
}

/** Production-only owner gate shown before the song creation flow (see CLAUDE.md /
 * api/_lib/song-config.ts) — the song list itself stays visible without a code; only this step,
 * which leads to a real billed Gemini call, is locked. */
export default function MusicAccessGate({ onUnlocked }: MusicAccessGateProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  const handleUnlock = async () => {
    const trimmed = code.trim()
    if (!trimmed) return
    setChecking(true)
    setError(false)
    const ok = await verifyAndStoreMusicAccessCode(trimmed)
    setChecking(false)
    if (ok) onUnlocked()
    else setError(true)
  }

  return (
    <div className="space-y-3 rounded-xl border border-warm-border bg-paper p-4 text-center">
      <p className="text-sm font-semibold text-ink">{t('song.access.title')}</p>
      <input
        type="password"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void handleUnlock()
        }}
        aria-label={t('song.access.title')}
        className="w-full rounded-lg border border-warm-border bg-card px-3 py-2 text-center text-sm text-ink"
      />
      {error && (
        <p role="alert" className="text-xs font-semibold text-error">
          {t('song.access.wrongCode')}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleUnlock()}
        disabled={!code.trim() || checking}
        aria-busy={checking}
        className="w-full rounded-xl bg-amber py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('song.access.unlock')}
      </button>
    </div>
  )
}
