import { mathToPlainText } from '../lib/mathPlain'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getKeyPoints, otherShortAnswers } from '../lib/quiz'
import type { GeneratedQuiz, QuizQuestion } from '../lib/quiz'
import { QUESTION_TYPE_LABEL_KEYS } from '../lib/quizTypes'
import { getOutputLanguage } from '../data/outputLanguages'
import { buildAnswerKeyLine, getRightOrder, letterFor } from '../lib/matching'
import { computeQuizTotalSeconds, secondsToDisplayMinutes } from '../lib/estimateTime'
import type { EstimateDifficulty } from '../lib/estimateTime'
import { buildSongFactPlan, buildSongKeyFacts } from '../lib/songFacts'
import { MAX_SOURCE_EXCERPT_CHARS } from '../lib/song'
import QuestionCard from './QuestionCard'
import PracticeQuestionCard from './PracticeQuestionCard'
import SongButton from './SongButton'
import MoreMenu from './MoreMenu'
import CoveragePanel from './CoveragePanel'
import AddCardsDialog from './flashcards/AddCardsDialog'
import { addCards, cardsForDeck, createDeck, updateDeck, useFlashcards } from '../lib/flashcardStorage'
import { DEFAULT_NEW_PER_DAY } from '../lib/srs'
import { missingCards, quizToCards } from '../lib/quizToCards'
import { BookIcon, CheckIcon, CloseIcon, PencilIcon } from './icons'

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
  quizId: string
  sourceText: string
  quiz: GeneratedQuiz
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
  missingCount?: number
  /** The source supports only about this many good questions (fewer than requested). */
  supportedCount?: number
  isToppingUp?: boolean
  onTopUp?: () => void
  onSongSaved?: () => void
  /** "Add questions for missing facts" (quizzes with a facts plan only). */
  onAddMissing?: () => void
  isAddingMissing?: boolean
}

/** Ruled writing lines for the print/PDF layout — one line for fill-blanks, two for
 * short-answer, about six for open-ended, so the printed page is actually usable on paper. */
function PrintWritingLines({ count, width = '100%' }: { count: number; width?: string }) {
  return (
    <div style={{ marginTop: '0.35rem' }}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} style={{ borderBottom: '1px solid #000', height: '1.3rem', width }} />
      ))}
    </div>
  )
}

/** A short inline underline for a true/false style empty checkbox mark. */
function PrintCheckbox() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '0.75rem',
        height: '0.75rem',
        border: '1px solid #000',
        marginRight: '0.4rem',
        verticalAlign: 'middle',
      }}
    />
  )
}

/** True when every MCQ option is short enough that a two-column layout still reads cleanly on paper. */
function fitsTwoColumns(options: string[]): boolean {
  return options.length >= 4 && options.every((option) => option.length <= 40)
}

/** Joins an answer-key prefix with its explanation, omitting the "— explanation" suffix entirely
 * when explanations are off (empty string) instead of printing a dangling "— ". */
function withExplanation(prefix: string, explanation: string): string {
  return explanation ? `${prefix} — ${explanation}` : prefix
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
      const rightOrder = getRightOrder(question)
      question.pairs.forEach((pair, pairIndex) => lines.push(`   ${pairIndex + 1}) ${pair.left}`))
      rightOrder.forEach((pairIndex, position) => lines.push(`   ${letterFor(position)}) ${question.pairs[pairIndex].right}`))
    }
    lines.push('')
  })

  lines.push(labels.answerKey)
  quiz.questions.forEach((question, index) => {
    if (question.type === 'mcq') {
      lines.push(`${index + 1}. ${withExplanation(String.fromCharCode(65 + question.answerIndex), question.explanation)}`)
    } else if (question.type === 'true-false') {
      lines.push(`${index + 1}. ${withExplanation(question.answerBool ? labels.trueLabel : labels.falseLabel, question.explanation)}`)
    } else if (question.type === 'matching') {
      const rightOrder = getRightOrder(question)
      const pairsText = question.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; ')
      lines.push(`${index + 1}. ${buildAnswerKeyLine(rightOrder)} — ${pairsText}`)
    } else {
      lines.push(`${index + 1}. ${withExplanation(question.answer, question.explanation)}`)
    }
  })

  return lines.join('\n')
}

