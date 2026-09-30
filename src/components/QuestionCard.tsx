import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { QuizPair, QuizQuestion } from '../lib/quiz'
import { computeDerangement, getRightOrder } from '../lib/matching'
import { answerSignature } from '../lib/answerCheck'
import { MAX_HINT_CHARS, findHintLeak, getHints } from '../lib/hints'
import MathText from './MathText'
import MatchingColumns from './MatchingColumns'
import McqCheck from './McqCheck'
import TrueFalseCheck from './TrueFalseCheck'
import FillBlankCheck from './FillBlankCheck'
import ShortAnswerCheck from './ShortAnswerCheck'
import OpenEndedCheck from './OpenEndedCheck'
import { useExplanationUnlocked } from '../hooks/useExplanationUnlocked'
import { CheckIcon, PencilIcon, RefreshIcon, SpinnerIcon, TrashIcon } from './icons'

const MIN_MATCHING_PAIRS = 3
const MAX_MATCHING_PAIRS = 6

function hasDuplicates(values: string[]): boolean {
  const normalized = values.map((value) => value.trim().toLowerCase())
  return new Set(normalized).size !== normalized.length
}

/** Splits a "one per line" textarea value into a trimmed, non-empty list — used for key points
 * and accepted answers in the edit form. */
function linesToList(text: string, max: number): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, max)
}

function listToLines(list: string[] | undefined): string {
  return (list ?? []).join('\n')
}

const TYPE_LABEL_KEYS: Record<QuizQuestion['type'], string> = {
  mcq: 'create.question.type.mcq',
  'true-false': 'create.question.type.trueFalse',
  'fill-blanks': 'create.question.type.fillBlanks',
  'short-answer': 'create.question.type.shortAnswer',
  matching: 'create.question.type.matching',
  'open-ended': 'create.question.type.openEnded',
}

function isDraftValid(draft: QuizQuestion): boolean {
  if (!draft.question.trim()) return false
  switch (draft.type) {
    case 'mcq':
      return draft.options.length >= 2 && draft.options.every((option) => option.trim().length > 0)
    case 'true-false':
      return true
    case 'fill-blanks':
    case 'short-answer':
      return draft.answer.trim().length > 0
    case 'open-ended':
      return draft.answer.trim().length > 0 && (draft.keyPoints ?? []).some((point) => point.trim().length > 0)
    case 'matching':
      return (
        draft.pairs.length >= MIN_MATCHING_PAIRS &&
        draft.pairs.length <= MAX_MATCHING_PAIRS &&
        draft.pairs.every((pair) => pair.left.trim() && pair.right.trim()) &&
        !hasDuplicates(draft.pairs.map((pair) => pair.left)) &&
        !hasDuplicates(draft.pairs.map((pair) => pair.right))
      )
  }
}

function trimHints(hints: string[] | undefined): string[] | undefined {
  const trimmed = (hints ?? []).map((hint) => hint.trim().slice(0, MAX_HINT_CHARS)).filter(Boolean)
  return trimmed.length > 0 ? trimmed : undefined
}

function trimDraft(draft: QuizQuestion): QuizQuestion {
  const base = { ...draft, question: draft.question.trim(), explanation: draft.explanation.trim(), hints: trimHints(draft.hints) }
  switch (base.type) {
    case 'mcq':
      return { ...base, options: base.options.map((option) => option.trim()) }
    case 'matching': {
      const pairs = base.pairs.map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() }))
      return { ...base, pairs, rightOrder: computeDerangement(pairs.length, base.id) }
    }
    case 'fill-blanks':
    case 'short-answer':
      return { ...base, answer: base.answer.trim(), acceptableAnswers: (base.acceptableAnswers ?? []).map((entry) => entry.trim()).filter(Boolean) }
    case 'open-ended':
      return { ...base, answer: base.answer.trim(), keyPoints: (base.keyPoints ?? []).map((entry) => entry.trim()).filter(Boolean) }
    default:
      return base
  }
}

interface QuestionCardProps {
  index: number
  question: QuizQuestion
  showAnswers: boolean
  isRegenerating: boolean
  outputLanguage: string
  onUpdate: (updater: (question: QuizQuestion) => QuizQuestion) => void
  onDelete: () => void
  onRegenerate: () => void
}

