import { useTranslation } from 'react-i18next'

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

const selectClasses =
  'w-full rounded-lg border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:border-brand-500 focus:ring-brand-500'

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

  return (
    <section data-purpose="quiz-parameters-grid" className="space-y-3">
      <h2 className="px-1 text-xs font-bold tracking-wider text-slate-400 uppercase">
        {t('params.eyebrow')}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-200">
          <label htmlFor="param-type" className="mb-1.5 block text-xs font-bold text-slate-700">
            {t('params.questionType.label')}
          </label>
          <select
            id="param-type"
            value={questionType}
            onChange={(event) => onQuestionTypeChange(event.target.value)}
            className={selectClasses}
          >
            <option value="mcq">{t('params.questionType.mcq')}</option>
            <option value="true-false">{t('params.questionType.trueFalse')}</option>
            <option value="fill-blanks">{t('params.questionType.fillBlanks')}</option>
            <option value="short-answer">{t('params.questionType.shortAnswer')}</option>
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-200">
          <label htmlFor="param-count" className="mb-1.5 block text-xs font-bold text-slate-700">
            {t('params.questionCount.label')}
          </label>
          <select
            id="param-count"
            value={questionCount}
            onChange={(event) => onQuestionCountChange(event.target.value)}
            className={selectClasses}
          >
            {['3', '5', '10', '15', '20'].map((count) => (
              <option key={count} value={count}>
                {t('params.questionCount.value', { count })}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-200">
          <label htmlFor="param-difficulty" className="mb-1.5 block text-xs font-bold text-slate-700">
            {t('params.difficulty.label')}
          </label>
          <select
            id="param-difficulty"
            value={difficulty}
            onChange={(event) => onDifficultyChange(event.target.value)}
            className={selectClasses}
          >
            <option value="easy">{t('params.difficulty.easy')}</option>
            <option value="medium">{t('params.difficulty.medium')}</option>
            <option value="hard">{t('params.difficulty.hard')}</option>
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-200">
          <label htmlFor="param-options" className="mb-1.5 block text-xs font-bold text-slate-700">
            {t('params.optionsCount.label')}
          </label>
          <select
            id="param-options"
            value={optionsCount}
            onChange={(event) => onOptionsCountChange(event.target.value)}
            className={selectClasses}
          >
            <option value="2">{t('params.optionsCount.value', { count: 2 })}</option>
            <option value="3">{t('params.optionsCount.value', { count: 3 })}</option>
            <option value="4">{t('params.optionsCount.standard')}</option>
            <option value="5">{t('params.optionsCount.value', { count: 5 })}</option>
          </select>
        </div>
      </div>
    </section>
  )
}
