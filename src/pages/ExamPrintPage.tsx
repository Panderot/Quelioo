import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import ExamPaper from '../components/exam/Paper'
import type { PaperPart } from '../components/exam/Paper'
import { lacksPrintPageNumbers } from '../lib/exam/browser'
import { examFileBase } from '../lib/exam/paperText'
import { getExam } from '../lib/exam/store'
import type { ExamGroup, WrittenExam } from '../lib/exam/types'

type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; exam: WrittenExam }

function useExam(id: string | undefined): Loaded {
  const [loaded, setLoaded] = useState<{ id: string | undefined; result: WrittenExam | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!id) return undefined
    getExam(id)
      .then((exam) => {
        if (!cancelled) setLoaded({ id, result: exam })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ id, result: null })
      })
    return () => {
      cancelled = true
    }
  }, [id])
  if (!id) return { state: 'missing' }
  if (!loaded || loaded.id !== id) return { state: 'loading' }
  return loaded.result ? { state: 'ready', exam: loaded.result } : { state: 'missing' }
}

/** Full-page print view of one paper: `/exams/:id/print?part=exam|key&group=A|B`. No app chrome; printing is the user's click. */
export default function ExamPrintPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const loaded = useExam(id)
  const part: PaperPart = params.get('part') === 'key' ? 'key' : 'exam'
  const groupParam = params.get('group')
  const group: ExamGroup | 'both' = groupParam === 'B' ? 'B' : groupParam === 'both' ? 'both' : 'A'

  const showPageNumbersNote = lacksPrintPageNumbers(navigator.userAgent)
  const exam = loaded.state === 'ready' ? loaded.exam : null
  useEffect(() => {
    if (!exam) return undefined
    const previous = document.title
    // The saved PDF takes its name from the page title: course, class, group and "answer key" included.
    document.title = examFileBase(exam, part, group)
    return () => {
      document.title = previous
    }
  }, [exam, part, group])

  if (loaded.state === 'loading') {
    return (
      <p role="status" className="p-8 text-center text-sm">
        {t('exam.print.loading')}
      </p>
    )
  }
  if (loaded.state === 'missing') {
    return (
      <div className="p-8 text-center text-sm" role="alert">
        {t('exam.print.notFound')}
      </div>
    )
  }

  return (
    <div data-purpose="exam-print-view" className="min-h-screen bg-neutral-200 print:bg-white">
      <style>{'@media print { [data-purpose="exam-print-toolbar"] { display: none !important; } body { background: #fff !important; } }'}</style>
      <div data-purpose="exam-print-toolbar" className="sticky top-0 z-10 flex justify-center gap-3 bg-neutral-800 p-3">
        <button type="button" onClick={() => window.print()} className="rounded bg-white px-4 py-1.5 text-sm font-semibold text-neutral-900">
          {t('exam.print.print')}
        </button>
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : window.close())} className="rounded border border-white/40 px-4 py-1.5 text-sm text-white">
          {t('exam.print.close')}
        </button>
      </div>
      <p data-purpose="exam-print-pdf-hint" className="mx-auto mt-2 max-w-[210mm] rounded bg-white px-3 py-1.5 text-center text-xs text-neutral-900 print:hidden">
        {t('exam.print.pdfHint')}
      </p>
      {showPageNumbersNote && (
        <p data-purpose="exam-print-note" className="mx-auto mt-2 max-w-[210mm] rounded bg-amber-100 px-3 py-1.5 text-center text-xs text-neutral-900 print:hidden">
          {t('exam.print.pageNumbersNote')}
        </p>
      )}
      <ExamPaper exam={loaded.exam} group={group} part={part} print />
    </div>
  )
}