export default function QuestionCard({ index, question, showAnswers, isRegenerating, outputLanguage, onUpdate, onDelete, onRegenerate }: QuestionCardProps) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [isExplanationOpen, setIsExplanationOpen] = useState(false)
  const [draft, setDraft] = useState<QuizQuestion>(question)
  const [hintLeakError, setHintLeakError] = useState(false)

  // The explanation stays hidden, for every question type, until the student completes their
  // first check (right, partial or wrong) or the global Show answers switch is on — never a free
  // spoiler. The signature resets this the moment the question's correctness-relevant content
  // actually changes (edit/regenerate/replace), not on unrelated re-renders.
  const { unlocked: explanationAllowed, markChecked: markExplanationChecked } = useExplanationUnlocked(answerSignature(question), showAnswers)

  const startEditing = () => {
    setDraft(question)
    setHintLeakError(false)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setHintLeakError(false)
  }

  const saveEditing = () => {
    if (!isDraftValid(draft)) return
    const trimmed = trimDraft(draft)
    if (findHintLeak(trimmed, getHints(trimmed), outputLanguage, { requireComplete: false })) {
      setHintLeakError(true)
      return
    }
    setHintLeakError(false)
    onUpdate(() => trimmed)
    setIsEditing(false)
  }

  return (
    <li
      data-purpose="question-card"
      className="relative space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6"
    >
      {isRegenerating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-card/80">
          <SpinnerIcon className="h-6 w-6 text-amber-hover" />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">
            {index + 1}
          </span>
          <span className="mt-1 shrink-0 rounded-full bg-amber/12 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-hover uppercase">
            {t(TYPE_LABEL_KEYS[question.type])}
          </span>
        </div>

        {!isEditing && (
          <div className="flex shrink-0 items-center gap-1" data-print-hide>
            <button
              type="button"
              title={t('create.question.editAction')}
              aria-label={t('create.question.editAction')}
              onClick={startEditing}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-warm-border/50 hover:text-ink"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={t('create.question.regenerateAction')}
              aria-label={t('create.question.regenerateAction')}
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-warm-border/50 hover:text-ink disabled:opacity-50"
            >
              <RefreshIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={t('create.question.deleteAction')}
              aria-label={t('create.question.deleteAction')}
              onClick={onDelete}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-error/10 hover:text-error"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <QuestionEditForm
          draft={draft}
          onChange={(next) => {
            setDraft(next)
            setHintLeakError(false)
          }}
          onSave={saveEditing}
          onCancel={cancelEditing}
          hintLeakError={hintLeakError}
        />
      ) : (
        <QuestionView question={question} showAnswers={showAnswers} outputLanguage={outputLanguage} onFirstCheck={markExplanationChecked} />
      )}

      {!isEditing && question.explanation && explanationAllowed && (
        <div data-print-hide>
          <button
            type="button"
            onClick={() => setIsExplanationOpen((open) => !open)}
            className="text-xs font-semibold text-amber-hover hover:underline"
          >
            {isExplanationOpen ? t('create.result.hideExplanation') : t('create.result.showExplanation')}
          </button>
          {isExplanationOpen && (
            <div className="mt-2 rounded-xl border border-warm-border bg-paper p-3.5 text-xs break-words text-muted">
              <MathText text={question.explanation} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function QuestionView({
  question,
  showAnswers,
  outputLanguage,
  onFirstCheck,
}: {
  question: QuizQuestion
  showAnswers: boolean
  outputLanguage: string
  onFirstCheck?: () => void
}) {
  const { t } = useTranslation()
  const signature = answerSignature(question)

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold break-words text-ink">
        <MathText text={question.question} />
      </p>

      {question.type === 'mcq' && (
        <>
          {showAnswers && (
            <ul className="space-y-1.5" data-print-hide>
              {question.options.map((option, optionIndex) => {
                const isCorrect = optionIndex === question.answerIndex
                return (
                  <li
                    key={optionIndex}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      isCorrect ? 'border-amber/40 bg-amber/12 font-semibold text-ink' : 'border-warm-border text-ink'
                    }`}
                  >
                    <span className="font-bold text-muted">{String.fromCharCode(65 + optionIndex)}.</span>
                    <span className="min-w-0 flex-1 break-words">
                      <MathText text={option} />
                    </span>
                    {isCorrect && <CheckIcon className="h-4 w-4 shrink-0 text-amber-hover" />}
                  </li>
                )
              })}
            </ul>
          )}
          <McqCheck
            options={question.options}
            answerIndex={question.answerIndex}
            signature={signature}
            hints={getHints(question)}
            showAnswers={showAnswers}
            onFirstCheck={onFirstCheck}
          />
        </>
      )}

      {question.type === 'true-false' && (
        <>
          {showAnswers && (
            <div className="flex gap-2" data-print-hide>
              {[true, false].map((value) => {
                const isCorrect = value === question.answerBool
                return (
                  <span
                    key={String(value)}
                    className={`rounded-lg border px-3.5 py-2 text-sm font-semibold ${
                      isCorrect ? 'border-amber/40 bg-amber/12 text-ink' : 'border-warm-border text-muted'
                    }`}
                  >
                    {value ? t('create.result.trueLabel') : t('create.result.falseLabel')}
                  </span>
                )
              })}
            </div>
          )}
          <TrueFalseCheck
            answerBool={question.answerBool}
            signature={signature}
            hints={getHints(question)}
            showAnswers={showAnswers}
            onFirstCheck={onFirstCheck}
          />
        </>
      )}

      {question.type === 'fill-blanks' && (
        <div className="space-y-1.5">
          {showAnswers && (
            <p className="text-sm font-semibold break-words text-amber-hover" data-print-hide>
              <MathText text={question.answer} />
            </p>
          )}
          <FillBlankCheck question={question} signature={signature} showAnswers={showAnswers} onFirstCheck={onFirstCheck} />
        </div>
      )}

      {question.type === 'short-answer' && (
        <div className="space-y-1.5">
          {showAnswers && (
            <div className="rounded-xl border border-warm-border bg-paper p-3.5 text-sm break-words text-ink" data-print-hide>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">{t('create.result.modelAnswerLabel')}</p>
              <MathText text={question.answer} />
            </div>
          )}
          <ShortAnswerCheck question={question} signature={signature} outputLanguage={outputLanguage} showAnswers={showAnswers} onFirstCheck={onFirstCheck} />
        </div>
      )}

      {question.type === 'open-ended' && (
        <div className="space-y-1.5">
          {showAnswers && (
            <div className="rounded-xl border border-warm-border bg-paper p-3.5 text-sm break-words text-ink" data-print-hide>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">{t('create.result.modelAnswerLabel')}</p>
              <MathText text={question.answer} />
            </div>
          )}
          <OpenEndedCheck question={question} signature={signature} outputLanguage={outputLanguage} showAnswers={showAnswers} onFirstCheck={onFirstCheck} />
        </div>
      )}

      {question.type === 'matching' && (
        <MatchingColumns
          pairs={question.pairs}
          rightOrder={getRightOrder(question)}
          showAnswers={showAnswers}
          hints={getHints(question)}
          onFirstCheck={onFirstCheck}
        />
      )}
    </div>
  )
}

function QuestionEditForm({
  draft,
  onChange,
  onSave,
  onCancel,
  hintLeakError,
}: {
  draft: QuizQuestion
  onChange: (question: QuizQuestion) => void
  onSave: () => void
  onCancel: () => void
  hintLeakError: boolean
}) {
  const { t } = useTranslation()

  const textareaClasses =
    'w-full resize-y rounded-xl border border-warm-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-solid'
  const inputClasses = 'w-full rounded-lg border border-warm-border bg-card px-3 py-1.5 text-sm text-ink'

  const updateHint = (index: 0 | 1, value: string) => {
    const hints = [...(draft.hints ?? ['', ''])]
    while (hints.length < 2) hints.push('')
    hints[index] = value.slice(0, MAX_HINT_CHARS)
    onChange({ ...draft, hints })
  }

  const updateOption = (index: number, value: string) => {
    if (draft.type !== 'mcq') return
    const options = draft.options.map((option, i) => (i === index ? value : option))
    onChange({ ...draft, options })
  }

  const addOption = () => {
    if (draft.type !== 'mcq') return
    onChange({ ...draft, options: [...draft.options, ''] })
  }

  const removeOption = (index: number) => {
    if (draft.type !== 'mcq' || draft.options.length <= 2) return
    const options = draft.options.filter((_, i) => i !== index)
    const answerIndex = draft.answerIndex >= options.length ? 0 : draft.answerIndex
    onChange({ ...draft, options, answerIndex })
  }

  const updatePair = (index: number, key: keyof QuizPair, value: string) => {
    if (draft.type !== 'matching') return
    const pairs = draft.pairs.map((pair, i) => (i === index ? { ...pair, [key]: value } : pair))
    onChange({ ...draft, pairs })
  }

  const addPair = () => {
    if (draft.type !== 'matching' || draft.pairs.length >= MAX_MATCHING_PAIRS) return
    onChange({ ...draft, pairs: [...draft.pairs, { left: '', right: '' }] })
  }

  const removePair = (index: number) => {
    if (draft.type !== 'matching' || draft.pairs.length <= MIN_MATCHING_PAIRS) return
    onChange({ ...draft, pairs: draft.pairs.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      <textarea
        rows={2}
        value={draft.question}
        onChange={(event) => onChange({ ...draft, question: event.target.value })}
        className={textareaClasses}
      />

      {draft.type === 'mcq' && (
        <div className="space-y-2">
          {draft.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <input
                type="radio"
                name="mcq-answer"
                checked={draft.answerIndex === optionIndex}
                onChange={() => onChange({ ...draft, answerIndex: optionIndex })}
                className="h-4 w-4 accent-amber"
                aria-label={t('create.result.modelAnswerLabel')}
              />
              <input value={option} onChange={(event) => updateOption(optionIndex, event.target.value)} className={inputClasses} />
              <button
                type="button"
                onClick={() => removeOption(optionIndex)}
                disabled={draft.options.length <= 2}
                aria-label={t('create.question.removeOption')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-error disabled:opacity-40"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addOption} className="text-xs font-semibold text-amber-hover hover:underline">
            + {t('create.question.addOption')}
          </button>
        </div>
      )}

      {draft.type === 'true-false' && (
        <div className="flex gap-2">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => onChange({ ...draft, answerBool: value })}
              className={`rounded-lg border px-3.5 py-2 text-sm font-semibold ${
                draft.answerBool === value ? 'border-amber bg-amber/12 text-ink' : 'border-warm-border text-muted'
              }`}
            >
              {value ? t('create.result.trueLabel') : t('create.result.falseLabel')}
            </button>
          ))}
        </div>
      )}

      {(draft.type === 'fill-blanks' || draft.type === 'short-answer' || draft.type === 'open-ended') && (
        <textarea
          rows={2}
          value={draft.answer}
          onChange={(event) => onChange({ ...draft, answer: event.target.value })}
          placeholder={t('create.result.modelAnswerLabel')}
          className={textareaClasses}
        />
      )}

      {(draft.type === 'fill-blanks' || draft.type === 'short-answer') && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted">{t('create.question.acceptableAnswersLabel')}</label>
          <textarea
            rows={2}
            value={listToLines(draft.acceptableAnswers)}
            onChange={(event) => onChange({ ...draft, acceptableAnswers: linesToList(event.target.value, 4) })}
            placeholder={t('create.question.acceptableAnswersLabel')}
            className={textareaClasses}
          />
        </div>
      )}

      {draft.type === 'open-ended' && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted">{t('create.question.keyPointsLabel')}</label>
          <textarea
            rows={3}
            value={listToLines(draft.keyPoints)}
            onChange={(event) => onChange({ ...draft, keyPoints: linesToList(event.target.value, 4) })}
            placeholder={t('create.question.keyPointsLabel')}
            className={textareaClasses}
          />
        </div>
      )}

      {draft.type === 'matching' && (
        <div className="space-y-2">
          {draft.pairs.map((pair, pairIndex) => (
            <div key={pairIndex} className="flex items-center gap-2">
              <input
                value={pair.left}
                onChange={(event) => updatePair(pairIndex, 'left', event.target.value)}
                placeholder={t('create.question.leftLabel')}
                className={inputClasses}
              />
              <input
                value={pair.right}
                onChange={(event) => updatePair(pairIndex, 'right', event.target.value)}
                placeholder={t('create.question.rightLabel')}
                className={inputClasses}
              />
              <button
                type="button"
                onClick={() => removePair(pairIndex)}
                disabled={draft.pairs.length <= MIN_MATCHING_PAIRS}
                aria-label={t('create.question.removePair')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-error disabled:opacity-40"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPair}
            disabled={draft.pairs.length >= MAX_MATCHING_PAIRS}
            className="text-xs font-semibold text-amber-hover hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
          >
            + {t('create.question.addPair')}
          </button>
        </div>
      )}

      <textarea
        rows={2}
        value={draft.explanation}
        onChange={(event) => onChange({ ...draft, explanation: event.target.value })}
        placeholder={t('create.result.explanationLabel')}
        className={textareaClasses}
      />

      <div className="space-y-2">
        <div>
          <label htmlFor={`hint1-${draft.id}`} className="text-xs font-semibold text-muted">
            {t('create.question.hint1Label')}
          </label>
          <input
            id={`hint1-${draft.id}`}
            value={draft.hints?.[0] ?? ''}
            onChange={(event) => updateHint(0, event.target.value)}
            maxLength={MAX_HINT_CHARS}
            placeholder={t('create.question.hint1Label')}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={`hint2-${draft.id}`} className="text-xs font-semibold text-muted">
            {t('create.question.hint2Label')}
          </label>
          <input
            id={`hint2-${draft.id}`}
            value={draft.hints?.[1] ?? ''}
            onChange={(event) => updateHint(1, event.target.value)}
            maxLength={MAX_HINT_CHARS}
            placeholder={t('create.question.hint2Label')}
            className={inputClasses}
          />
        </div>
        {hintLeakError && <p className="text-xs font-medium text-error">{t('create.question.hintLeakError')}</p>}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!isDraftValid(draft)}
          className="rounded-xl bg-amber px-3.5 py-2 text-xs font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber"
        >
          {t('create.question.saveAction')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-warm-border bg-card px-3.5 py-2 text-xs font-bold text-ink transition-colors hover:border-focus-neutral"
        >
          {t('create.question.cancelAction')}
        </button>
      </div>
    </div>
  )
}
