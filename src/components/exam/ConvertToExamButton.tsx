import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { ArchiveEntry } from '../../lib/archive'
import { quizToExam } from '../../lib/exam/fromQuiz'
import { createExam, loadExamDefaults } from '../../lib/exam/store'
import { defaultExamHeader } from '../../lib/exam/types'
import { ExamIcon, SpinnerIcon } from '../icons'

interface ConvertToExamButtonProps {
  entry: ArchiveEntry
  className: string
  iconClassName?: string
  /** Visible text when the label differs from the aria-label (the Archive card adds the quiz title). */
  withTitleInLabel?: boolean
}

/** Makes a written exam from the quiz's existing questions. No AI request: points are spread automatically. */
export default function ConvertToExamButton({ entry, className, iconClassName = 'h-3.5 w-3.5', withTitleInLabel = false }: ConvertToExamButtonProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const convert = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const header = (await loadExamDefaults()) ?? defaultExamHeader()
      const exam = quizToExam(entry, header)
      const saved = await createExam(exam)
      if (saved.status !== 'ok') throw new Error('save')
      navigate(`/exams/${exam.id}`)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        data-purpose="archive-to-exam"
        disabled={busy}
        aria-label={withTitleInLabel ? `${t('exam.fromQuiz.action')} — ${entry.title}` : undefined}
        onClick={() => void convert()}
        className={className}
      >
        {busy ? <SpinnerIcon className={iconClassName} /> : <ExamIcon className={iconClassName} />}
        {t('exam.fromQuiz.action')}
      </button>
      {failed && (
        <span role="alert" className="text-xs font-semibold text-error">
          {t('exam.fromQuiz.failed')}
        </span>
      )}
    </>
  )
}
