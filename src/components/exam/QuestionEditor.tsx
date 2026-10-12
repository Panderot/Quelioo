import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { fitDifficulty } from '../../lib/exam/bloom'
import { BLOOM_CAP } from '../../lib/exam/bloomConfig'
import { fitRubric, moveItem, rubricTotal, withExtras, withPairs } from '../../lib/exam/edit'
import { setQuestionPoints } from '../../lib/exam/points'
import type { BloomLevel, ExamDifficulty, ExamQuestion } from '../../lib/exam/types'
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
  /** Language of the exam paper: spell checking of every field follows it, not the language of the app. */
  lang: string
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
  const { question, number, count, onChange, onMove, onDelete, onRegenerate, regenerating, canRegenerate, onGenerateRubric, rubricBusy, notice, lang } = props
  const { t } = useTranslation()
  const [showContext, setShowContext] = useState(Boolean(question.context))
  const set = (patch: Partial<ExamQuestion>, coalesce?: string) => onChange({ ...question, ...patch }, coalesce)
  const sum = rubricTotal(question)
  const rubricOff = question.rubric.length > 0 && sum !== question.points
  const label = (key: string) => `${t(key)} — ${number}`
  // Every editable field is checked against the language of the paper (a Turkish exam is not spell-checked as English).
  const text = { lang, spellCheck: true }
  const stemRef = useRef<HTMLTextAreaElement>(null)
  const insertBlank = () => {
    const box = stemRef.current
    const start = box?.selectionStart ?? question.stem.length
    const end = box?.selectionEnd ?? start
    set({ stem: `${question.stem.slice(0, start)}___${question.stem.slice(end)}` }, 'stem')
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(start + 3, start + 3)
    })
  }

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
        <select
          aria-label={label('exam.edit.bloom')}
          data-purpose="exam-bloom-chip"
          value={question.bloomLevel ?? ''}
          onChange={(event) => {
            const bloomLevel = event.target.value === '' ? undefined : (Number(event.target.value) as BloomLevel)
            // The difficulty label never contradicts the level (recall is not hard, evaluation is not easy).
            const next: ExamQuestion = { ...question, difficulty: fitDifficulty(question.type, bloomLevel, question.difficulty) }
            if (bloomLevel === undefined) delete next.bloomLevel
            else next.bloomLevel = bloomLevel
            onChange(next)
          }}
          className="h-7 rounded-full border border-warm-border bg-paper px-2.5 text-[11px] font-bold text-navy hover:border-amber"
        >
          <option value="">{t('exam.bloom.notSet')}</option>
          {([1, 2, 3, 4, 5, 6] as const)
            .filter((level) => level <= BLOOM_CAP[question.type])
            .map((level) => (
              <option key={level} value={level}>
                {t(`exam.bloom.names.${level}`)}
              </option>
            ))}
        </select>
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
          <textarea id={`ctx-${question.id}`} {...text} rows={2} value={question.context ?? ''} onChange={(event) => set({ context: event.target.value || undefined }, 'context')} className={field} />
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
        <textarea id={`stem-${question.id}`} ref={stemRef} {...text} data-purpose="exam-stem" rows={3} value={question.stem} onChange={(event) => set({ stem: event.target.value }, 'stem')} className={field} />
        {question.type === 'fill-blanks' && (
          <button type="button" data-purpose="exam-insert-blank" onClick={insertBlank} className="text-xs font-bold text-amber-text hover:underline">
            {t('exam.edit.insertBlank')}
          </button>
        )}
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
                {...text}
                value={option}
                onChange={(event) => {
                  const options = (question.options ?? []).map((existing, at) => (at === index ? event.target.value : existing))
                  set({ options, ...(question.answerIndex === index ? { answer: event.target.value } : {}) }, `option-${index}`)
                }}
                className={field}
              />
              <button
                type="button"
                aria-label={t('exam.edit.moveOptionUp', { letter: String.fromCharCode(65 + index) })}
                disabled={index === 0}
                onClick={() => {
                  const options = moveItem(question.options ?? [], index, -1)
                  const current = question.answerIndex
                  set({ options, ...(current === undefined ? {} : { answerIndex: current === index ? index - 1 : current === index - 1 ? index : current }) })
                }}
                className={smallButton}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t('exam.edit.moveOptionDown', { letter: String.fromCharCode(65 + index) })}
                disabled={index === (question.options ?? []).length - 1}
                onClick={() => {
                  const options = moveItem(question.options ?? [], index, 1)
                  const current = question.answerIndex
                  set({ options, ...(current === undefined ? {} : { answerIndex: current === index ? index + 1 : current === index + 1 ? index : current }) })
                }}
                className={smallButton}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={t('exam.edit.removeOption', { letter: String.fromCharCode(65 + index) })}
                disabled={(question.options ?? []).length <= 2}
                onClick={() => {
                  const options = (question.options ?? []).filter((_, at) => at !== index)
                  const current = question.answerIndex
                  // Removing the correct option leaves the correct one unset; removing an earlier option shifts the key.
                  const answerIndex = current === undefined || index === current ? undefined : index < current ? current - 1 : current
                  const next: ExamQuestion = { ...question, options, answer: answerIndex === undefined ? '' : (options[answerIndex] ?? '') }
                  if (answerIndex === undefined) delete next.answerIndex
                  else next.answerIndex = answerIndex
                  onChange(next)
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
                {...text}
                value={pair.left}
                onChange={(event) => onChange(withPairs(question, (question.pairs ?? []).map((existing, at) => (at === index ? { ...existing, left: event.target.value } : existing))), `left-${index}`)}
                className={field}
              />
              <span aria-hidden className="text-muted">↔</span>
              <input
                aria-label={t('exam.edit.pairRight', { number: index + 1 })}
                {...text}
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
          <p className="pt-1 text-xs font-bold text-ink">{t('exam.edit.extras')}</p>
          {(question.extras ?? []).map((extra, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                aria-label={t('exam.edit.extraLabel', { number: index + 1 })}
                {...text}
                value={extra}
                onChange={(event) => onChange(withExtras(question, (question.extras ?? []).map((existing, at) => (at === index ? event.target.value : existing))), `extra-${index}`)}
                className={field}
              />
              <button type="button" aria-label={t('exam.edit.removeExtra', { number: index + 1 })} onClick={() => onChange(withExtras(question, (question.extras ?? []).filter((_, at) => at !== index)))} className={smallButton}>
                ×
              </button>
            </div>
          ))}
          {(question.extras ?? []).length < 4 && (
            <button type="button" data-purpose="exam-add-extra" onClick={() => onChange(withExtras(question, [...(question.extras ?? []), '']))} className="text-xs font-bold text-amber-text hover:underline">
              {t('exam.edit.addExtra')}
            </button>
          )}
        </fieldset>
      )}

      {(question.type === 'fill-blanks' || question.type === 'short-answer' || question.type === 'open-ended') && (
        <div className="space-y-1">
          <label className="block text-xs font-bold text-ink" htmlFor={`answer-${question.id}`}>
            {t('exam.edit.expectedAnswer')}
          </label>
          <textarea id={`answer-${question.id}`} {...text} data-purpose="exam-answer" rows={question.type === 'open-ended' ? 3 : 2} value={question.answer} onChange={(event) => set({ answer: event.target.value }, 'answer')} className={field} />
        </div>
      )}

      {(question.type === 'fill-blanks' || question.type === 'short-answer') && (
        <div className="space-y-1">
          <label className="block text-xs font-bold text-ink" htmlFor={`accept-${question.id}`}>
            {t('exam.edit.acceptable')}
          </label>
          <input
            id={`accept-${question.id}`}
            {...text}
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
          <input id={`topic-${question.id}`} {...text} value={question.topic} onChange={(event) => set({ topic: event.target.value }, 'topic')} className={field} />
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
              {...text}
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
