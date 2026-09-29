import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { GeneratedQuiz, QuizQuestion } from '../lib/quiz'
import { QUESTION_TYPE_LABEL_KEYS } from '../lib/quizTypes'
import DemoBanner from './DemoBanner'
import QuestionCard from './QuestionCard'
import PracticeQuestionCard from './PracticeQuestionCard'
import { CheckIcon, PencilIcon } from './icons'

export interface QuizResultMeta {
  questionCount: number
  questionType: string
  difficulty: string
  outputLanguage: string
}

interface ArchiveLink {
  href: string
  label: string
}

interface QuizResultViewProps {
  quiz: GeneratedQuiz
  demo: boolean
  meta: QuizResultMeta
  onTitleChange: (title: string) => void
  onQuestionUpdate: (id: string, updater: (question: QuizQuestion) => QuizQuestion) => void
  onQuestionDelete: (id: string) => void
  onQuestionRegenerate: (id: string) => void
  regeneratingId: string | null
  deletedQuestion: QuizQuestion | null
  onUndoDelete: () => void
  archiveLink?: ArchiveLink
  studyMode?: boolean
  onToggleStudyMode?: () => void
}

function buildQuizPlainText(
  quiz: GeneratedQuiz,
  labels: { answerKey: string; trueLabel: string; falseLabel: string; blank: string },
): string {
  const lines: string[] = [quiz.title, '']

  quiz.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.question}`)
    if (question.type === 'mcq') {
      question.options.forEach((option, optionIndex) => lines.push(`   ${String.fromCharCode(65 + optionIndex)}) ${option}`))
    } else if (question.type === 'true-false') {
      lines.push(`   ${labels.trueLabel} / ${labels.falseLabel}`)
    } else if (question.type === 'fill-blanks') {
      lines.push(`   ${labels.blank}`)
    } else if (question.type === 'matching') {
      question.pairs.forEach((pair) => lines.push(`   ${pair.left} — ______`))
    }
    lines.push('')
  })

  lines.push(labels.answerKey)
  quiz.questions.forEach((question, index) => {
    if (question.type === 'mcq') {
      lines.push(`${index + 1}. ${String.fromCharCode(65 + question.answerIndex)} — ${question.explanation}`)
    } else if (question.type === 'true-false') {
      lines.push(`${index + 1}. ${question.answerBool ? labels.trueLabel : labels.falseLabel} — ${question.explanation}`)
    } else if (question.type === 'matching') {
      const pairsText = question.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; ')
      lines.push(`${index + 1}. ${pairsText}`)
    } else {
      lines.push(`${index + 1}. ${question.answer} — ${question.explanation}`)
    }
  })

  return lines.join('\n')
}

export default function QuizResultView({
  quiz,
  demo,
  meta,
  onTitleChange,
  onQuestionUpdate,
  onQuestionDelete,
  onQuestionRegenerate,
  regeneratingId,
  deletedQuestion,
  onUndoDelete,
  archiveLink,
  studyMode = false,
  onToggleStudyMode,
}: QuizResultViewProps) {
  const { t } = useTranslation()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(quiz.title)
  const [showAnswers, setShowAnswers] = useState(true)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [practiceResults, setPracticeResults] = useState<Record<string, boolean>>({})
  const [resetSignal, setResetSignal] = useState(0)

  const metaLine = useMemo(() => {
    const typeLabel = t(QUESTION_TYPE_LABEL_KEYS[meta.questionType] ?? meta.questionType)
    const difficultyLabel = t(`params.difficulty.${meta.difficulty}`)
    const languageLabel = t(`inputCard.outputLanguage.${meta.outputLanguage}`, { defaultValue: meta.outputLanguage })
    return [t('params.questionCount.value', { count: meta.questionCount }), typeLabel, difficultyLabel, languageLabel].join(' • ')
  }, [meta, t])

  const handleTitleSave = () => {
    const trimmed = titleDraft.trim()
    if (!trimmed) return
    onTitleChange(trimmed)
    setIsEditingTitle(false)
  }

  const handleCopy = async () => {
    const text = buildQuizPlainText(quiz, {
      answerKey: t('create.result.answerKeyTitle'),
      trueLabel: t('create.result.trueLabel'),
      falseLabel: t('create.result.falseLabel'),
      blank: '______',
    })
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    } finally {
      setTimeout(() => setCopyState('idle'), 2500)
    }
  }

  const handleTryAgain = () => {
    setPracticeResults({})
    setResetSignal((value) => value + 1)
  }

  const correctCount = Object.values(practiceResults).filter(Boolean).length
  const answeredCount = Object.keys(practiceResults).length

  return (
    <section data-purpose="quiz-result" className="space-y-5">
      {demo && <DemoBanner message={t('create.result.demoNotice')} />}

      <div className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6" data-print-hide>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {isEditingTitle ? (
              <div className="flex flex-wrap items-center gap-2" data-print-hide>
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-warm-border bg-card px-3 py-1.5 font-serif text-xl text-navy"
                />
                <button
                  type="button"
                  onClick={handleTitleSave}
                  disabled={!titleDraft.trim()}
                  className="rounded-lg bg-amber px-3 py-1.5 text-xs font-bold text-navy hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber"
                >
                  {t('create.question.saveAction')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitleDraft(quiz.title)
                    setIsEditingTitle(false)
                  }}
                  className="rounded-lg border border-warm-border px-3 py-1.5 text-xs font-bold text-ink"
                >
                  {t('create.question.cancelAction')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl leading-snug font-semibold break-words text-navy">{quiz.title}</h2>
                <button
                  type="button"
                  title={t('create.result.titleEditLabel')}
                  aria-label={t('create.result.titleEditLabel')}
                  onClick={() => {
                    setTitleDraft(quiz.title)
                    setIsEditingTitle(true)
                  }}
                  data-print-hide
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-ink"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <p className="text-xs text-muted">{metaLine}</p>
          </div>

          {archiveLink && (
            <Link to={archiveLink.href} className="shrink-0 text-xs font-semibold text-amber-hover hover:underline" data-print-hide>
              {archiveLink.label}
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-warm-border pt-3" data-print-hide>
          {onToggleStudyMode && (
            <button
              type="button"
              role="switch"
              aria-checked={studyMode}
              aria-label={t('archive.studyMode')}
              onClick={onToggleStudyMode}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                studyMode ? 'bg-amber' : 'bg-warm-border'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full border border-warm-border bg-card transition-transform ${
                  studyMode ? 'translate-x-5 border-white' : 'translate-x-0.5'
                }`}
              />
            </button>
          )}
          {onToggleStudyMode && <span className="text-xs font-semibold text-ink">{t('archive.studyMode')}</span>}

          {!studyMode && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={showAnswers}
                aria-label={t('create.result.showAnswers')}
                onClick={() => setShowAnswers((value) => !value)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  showAnswers ? 'bg-amber' : 'bg-warm-border'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full border border-warm-border bg-card transition-transform ${
                    showAnswers ? 'translate-x-5 border-white' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-xs font-semibold text-ink">{t('create.result.showAnswers')}</span>

              <span className="mx-1 h-4 w-px bg-warm-border" />

              <button
                type="button"
                onClick={() => void handleCopy()}
                aria-live="polite"
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  copyState === 'error' ? 'border-error/40 text-error' : 'border-warm-border text-ink hover:border-focus-neutral'
                }`}
              >
                {copyState === 'copied'
                  ? t('create.result.copied')
                  : copyState === 'error'
                    ? t('create.result.copyFailed')
                    : t('create.result.copy')}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-focus-neutral"
              >
                {t('create.result.print')}
              </button>
            </>
          )}
        </div>
      </div>

      {studyMode ? (
        <>
          <ul className="space-y-4" data-print-hide>
            {quiz.questions.map((question, index) => (
              <PracticeQuestionCard
                key={`${question.id}-${resetSignal}`}
                index={index}
                question={question}
                resetSignal={resetSignal}
                onGraded={(correct) => setPracticeResults((current) => ({ ...current, [question.id]: correct }))}
              />
            ))}
          </ul>

          {answeredCount === quiz.questions.length && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warm-border bg-card p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <CheckIcon className="h-4 w-4 text-success" />
                {t('archive.practice.score', { correct: correctCount, total: quiz.questions.length })}
              </p>
              <button
                type="button"
                onClick={handleTryAgain}
                className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
              >
                {t('archive.practice.tryAgain')}
              </button>
            </div>
          )}
        </>
      ) : (
        <ul className="space-y-4" data-print-hide>
          {quiz.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index}
              question={question}
              showAnswers={showAnswers}
              isRegenerating={regeneratingId === question.id}
              onUpdate={(updater) => onQuestionUpdate(question.id, updater)}
              onDelete={() => onQuestionDelete(question.id)}
              onRegenerate={() => onQuestionRegenerate(question.id)}
            />
          ))}
        </ul>
      )}

      {deletedQuestion && (
        <div
          role="status"
          data-print-hide
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-warm-border bg-navy px-4 py-3 text-sm text-paper shadow-lg"
        >
          <span>{t('create.question.deletedUndo')}</span>
          <button type="button" onClick={onUndoDelete} className="font-bold text-amber hover:underline">
            {t('create.question.undo')}
          </button>
        </div>
      )}

      {!studyMode && (
        <div className="hidden" data-print-only>
          <h1>{quiz.title}</h1>
          <ol>
            {quiz.questions.map((question) => (
              <li key={question.id}>
                <p>{question.question}</p>
                {question.type === 'mcq' && (
                  <ul>
                    {question.options.map((option, optionIndex) => (
                      <li key={optionIndex}>
                        {String.fromCharCode(65 + optionIndex)}) {option}
                      </li>
                    ))}
                  </ul>
                )}
                {question.type === 'matching' &&
                  question.pairs.map((pair, pairIndex) => <p key={pairIndex}>{pair.left} — ______</p>)}
              </li>
            ))}
          </ol>
          <div data-print-answer-key>
            <h2>{t('create.result.answerKeyTitle')}</h2>
            <ol>
              {quiz.questions.map((question) => (
                <li key={question.id}>
                  {question.type === 'mcq' && `${String.fromCharCode(65 + question.answerIndex)} — ${question.explanation}`}
                  {question.type === 'true-false' &&
                    `${question.answerBool ? t('create.result.trueLabel') : t('create.result.falseLabel')} — ${question.explanation}`}
                  {question.type === 'matching' &&
                    question.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; ')}
                  {(question.type === 'fill-blanks' || question.type === 'short-answer' || question.type === 'open-ended') &&
                    `${question.answer} — ${question.explanation}`}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  )
}