export default function QuizResultView({
  quizId,
  sourceText,
  quiz,
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
  missingCount = 0,
  supportedCount,
  isToppingUp = false,
  onTopUp,
  onSongSaved,
  onAddMissing,
  isAddingMissing = false,
}: QuizResultViewProps) {
  const { t } = useTranslation()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(quiz.title)
  const [showAnswers, setShowAnswers] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [practiceResults, setPracticeResults] = useState<Record<string, boolean>>({})
  const [hintsUsed, setHintsUsed] = useState(0)
  const [resetSignal, setResetSignal] = useState(0)
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  const [printVariant, setPrintVariant] = useState<'questions' | 'with-answers'>('questions')
  // First check per question (edit view or Study Mode) — later re-checks never overwrite it.
  const [firstAttempts, setFirstAttempts] = useState<Record<string, boolean>>({})
  const [convertOpen, setConvertOpen] = useState(false)
  const [mistakesResult, setMistakesResult] = useState<{ deckId: string; deckName: string; count: number } | null>(null)
  const flashcards = useFlashcards()

  const timeEstimateLabel = useMemo(() => {
    const totalSeconds = computeQuizTotalSeconds(quiz.questions, (meta.difficulty as EstimateDifficulty) ?? 'medium')
    const { underAMinute, minutes } = secondsToDisplayMinutes(totalSeconds)
    return underAMinute ? t('create.result.timeUnderMinute') : t('create.result.timeTotal', { minutes })
  }, [quiz.questions, meta.difficulty, t])

  const metaLine = useMemo(() => {
    const typeLabel = t(QUESTION_TYPE_LABEL_KEYS[meta.questionType] ?? meta.questionType)
    const difficultyLabel = t(`params.difficulty.${meta.difficulty}`)
    const languageLabel =
      meta.outputLanguage === 'auto'
        ? t('inputCard.outputLanguage.auto')
        : (getOutputLanguage(meta.outputLanguage)?.nativeName ?? meta.outputLanguage)
    return [t('params.questionCount.value', { count: meta.questionCount }), typeLabel, difficultyLabel, languageLabel, timeEstimateLabel].join(' • ')
  }, [meta, t, timeEstimateLabel])

  const printMetaLine = useMemo(() => {
    const typeLabel = t(QUESTION_TYPE_LABEL_KEYS[meta.questionType] ?? meta.questionType)
    const difficultyLabel = t(`params.difficulty.${meta.difficulty}`)
    return [t('params.questionCount.value', { count: meta.questionCount }), typeLabel, difficultyLabel, timeEstimateLabel].join(' • ')
  }, [meta, t, timeEstimateLabel])

  const songKeyFacts = useMemo(() => buildSongKeyFacts(quiz), [quiz])
  const songFactPlan = useMemo(() => buildSongFactPlan(quiz), [quiz])
  const songSourceExcerpt = useMemo(() => mathToPlainText(sourceText).slice(0, MAX_SOURCE_EXCERPT_CHARS), [sourceText])

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
    setHintsUsed(0)
    setResetSignal((value) => value + 1)
  }

  const handleOpenPrintMenu = () => {
    setPrintVariant('questions')
    setPrintMenuOpen(true)
  }

  const handleConfirmPrint = () => {
    setPrintMenuOpen(false)
    const previousTitle = document.title
    document.title = quiz.title
    const restoreTitle = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restoreTitle)
    }
    window.addEventListener('afterprint', restoreTitle)
    // Let the dialog-close/variant render commit before the (synchronous) print call.
    window.setTimeout(() => window.print(), 50)
  }

  const recordFirstAttempt = (questionId: string) => (correct: boolean) =>
    setFirstAttempts((current) => (questionId in current ? current : { ...current, [questionId]: correct }))

  const cardLabels = { trueLabel: t('create.result.trueLabel'), falseLabel: t('create.result.falseLabel') }
  const mistakeIds = new Set(quiz.questions.filter((question) => firstAttempts[question.id] === false).map((question) => question.id))
  const mistakesRef = `${quizId}#mistakes`

  // Mistakes go straight into "{title} · Mistakes" (no review): new cards are due today, and the
  // daily new-card limit is raised so all of them really are.
  const handleMistakesToCards = () => {
    const cards = quizToCards(quiz, cardLabels, mistakeIds)
    const existing = flashcards.decks.find((deck) => deck.source === 'quiz' && deck.sourceRef === mistakesRef)
    if (existing) {
      const fresh = missingCards(cards, cardsForDeck(flashcards.cards, existing.id).map((card) => card.front))
      addCards(existing.id, fresh)
      const pendingNew = cardsForDeck(flashcards.cards, existing.id).filter((card) => card.reviews === 0).length + fresh.length
      if (pendingNew > existing.newPerDay) updateDeck(existing.id, { newPerDay: pendingNew })
      setMistakesResult({ deckId: existing.id, deckName: existing.name, count: fresh.length })
      return
    }
    const deck = createDeck({
      name: t('flashcards.mistakes.deckName', { title: quiz.title }),
      source: 'quiz',
      sourceRef: mistakesRef,
      language: meta.outputLanguage,
      newPerDay: Math.max(DEFAULT_NEW_PER_DAY, cards.length),
    })
    addCards(deck.id, cards)
    setMistakesResult({ deckId: deck.id, deckName: deck.name, count: cards.length })
  }

  const moreItems = [
    { key: 'flashcards', label: t('flashcards.convert.action'), onSelect: () => setConvertOpen(true) },
    ...(mistakeIds.size > 0 ? [{ key: 'mistakes', label: t('flashcards.mistakes.action', { count: mistakeIds.size }), onSelect: handleMistakesToCards }] : []),
  ]

  const correctCount = Object.values(practiceResults).filter(Boolean).length
  const answeredCount = Object.keys(practiceResults).length

  return (
    <section data-purpose="quiz-result" className="space-y-5">
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
            {quiz.coverage && (
              <CoveragePanel
                coverage={quiz.coverage}
                questions={quiz.questions}
                questionType={meta.questionType}
                showAnswers={showAnswers && !studyMode}
                onAddMissing={studyMode ? undefined : onAddMissing}
                isAddingMissing={isAddingMissing}
              />
            )}
          </div>

          {archiveLink && (
            <Link to={archiveLink.href} className="shrink-0 text-xs font-semibold text-amber-text hover:underline" data-print-hide>
              {archiveLink.label}
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-warm-border pt-3" data-print-hide>
          {onToggleStudyMode && (
            <button
              type="button"
              onClick={onToggleStudyMode}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-amber"
            >
              <BookIcon className="h-3.5 w-3.5" />
              {studyMode ? t('archive.backToEdit') : t('archive.study')}
            </button>
          )}

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
                onClick={handleOpenPrintMenu}
                className="rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-focus-neutral"
              >
                {t('create.result.print')}
              </button>
            </>
          )}

          <SongButton
            quizId={quizId}
            quizTitle={quiz.title}
            keyFacts={songKeyFacts}
            factPlan={songFactPlan}
            sourceExcerpt={songSourceExcerpt}
            language={meta.outputLanguage}
            onSongSaved={onSongSaved}
          />
          <MoreMenu items={moreItems} />
        </div>

        {mistakesResult && (
          <p role="status" data-purpose="mistakes-result" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-success">
            {mistakesResult.count > 0
              ? t('flashcards.convert.added', { count: mistakesResult.count, name: mistakesResult.deckName })
              : t('flashcards.mistakes.allThere', { name: mistakesResult.deckName })}
            <Link to={`/flashcards/${mistakesResult.deckId}`} className="text-amber-text hover:underline">
              {t('flashcards.convert.openDeck')}
            </Link>
          </p>
        )}
      </div>

      {convertOpen && (
        <AddCardsDialog
          title={t('flashcards.convert.action')}
          defaultDeckName={quiz.title}
          source="quiz"
          sourceRef={quizId}
          initialCards={quizToCards(quiz, cardLabels)}
          onClose={() => setConvertOpen(false)}
        />
      )}

      {printMenuOpen && (
        <div data-print-hide>
          <button
            type="button"
            aria-label={t('song.close')}
            onClick={() => setPrintMenuOpen(false)}
            className="fixed inset-0 z-40 bg-ink/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-dialog-title"
            className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl border border-warm-border bg-card p-5 shadow-lg sm:inset-x-0"
          >
            <div className="flex items-center justify-between">
              <h2 id="print-dialog-title" className="font-serif text-base font-semibold text-navy">
                {t('create.result.printChooseTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setPrintMenuOpen(false)}
                aria-label={t('song.close')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-ink"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div role="radiogroup" aria-label={t('create.result.printChooseTitle')} className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={printVariant === 'questions'}
                onClick={() => setPrintVariant('questions')}
                className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  printVariant === 'questions'
                    ? 'border-amber bg-amber/15 text-amber-text'
                    : 'border-warm-border text-ink hover:border-focus-neutral'
                }`}
              >
                {t('create.result.printQuestionSheet')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={printVariant === 'with-answers'}
                onClick={() => setPrintVariant('with-answers')}
                className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  printVariant === 'with-answers'
                    ? 'border-amber bg-amber/15 text-amber-text'
                    : 'border-warm-border text-ink hover:border-focus-neutral'
                }`}
              >
                {t('create.result.printWithAnswers')}
              </button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrintMenuOpen(false)}
                className="rounded-lg border border-warm-border px-3 py-1.5 text-xs font-bold text-ink"
              >
                {t('create.question.cancelAction')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPrint}
                className="rounded-lg bg-amber px-3 py-1.5 text-xs font-bold text-navy hover:bg-amber-hover"
              >
                {t('create.result.printConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {studyMode ? (
        <>
          <ul className="space-y-4" data-print-hide>
            {quiz.questions.map((question, index) => (
              <PracticeQuestionCard
                key={`${question.id}-${resetSignal}`}
                index={index}
                question={question}
                outputLanguage={meta.outputLanguage}
                resetSignal={resetSignal}
                onGraded={(correct) => {
                  setPracticeResults((current) => ({ ...current, [question.id]: correct }))
                  recordFirstAttempt(question.id)(correct)
                }}
                onHintUsed={() => setHintsUsed((count) => count + 1)}
              />
            ))}
          </ul>

          {answeredCount === quiz.questions.length && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warm-border bg-card p-5">
              <div className="space-y-0.5">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <CheckIcon className="h-4 w-4 text-success" />
                  {t('archive.practice.score', { correct: correctCount, total: quiz.questions.length })}
                </p>
                {hintsUsed > 0 && <p className="text-xs text-muted">{t('archive.practice.hintsUsed', { count: hintsUsed })}</p>}
              </div>
              {mistakeIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleMistakesToCards}
                  className="ml-auto rounded-xl border-2 border-navy px-4 py-2 text-xs font-bold text-navy hover:bg-navy/5"
                >
                  {t('flashcards.mistakes.action', { count: mistakeIds.size })}
                </button>
              )}
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
              outputLanguage={meta.outputLanguage}
              otherAnswers={otherShortAnswers(quiz.questions, question.id)}
              onUpdate={(updater) => onQuestionUpdate(question.id, updater)}
              onDelete={() => onQuestionDelete(question.id)}
              onRegenerate={() => onQuestionRegenerate(question.id)}
              onGraded={recordFirstAttempt(question.id)}
            />
          ))}
        </ul>
      )}

      {!studyMode && supportedCount !== undefined && (
        <p data-print-hide data-testid="supported-note" className="rounded-[14px] border border-warm-border bg-card p-5 text-sm font-medium text-ink">
          {t('create.result.supportedNote', { count: supportedCount })}
        </p>
      )}

      {!studyMode && missingCount > 0 && onTopUp && (
        <div
          data-print-hide
          className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warm-border bg-card p-5"
        >
          <p className="text-sm font-medium text-ink">
            {t('create.result.incompleteNote', { created: quiz.questions.length, requested: quiz.questions.length + missingCount })}
          </p>
          <button
            type="button"
            onClick={onTopUp}
            disabled={isToppingUp}
            aria-busy={isToppingUp}
            className="shrink-0 rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isToppingUp ? t('create.result.creatingRest') : t('create.result.createRest')}
          </button>
        </div>
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
        <div className="hidden" data-print-only data-print-variant={printVariant}>
          <div className="print-header">
            <div className="print-header-row">
              <h1>{quiz.title}</h1>
              <span className="print-wordmark">{t('app.name')}</span>
            </div>
            <p className="print-meta">{printMetaLine}</p>
            <div className="print-rule" />
            {printVariant === 'questions' && (
              <div className="print-fields">
                <span className="print-field-line">{t('create.result.printNameLabel')}</span>
                <span className="print-field-line">{t('create.result.printClassLabel')}</span>
                <span className="print-field-line">{t('create.result.printDateLabel')}</span>
              </div>
            )}
          </div>

          <ol className="print-questions">
            {quiz.questions.map((question) => (
              <li key={question.id} className="print-question">
                <p className="print-q-text">{question.question}</p>

                {question.type === 'mcq' && (
                  <ul className={`print-options${fitsTwoColumns(question.options) ? ' print-options-2col' : ''}`}>
                    {question.options.map((option, optionIndex) => (
                      <li key={optionIndex}>
                        {letterFor(optionIndex)}) {option}
                      </li>
                    ))}
                  </ul>
                )}

                {question.type === 'true-false' && (
                  <div className="print-truefalse">
                    <span>
                      <PrintCheckbox />
                      {t('create.result.trueLabel')}
                    </span>
                    <span>
                      <PrintCheckbox />
                      {t('create.result.falseLabel')}
                    </span>
                  </div>
                )}

                {question.type === 'fill-blanks' && <PrintWritingLines count={1} width="45%" />}
                {question.type === 'short-answer' && <PrintWritingLines count={2} />}
                {question.type === 'open-ended' && <PrintWritingLines count={6} />}

                {question.type === 'matching' && (
                  <div className="print-matching">
                    <ol>
                      {question.pairs.map((pair, pairIndex) => (
                        <li key={pairIndex}>
                          <span className="print-matching-row">
                            <span>{pair.left}</span>
                            <span className="print-matching-line" />
                          </span>
                        </li>
                      ))}
                    </ol>
                    <ol className="print-matching-right">
                      {getRightOrder(question).map((pairIndex, position) => (
                        <li key={position}>{question.pairs[pairIndex].right}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {printVariant === 'with-answers' && (
            <div data-print-answer-key>
              <h2>{t('create.result.answerKeyTitle')}</h2>
              <ol>
                {quiz.questions.map((question) => (
                  <li key={question.id}>
                    {question.type === 'mcq' && withExplanation(letterFor(question.answerIndex), question.explanation)}
                    {question.type === 'true-false' &&
                      withExplanation(question.answerBool ? t('create.result.trueLabel') : t('create.result.falseLabel'), question.explanation)}
                    {question.type === 'matching' &&
                      withExplanation(
                        `${buildAnswerKeyLine(getRightOrder(question))} — ${question.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; ')}`,
                        question.explanation,
                      )}
                    {(question.type === 'fill-blanks' || question.type === 'short-answer') &&
                      withExplanation(question.answer, question.explanation)}
                    {question.type === 'open-ended' && withExplanation(getKeyPoints(question).join('; '), question.explanation)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
