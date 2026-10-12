import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WrittenExam } from '../../lib/exam/types'
import ExamPaper from './Paper'

/** A4 sheet width in CSS pixels (210 mm at 96 dpi). */
const A4_WIDTH_PX = 794

type PreviewKind = 'exam' | 'key' | 'groupB'

/** The live paper next to the editor: scaled to the available width, switchable between the exam, its key and group B. */
export default function PaperPreview({ exam }: { exam: WrittenExam }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<PreviewKind>('exam')
  const [scale, setScale] = useState(0.6)
  const box = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return undefined
    const measure = () => setScale(Math.min(1, Math.max(0.3, (element.clientWidth - 2) / A4_WIDTH_PX)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const available: PreviewKind[] = ['exam', ...(exam.settings.answerKey ? (['key'] as const) : []), ...(exam.settings.groups ? (['groupB'] as const) : [])]
  const shown = available.includes(kind) ? kind : 'exam'

  return (
    <section data-purpose="exam-preview" aria-label={t('exam.edit.preview')} className="space-y-2">
      {available.length > 1 && (
        <div role="tablist" aria-label={t('exam.edit.preview')} className="flex flex-wrap gap-2">
          {available.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={shown === option}
              data-purpose={`exam-preview-${option}`}
              onClick={() => setKind(option)}
              className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${shown === option ? 'border-amber bg-amber/15 text-navy' : 'border-warm-border bg-card text-ink'}`}
            >
              {t(`exam.edit.previewKind.${option}`)}
            </button>
          ))}
        </div>
      )}
      <div ref={box} className="max-h-[80vh] overflow-auto rounded-[14px] border border-warm-border bg-[#e9e4d8] p-px">
        <ExamPaper exam={exam} group={shown === 'groupB' ? 'B' : 'A'} part={shown === 'key' ? 'key' : 'exam'} scale={scale} />
      </div>
    </section>
  )
}
