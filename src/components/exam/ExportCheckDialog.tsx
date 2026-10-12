import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { ExportIssues } from '../../lib/exam/problems'

interface ExportCheckDialogProps {
  issues: ExportIssues | null
  onRedistribute: () => void
  onContinue: () => void
  onCancel: () => void
}

/** Before an export: the points total, an empty course or class and unfinished questions, with the choice to fix, go on anyway or cancel. */
export default function ExportCheckDialog({ issues, onRedistribute, onContinue, onCancel }: ExportCheckDialogProps) {
  const { t } = useTranslation()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" data-purpose="exam-export-check">
      <div role="alertdialog" aria-modal="true" aria-labelledby="export-check-title" className="w-full max-w-lg space-y-4 rounded-[14px] border border-warm-border bg-card p-5 shadow-xl">
        <h2 id="export-check-title" className="font-serif text-xl font-semibold text-navy">
          {t('exam.export.title')}
        </h2>
        {issues === null ? (
          <p data-purpose="exam-export-ready" className="text-sm text-ink">
            {t('exam.export.ready')}
          </p>
        ) : (
          <ul className="space-y-2 text-sm text-ink">
            {issues.points !== null && (
              <li data-purpose="exam-export-points" className="font-semibold">
                {t('exam.export.points', { total: issues.points })}
              </li>
            )}
            {issues.header && <li data-purpose="exam-export-header">{t('exam.export.header')}</li>}
            {issues.incomplete.length > 0 && (
              <li data-purpose="exam-export-incomplete">
                <p>{t('exam.export.incomplete')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {issues.incomplete.map((entry) => (
                    <li key={entry.number}>{t('exam.export.problemLine', { number: entry.number, reasons: entry.problems.map((problem) => t(`exam.problems.${problem}`)).join(', ') })}</li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {issues?.points !== null && issues !== null && (
            <button type="button" data-purpose="exam-export-redistribute" onClick={onRedistribute} className="min-h-10 rounded-xl bg-amber px-4 text-sm font-bold text-navy hover:bg-amber-hover">
              {t('exam.export.redistribute')}
            </button>
          )}
          <button type="button" data-purpose="exam-export-continue" onClick={onContinue} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber">
            {issues === null ? t('exam.export.go') : t('exam.export.anyway')}
          </button>
          <button ref={cancelRef} type="button" data-purpose="exam-export-cancel" onClick={onCancel} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber">
            {t('exam.export.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
