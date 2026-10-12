import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { ExamHeader } from '../../lib/exam/types'
import Select from '../Select'

interface ExamHeaderFieldsProps {
  header: ExamHeader
  onChange: (header: ExamHeader) => void
  idPrefix?: string
}

const inputClasses = 'h-11 w-full rounded-[10px] border border-warm-border bg-card px-3.5 text-sm text-ink placeholder:text-muted hover:border-focus-neutral'

/** The fields printed in the paper's header; the same form in the creation page and the editor. */
export default function ExamHeaderFields({ header, onChange, idPrefix = 'exam-header' }: ExamHeaderFieldsProps) {
  const { t } = useTranslation()
  const uid = useId()
  const id = (name: string) => `${idPrefix}-${name}-${uid}`
  const set = <K extends keyof ExamHeader>(key: K, value: ExamHeader[K]) => onChange({ ...header, [key]: value })

  const text = (key: 'school' | 'academicYear' | 'course' | 'grade' | 'section' | 'teacher', labelKey: string, placeholderKey?: string, wide = false) => (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={id(key)} className="block text-xs font-bold text-ink">
        {t(labelKey)}
      </label>
      <input
        id={id(key)}
        value={header[key]}
        maxLength={120}
        placeholder={placeholderKey ? t(placeholderKey) : undefined}
        onChange={(event) => set(key, event.target.value)}
        className={inputClasses}
      />
    </div>
  )

  return (
    <div data-purpose="exam-header-fields" className="grid gap-4 sm:grid-cols-2">
      {text('school', 'exam.header.school', 'exam.header.schoolPlaceholder', true)}
      {text('academicYear', 'exam.header.academicYear')}
      <div className="space-y-1.5">
        <span id={id('term-label')} className="block text-xs font-bold text-ink">
          {t('exam.header.term')}
        </span>
        <Select
          id={id('term')}
          labelledBy={id('term-label')}
          value={String(header.term)}
          options={[
            { value: '1', label: t('exam.header.termValue', { count: 1 }) },
            { value: '2', label: t('exam.header.termValue', { count: 2 }) },
          ]}
          onChange={(value) => set('term', value === '2' ? 2 : 1)}
        />
      </div>
      <div className="space-y-1.5">
        <span id={id('examNo-label')} className="block text-xs font-bold text-ink">
          {t('exam.header.examNo')}
        </span>
        <Select
          id={id('examNo')}
          labelledBy={id('examNo-label')}
          value={String(header.examNo)}
          options={[1, 2, 3].map((no) => ({ value: String(no), label: t('exam.header.examNoValue', { count: no }) }))}
          onChange={(value) => set('examNo', value === '3' ? 3 : value === '2' ? 2 : 1)}
        />
      </div>
      {text('course', 'exam.header.course', 'exam.header.coursePlaceholder')}
      {text('grade', 'exam.header.grade', 'exam.header.gradePlaceholder')}
      {text('section', 'exam.header.section', 'exam.header.sectionPlaceholder')}
      {text('teacher', 'exam.header.teacher', 'exam.header.teacherPlaceholder')}
    </div>
  )
}
