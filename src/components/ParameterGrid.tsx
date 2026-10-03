import { useTranslation } from 'react-i18next'

import Select from './Select'
import { QUESTION_TYPES, supportsOptionsCount } from '../lib/quizTypes'

const TITLE_MAX_LENGTH = 80
const TITLE_COUNTER_THRESHOLD = 60

interface ParameterGridProps {
  title: string
  onTitleChange: (value: string) => void
  questionType: string
  onQuestionTypeChange: (value: string) => void
  questionCount: string
  onQuestionCountChange: (value: string) => void
  difficulty: string
  onDifficultyChange: (value: string) => void
  optionsCount: string
  onOptionsCountChange: (value: string) => void
  includeExplanations: boolean
  onIncludeExplanationsChange: (value: boolean) => void
  shuffleOptions: boolean
  onShuffleOptionsChange: (value: boolean) => void
  includeHints: boolean
  onIncludeHintsChange: (value: boolean) => void
}

const fieldClasses = 'p-4'

function Switch({
  id,
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  id: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-amber' : 'bg-warm-border'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full border border-warm-border bg-card transition-transform ${
          checked ? 'translate-x-5 border-white' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function ParameterGrid({
  title,
  onTitleChange,
  questionType,
  onQuestionTypeChange,
  questionCount,
  onQuestionCountChange,
  difficulty,
  onDifficultyChange,
  optionsCount,
  onOptionsCountChange,
  includeExplanations,
  onIncludeExplanationsChange,
  shuffleOptions,
  onShuffleOptionsChange,
  includeHints,
  onIncludeHintsChange,
}: ParameterGridProps) {
  const { t } = useTranslation()

  const questionTypeOptions = QUESTION_TYPES.map((type) => ({
    value: type.value,
    label: t(type.labelKey),
  }))

  const optionsCountEnabled = supportsOptionsCount(questionType)
  const shuffleEnabled = supportsOptionsCount(questionType)

  const questionCountOptions = [
    { value: 'auto', label: t('params.questionCount.auto') },
    ...['3', '5', '10', '15', '20'].map((count) => ({
      value: count,
      label: t('params.questionCount.value', { count }),
    })),
  ]

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
      <div className="rounded-[14px] border border-warm-border bg-card">
        <div className={`${fieldClasses} border-b border-warm-border`}>
          <label htmlFor="param-title" className="mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('params.title.label')}
          </label>
          <input
            id="param-title"
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value.slice(0, TITLE_MAX_LENGTH))}
            placeholder={t('params.title.placeholder')}
            maxLength={TITLE_MAX_LENGTH}
            className="h-11 w-full rounded-[10px] border border-warm-border bg-card px-3.5 text-sm text-ink placeholder:text-muted focus:border-focus-neutral focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
          />
          {title.length >= TITLE_COUNTER_THRESHOLD && (
            <p className="mt-1 text-right text-[11px] text-muted">
              {title.length}/{TITLE_MAX_LENGTH}
            </p>
          )}
        </div>

        {/* Explicit per-cell borders instead of divide-x/divide-y: Tailwind's divide-* utilities
            border every child after the first regardless of grid row, which stray-bordered the
            left column of later rows in this 2-col grid. Each cell below states its own
            border-bottom (all but the last cell) and border-left (right column only, sm+), so
            every border always meets a real neighboring edge. */}
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className={`${fieldClasses} border-b border-warm-border`}>
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

          <div className={`${fieldClasses} border-b border-warm-border sm:border-l`}>
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

          <div className={`${fieldClasses} border-b border-warm-border`}>
            <label
              id="param-difficulty-label"
              htmlFor="param-difficulty"
              className="mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase"
            >
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

          <div className={`${fieldClasses} border-b border-warm-border sm:border-l`}>
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
            {!optionsCountEnabled && <p className="mt-1.5 text-[11px] text-muted">{t('params.optionsCount.disabledHint')}</p>}
          </div>

          <div className={`${fieldClasses} border-b border-warm-border`}>
            <div className="flex items-center gap-2.5">
              <Switch
                id="param-explanations"
                checked={includeExplanations}
                onChange={() => onIncludeExplanationsChange(!includeExplanations)}
                ariaLabel={t('params.explanations.label')}
              />
              <label htmlFor="param-explanations" className="text-sm font-semibold text-ink">
                {t('params.explanations.label')}
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">{t('params.explanations.helper')}</p>
          </div>

          <div className={`${fieldClasses} border-b border-warm-border sm:border-l`}>
            <div className="flex items-center gap-2.5">
              <Switch
                id="param-shuffle"
                checked={shuffleOptions}
                onChange={() => onShuffleOptionsChange(!shuffleOptions)}
                disabled={!shuffleEnabled}
                ariaLabel={t('params.shuffle.label')}
              />
              <label htmlFor="param-shuffle" className={`text-sm font-semibold ${shuffleEnabled ? 'text-ink' : 'text-muted'}`}>
                {t('params.shuffle.label')}
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">{shuffleEnabled ? t('params.shuffle.helper') : t('params.shuffle.disabledHint')}</p>
          </div>

          <div className={fieldClasses}>
            <div className="flex items-center gap-2.5">
              <Switch
                id="param-hints"
                checked={includeHints}
                onChange={() => onIncludeHintsChange(!includeHints)}
                ariaLabel={t('params.hints.label')}
              />
              <label htmlFor="param-hints" className="text-sm font-semibold text-ink">
                {t('params.hints.label')}
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">{t('params.hints.helper')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
