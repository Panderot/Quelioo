import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../../lib/auth/authStore'
import { clearLegacyData, detectLegacyData, getImportState, runImport, setImportState } from '../../lib/import/importLocalData'
import type { ImportProgress, ImportReport, LegacySummary } from '../../lib/import/importLocalData'
import { DATA_IMPORTED_EVENT, describeCards, describeSummary } from './importFormat'

type Phase = 'prompt' | 'running' | 'result'

interface ImportDialogProps {
  userId: string
  summary: LegacySummary
  onClose: () => void
}

const buttonOutline = 'min-h-10 rounded-xl border border-warm-border px-4 py-2 text-sm font-semibold text-ink hover:border-focus-neutral'
const buttonPrimary = 'min-h-10 rounded-xl bg-amber px-4 py-2 text-sm font-bold text-navy transition-colors hover:bg-amber-hover disabled:opacity-60'

/** Modal that offers to move the old browser-local data into the account, shows progress, and checks the result. */
export default function ImportDialog({ userId, summary, onClose }: ImportDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('prompt')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  const notNow = () => {
    setImportState(userId, 'declined')
    onClose()
  }

  const start = async () => {
    setPhase('running')
    setProgress(null)
    let result: ImportReport
    try {
      result = await runImport(userId, setProgress)
    } catch {
      result = { ok: false, verified: false, imported: summary, skipped: { ...summary, decks: 0, cards: 0, quizzes: 0, songs: 0, solutions: 0, lessons: 0, total: 0 }, error: 'failed' }
    }
    if (result.ok && result.verified) {
      setImportState(userId, 'imported')
      window.dispatchEvent(new Event(DATA_IMPORTED_EVENT))
    }
    setReport(result)
    setPhase('result')
  }

  const clearOld = async () => {
    await clearLegacyData()
    onClose()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (phase === 'prompt') notNow()
      else if (phase === 'result') onClose()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    if (!buttons || buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const items = describeSummary(t, summary)
  const verified = report?.ok === true && report.verified
  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
  const previewKinds = (['decks', 'quizzes', 'songs', 'solutions', 'lessons'] as const).filter((kind) => summary[kind] > 0)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/40" aria-hidden onClick={phase === 'prompt' ? notNow : undefined} />
      <div
        ref={dialogRef}
        data-purpose="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={phase === 'running'}
        onKeyDown={handleKeyDown}
        className="fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[calc(100vh-2rem)] max-w-md -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl border border-warm-border bg-card p-5 shadow-lg sm:inset-x-0"
      >
        {phase === 'prompt' && (
          <>
            <div className="space-y-1.5">
              <h2 id={titleId} className="font-serif text-lg font-semibold text-navy">
                {t('importDialog.title')}
              </h2>
              <p className="text-sm text-ink">{t('importDialog.body', { items })}</p>
            </div>
            <ul data-purpose="import-preview" className="space-y-1 rounded-xl border border-warm-border bg-paper px-4 py-3 text-sm text-ink">
              {previewKinds.map((kind) => (
                <li key={kind}>{t(`importDialog.counts.${kind}`, { count: summary[kind] })}</li>
              ))}
            </ul>
            {summary.cards > 0 && <p className="text-xs text-muted">{t('importDialog.previewCards', { cards: describeCards(t, summary.cards) })}</p>}
            <p className="text-xs text-muted">{t('importDialog.keepNote')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={notNow} className={buttonOutline}>
                {t('importDialog.notNow')}
              </button>
              <button type="button" data-autofocus onClick={() => void start()} className={buttonPrimary}>
                {t('importDialog.import')}
              </button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div className="space-y-3" role="status" aria-live="polite">
            <h2 id={titleId} className="font-serif text-lg font-semibold text-navy">
              {t('importDialog.title')}
            </h2>
            <p className="text-sm text-ink">{progress ? t(`importDialog.progress.${progress.step}`) : t('importDialog.progress.decks')}</p>
            <div className="h-2 overflow-hidden rounded-full bg-warm-border" aria-hidden>
              <div className="h-full rounded-full bg-amber transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {phase === 'result' && report && (
          <>
            <div className="space-y-1.5">
              <h2 id={titleId} className="font-serif text-lg font-semibold text-navy">
                {verified ? t('importDialog.doneTitle') : t('importDialog.title')}
              </h2>
              <p role={verified ? 'status' : 'alert'} className={`text-sm ${verified ? 'text-ink' : 'font-semibold text-error'}`}>
                {verified ? t('importDialog.done') : report.ok ? t('importDialog.unverified') : t('importDialog.failed')}
              </p>
              {verified && report.skipped.total > 0 && <p className="text-xs text-muted">{t('importDialog.doneSkipped', { items: describeSummary(t, report.skipped) })}</p>}
            </div>
            {verified ? (
              <>
                <p className="text-sm text-ink">{t('importDialog.clearPrompt')}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" data-autofocus onClick={onClose} className={buttonOutline}>
                    {t('importDialog.keep')}
                  </button>
                  <button type="button" onClick={() => void clearOld()} className="min-h-10 rounded-xl bg-error/10 px-4 py-2 text-sm font-bold text-error hover:bg-error/20">
                    {t('importDialog.clear')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={onClose} className={buttonOutline}>
                  {t('importDialog.close')}
                </button>
                <button type="button" data-autofocus onClick={() => void start()} className={buttonPrimary}>
                  {t('importDialog.retry')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Mounted once inside the signed-in shell: offers the import on the first sign-in on a device that still has old local data. */
export function ImportPrompt() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [offer, setOffer] = useState<{ userId: string; summary: LegacySummary } | null>(null)

  useEffect(() => {
    if (!userId || getImportState(userId) !== 'none') return
    let cancelled = false
    void detectLegacyData().then((summary) => {
      if (!cancelled && summary.total > 0) setOffer({ userId, summary })
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!offer || offer.userId !== userId) return null
  return <ImportDialog userId={offer.userId} summary={offer.summary} onClose={() => setOffer(null)} />
}
