import { useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { fitRubric, rubricTotal, withPairs } from '../../lib/exam/edit'
import { setQuestionPoints } from '../../lib/exam/points'
import type { ExamDifficulty, ExamQuestion } from '../../lib/exam/types'
import { ArrowDownIcon, ArrowUpIcon, RefreshIcon, SpinnerIcon, TrashIcon } from '../icons'

const TYPE_LABEL_KEYS: Record<ExamQuestion['type'], string> = {
  'open-ended': 'exam.setup.types.openEnded',
  'short-answer': 'exam.setup.types.shortAnswer',
  'fill-blanks': 'exam.setup.types.fillBlanks',
  'true-false': 'exam.setup.types.trueFalse',
  mcq: 'exam.setup.types.mcq',
  matching: 'exam.setup.types.matching',
}

interface QuestionEditorProps {
  question: ExamQuestion
  number: number
  count: number
  /** Called for every change; `coalesce` names the field so typing in it is one undo step. */
  onChange: (question: ExamQuestion, coalesce?: string) => void
  onMove: (delta: number) => void
  onDelete: () => void
  onRegenerate: () => void
  regenerating: boolean
  canRegenerate: boolean
  onGenerateRubric: () => void
  rubricBusy: boolean
  /** Messages shown inside this card (a failed regenerate, for instance). */
  notice?: string
  dragging: boolean
  dragOver: boolean
  onDragStart: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
  onDragEnd: () => void
}

const field = 'w-full rounded-lg border border-warm-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted hover:border-focus-neutral'
const smallButton =
  'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border border-warm-border bg-card px-2 text-xs font-semibold text-ink hover:border-amber disabled:cursor-not-allowed disabled:opacity-50'

/** One question as editable fields: stem, options/answer by type, points, grading criteria, answer lines. */
export default function QuestionEditor(props: QuestionEditorProps) {
  const { question, number, count, onChange, onMove, onDelete, onRegenerate, regenerating, canRegenerate, onGenerateRubric, rubricBusy, notice } = props
  const { t } = useTranslation()
  const [showContext, setShowContext] = useState(Boolean(question.context))
  const set = (patch: Partial<ExamQuestion>, coalesce?: string) => onChange({ ...question, ...patch }, coalesce)
  const sum = rubricTotal(question)
  const rubricOff = question.rubric.length > 0 && sum !== question.points
  const label = (key: string) => `${t(key)} — ${number}`

  return (
    <article
      data-purpose="exam-question"
      data-question-id={question.id}
      draggable={false}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      className={`space-y-3 rounded-[14px] border bg-card p-4 md:p-5 ${props.dragOver ? 'border-amber ring-2 ring-amber/40' : 'border-warm-border'} ${props.dragging ? 'opacity-50' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          draggable
          aria-label={t('exam.edit.dragHandle', { number })}
          title={t('exam.edit.dragHint')}
          data-purpose="exam-drag-handle"
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
          onKeyDown={(event) => {
            if (event.altKey && event.key === 'ArrowUp') {
              event.preventDefault()
              onMove(-1)
            }
            if (event.altKey && event.key === 'ArrowDown') {
              event.preventDefault()
              onMove(1)
            }
          }}
          className="inline-flex h-9 w-7 cursor-grab touch-none items-center justify-center rounded-lg text-muted hover:text-ink active:cursor-grabbing"
        >
          <span aria-hidden className="text-lg leading-none">⋮⋮</span>
        </button>
        <h3 className="text-sm font-bold text-ink">
          {t('exam.edit.questionNumber', { number })} <span className="font-semibold text-muted">· {t(TYPE_LABEL_KEYS[question.type])}</span>
        </h3>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            {t('exam.edit.points')}
            <input
              type="number"
              min={0}
              max={100}
              aria-label={label('exam.edit.points')}
              data-purpose="exam-points"
              value={question.points}
              onChange={(event) => onChange(setQuestionPoints(question, Math.min(100, Math.max(0, Number.parseInt(event.target.value, 10) || 0))), 'points')}
              className="h-9 w-16 rounded-lg border border-warm-border bg-card px-2 text-center text-sm font-semibold text-ink"
            />
          </label>
          <button type="button" aria-label={label('exam.edit.moveUp')} title={t('exam.edit.moveUp')} data-purpose="exam-move-up" disabled={number === 1} onClick={() => onMove(-1)} className={smallButton}>
            <ArrowUpIcon className="h-4 w-4" />
          </button>
          <button type="button" aria-label={label('exam.edit.moveDown')} title={t('exam.edit.moveDown')} data-purpose="exam-move-down" disabled={number === count} onClick={() => onMove(1)} className={smallButton}>
            <ArrowDownIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={label('exam.edit.regenerate')}
            title={canRegenerate ? t('exam.edit.regenerate') : t('exam.edit.regenerateNoSource')}
            data-purpose="exam-regenerate"
            disabled={!canRegenerate || regenerating}
            onClick={onRegenerate}
            className={smallButton}
          >
            {regenerating ? <SpinnerIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
          </button>
          <button type="button" aria-label={label('exam.edit.delete')} title={t('exam.edit.delete')} data-purpose="exam-delete-question" onClick={onDelete} className={`${smallButton} hover:border-error`}>
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {notice && (
        <p role="alert" className="rounded-lg border border-error/40 bg-error/5 p-2 text-xs font-semibold text-error">
          {notice}
        </p>
      )}

      {showContext ? (
        <div className="space-y-1">
          <label className="block text-xs font-bold text-ink" htmlFor={`ctx-${question.id}`}>
            {t('exam.edit.context')}
          </label>
          <textarea id={`ctx-${question.id}`} rows={2} value={question.context ?? ''} onChange={(event) => set({ context: event.target.value || undefined }, 'context')} className={field} />
        </div>
      ) : (
        <button type="button" onClick={() => setShowContext(true)} className="text-xs font-bold text-amber-text hover:underline">
          {t('exam.edit.addContext')}
        </button>
      )}

      <div className="space-y-1">
        <label className="block text-xs font-bold text-ink" htmlFor={`stem-${question.id}`}>
          {question.type === 'fill-blanks' ? t('exam.edit.stemBlank') : t('exam.edit.stem')}
        </label>
        <textarea id={`stem-${question.id}`} data-purpose="exam-stem" rows={3} value={question.stem} onChange={(event) => set({ stem: event.target.value }, 'stem')} className={field} />
      </div>

      {question.type === 'mcq' && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-ink">{t('exam.edit.options')}</legend>
          {(question.options ?? []).map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${question.id}`}
                aria-label={t('exam.edit.correctOption', { letter: String.fromCharCode(65 + index) })}
                checked={question.answerIndex === index}
                onChange={() => set({ answerIndex: index, answer: option })}
                className="h-4 w-4 accent-amber"
              />
              <span className="w-5 text-xs font-bold text-muted">{String.fromCharCode(65 + index)}</span>
              <input
                aria-label={t('exam.edit.optionLabel', { letter: String.fromCharCode(65 + index) })}
                value={option}
                onChange={(event) => {
                  const options = (question.options ?? []).map((existing, at) => (at === index ? event.target.value : existing))
                  set({ options, ...(question.answerIndex === index ? { answer: event.target.value } : {}) }, `option-${index}`)
                }}
                className={field}
              />
              <button
                type="button"
                aria-label={t('exam.edit.removeOption', { letter: String.fromCharCode(65 + index) })}
                disabled={(question.options ?? []).length <= 2}
                onClick={() => {
                  const options = (question.options ?? []).filter((_, at) => at !== index)
                  const current = question.answerIndex ?? 0
                  const answerIndex = index === current ? 0 : index < current ? current - 1 : current
                  set({ options, answerIndex, answer: options[answerIndex] ?? '' })
                }}
                className={smallButton}
              >
                ×
              </button>
            </div>
          ))}
          {(question.options ?? []).length < 5 && (
            <button type="button" onClick={() => set({ options: [...(question.options ?? []), ''] })} className="text-xs font-bold text-amber-text hover:underline">
              {t('exam.edit.addOption')}
            </button>
          )}
        </fieldset>
      )}

      {question.type === 'true-false' && (
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">{t('exam.edit.truth')}</legend>
          <span className="text-xs font-bold text-ink">{t('exam.edit.truth')}</span>
          {([true, false] as const).map((value) => (
            <label key={String(value)} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`truth-${question.id}`}
                checked={question.answerBool === value}
                onChange={() => set({ answerBool: value, answer: value ? 'true' : 'false' })}
                className="h-4 w-4 accent-amber"
              />
              {value ? t('exam.edit.true') : t('exam.edit.false')}
            </label>
          ))}
        </fieldset>
      )}

      {question.type === 'matching' && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-ink">{t('exam.edit.pairs')}</legend>
          {(question.pairs ?? []).map((pair, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 text-xs font-bold text-muted">{index + 1}</span>
              <input
                aria-label={t('exam.edit.pairLeft', { number: index + 1 })}
                value={pair.left}
                onChange={(event) => onChange(withPairs(question, (question.pairs ?? []).map((existing, at) => (at === index ? { ...existing, left: event.target.value } : existing))), `left-${index}`)}
                className={field}
              />
              <span aria-hidden className="text-muted">↔</span>
              <input
                aria-label={t('exam.edit.pairRight', { number: index + 1 })}
                value={pair.right}
                onChange={(event) => onChange(withPairs(question, (question.pairs ?? []).map((existing, at) => (at === index ? { ...existing, right: event.target.value } : existing))), `right-${index}`)}
                className={field}
              />
              <button
                type="button"
                aria-label={t('exam.edit.removePair', { number: index + 1 })}
                disabled={(question.pairs ?? []).length <= 3}
                onClick={() => onChange(withPairs(question, (question.pairs ?? []).filter((_, at) => at !== index)))}
                className={smallButton}
              >
                ×
              </button>
            </div>
          ))}
          {(question.pairs ?? []).length < 8 && (
            <button type="button" onClick={() => onChange(withPairs(question, [...(question.pairs ?? []), { left: '', right: '' }]))} className="text-xs font-bold text-amber-text hover:underline">
              {t('exam.edit.addPair')}
            </button>
          )}
        </fieldset>
      )}

      {(question.type === 'fill-blanks' || question.type === 'short-answer' || question.type === 'open-ended') && (
        <div className="space-y-1">
          <label className="block text-xs font-bold text-ink" htmlFor={`answer-${question.id}`}>
            {t('exam.edit.expectedAnswer')}
          </label>
          <textarea id={`answer-${question.id}`} data-purpose="exam-answer" rows={question.type === 'open-ended' ? 3 : 2} value={question.answer} onChange={(event) => set({ answer: event.target.value }, 'answer')} className={field} />
        </div>
      )}

      {(question.type === 'fill-blanks' || question.type === 'short-answer') && (
        <div className="space-y-1">
          <label className="block text-xs font-bold text-ink" htmlFor={`accept-${question.id}`}>
            {t('exam.edit.acceptable')}
          </label>
          <input
            id={`accept-${question.id}`}
            value={(question.acceptableAnswers ?? []).join('; ')}
            onChange={(event) =>
              set(
                {
                  acceptableAnswers: event.target.value
                    .split(';')
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                },
                'acceptable',
              )
            }
            className={field}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-bold text-ink" htmlFor={`topic-${question.id}`}>
            {t('exam.edit.topic')}
          </label>
          <input id={`topic-${question.id}`} value={question.topic} onChange={(event) => set({ topic: event.target.value }, 'topic')} className={field} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-bold text-ink" htmlFor={`difficulty-${question.id}`}>
            {t('exam.edit.difficulty')}
          </label>
          <select
            id={`difficulty-${question.id}`}
            value={question.difficulty}
            onChange={(event) => set({ difficulty: event.target.value as ExamDifficulty })}
            className={`${field} h-[38px] py-0`}
          >
            {(['easy', 'medium', 'hard'] as const).map((level) => (
              <option key={level} value={level}>
                {t(`exam.setup.mix.${level}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(question.type === 'open-ended' || question.type === 'short-answer') && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-ink" htmlFor={`lines-${question.id}`}>
            {t('exam.edit.lines')}
          </label>
          <input
            id={`lines-${question.id}`}
            data-purpose="exam-lines"
            type="number"
            min={1}
            max={15}
            value={question.lines}
            onChange={(event) => set({ lines: Math.min(15, Math.max(1, Number.parseInt(event.target.value, 10) || 1)) }, 'lines')}
            className="h-9 w-16 rounded-lg border border-warm-border bg-card px-2 text-center text-sm text-ink"
          />
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="flex flex-wrap items-center gap-2 text-xs font-bold text-ink">
          {t('exam.edit.rubric')}
          {question.rubric.length > 0 && (
            <span data-purpose="exam-rubric-sum" className={`font-semibold ${rubricOff ? 'text-error' : 'text-muted'}`}>
              {t('exam.edit.rubricSum', { sum, points: question.points })}
            </span>
          )}
        </legend>
        {question.rubric.length === 0 && question.type === 'open-ended' && (
          <button type="button" data-purpose="exam-rubric-generate" disabled={rubricBusy} onClick={onGenerateRubric} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 text-xs font-bold text-navy hover:border-amber disabled:opacity-60">
            {rubricBusy && <SpinnerIcon className="h-3.5 w-3.5" />}
            {t('exam.edit.rubricGenerate')}
          </button>
        )}
        {question.rubric.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              aria-label={t('exam.edit.rubricText', { number: index + 1 })}
              value={item.text}
              onChange={(event) => set({ rubric: question.rubric.map((existing, at) => (at === index ? { ...existing, text: event.target.value } : existing)) }, `rubric-${index}`)}
              className={field}
            />
            <input
              type="number"
              min={0}
              max={100}
              aria-label={t('exam.edit.rubricPoints', { number: index + 1 })}
              value={item.points}
              onChange={(event) => set({ rubric: question.rubric.map((existing, at) => (at === index ? { ...existing, points: Math.max(0, Number.parseInt(event.target.value, 10) || 0) } : existing)) }, `rubric-points-${index}`)}
              className="h-9 w-16 shrink-0 rounded-lg border border-warm-border bg-card px-2 text-center text-sm text-ink"
            />
            <button type="button" aria-label={t('exam.edit.removeRubric', { number: index + 1 })} onClick={() => set({ rubric: question.rubric.filter((_, at) => at !== index) })} className={smallButton}>
              ×
            </button>
          </div>
        ))}
        {question.type !== 'mcq' && question.type !== 'true-false' && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => set({ rubric: [...question.rubric, { text: '', points: Math.max(0, question.points - sum) }] })}
              className="text-xs font-bold text-amber-text hover:underline"
            >
              {t('exam.edit.addRubric')}
            </button>
            {rubricOff && (
              <button type="button" data-purpose="exam-rubric-fit" onClick={() => onChange(fitRubric(question))} className="text-xs font-bold text-amber-text hover:underline">
                {t('exam.edit.rubricFit')}
              </button>
            )}
          </div>
        )}
      </fieldset>
    </article>
  )
}
