import { useTranslation } from 'react-i18next'

import Select from './Select'
import { QUESTION_TYPES, supportsOptionsCount } from '../lib/quizTypes'

interface ParameterGridProps {
  questionType: string
  onQuestionTypeChange: (value: string) => void
  questionCount: string
  onQuestionCountChange: (value: string) => void
  difficulty: string
  onDifficultyChange: (value: string) => void
  optionsCount: string
  onOptionsCountChange: (value: string) => void
}

const fieldClasses = 'p-4'

export default function ParameterGrid({
  questionType,
  onQuestionTypeChange,
  questionCount,
  onQuestionCountChange,
  difficulty,
  onDifficultyChange,
  optionsCount,
  onOptionsCountChange,
}: ParameterGridProps) {
  const { t } = useTranslation()

  const questionTypeOptions = QUESTION_TYPES.map((type) => ({
    value: type.value,
    label: t(type.labelKey),
  }))

  const optionsCountEnabled = supportsOptionsCount(questionType)

  const questionCountOptions = ['3', '5', '10', '15', '20'].map((count) => ({
    value: count,
    label: t('params.questionCount.value', { count }),
  }))

  const difficultyOptions = [
    { value: 'easy', label: t('params.difficulty.easy') },
    { value: 'medium', label: t('params.difficulty.medium') },
    { value: 'hard', label: t('params.difficulty.hard') },
  ]

  const optionsCountOptions = [
    { value: '2', label: t('params.optionsCount.value', { count: 2 }) },
    { value: '3', label: t('params.optionsCount.value', { count: 3 }) },
    { value: '4', label: t('params.optionsCount.standard') },
    { value: '5', label: t('params.optionsCount.value', { count: 5 }) },
  ]

  return (
    <section data-purpose="quiz-parameters-grid" className="space-y-3">
      <h2 className="px-1 text-xs font-bold tracking-wider text-muted uppercase">{t('params.eyebrow')}</h2>
      <div className="grid grid-cols-1 divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className={`${fieldClasses} sm:border-b sm:border-warm-border`}>
          <label id="param-type-label" htmlFor="param-type" className="mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('params.questionType.label')}
          </label>
          <Select
            id="param-type"
            labelledBy="param-type-label"
            value={questionType}
            onChange={onQuestionTypeChange}
            options={questionTypeOptions}
          />
        </div>

        <div className={`${fieldClasses} sm:border-b sm:border-warm-border`}>
          <label id="param-count-label" htmlFor="param-count" className="mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('params.questionCount.label')}
          </label>
          <Select
            id="param-count"
            labelledBy="param-count-label"
            value={questionCount}
            onChange={onQuestionCountChange}
            options={questionCountOptions}
          />
        </div>

        <div className={fieldClasses}>
          <label id="param-difficulty-label" htmlFor="param-difficulty" className="mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('params.difficulty.label')}
          </label>
          <Select
            id="param-difficulty"
            labelledBy="param-difficulty-label"
            value={difficulty}
            onChange={onDifficultyChange}
            options={difficultyOptions}
          />
        </div>

        <div className={fieldClasses}>
          <label id="param-options-label" htmlFor="param-options" className="mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('params.optionsCount.label')}
          </label>
          <Select
            id="param-options"
            labelledBy="param-options-label"
            value={optionsCount}
            onChange={onOptionsCountChange}
            options={optionsCountOptions}
            disabled={!optionsCountEnabled}
          />
          {!optionsCountEnabled && (
            <p className="mt-1.5 text-[11px] text-muted">{t('params.optionsCount.disabledHint')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
