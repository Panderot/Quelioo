import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GenerateApiError, coverMissingFacts, generateQuiz, missingPayloadEntries, otherQuestionOf, regenerateOneQuestion, topUpQuestions } from '../api/generateQuiz'
import type { GenerateErrorCode } from '../api/generateQuiz'
import { addArchiveEntry, createArchiveEntryId, getArchiveEntry, sourceTextHash } from '../lib/archive'
import { MAX_QUESTION_COUNT, missingEntries, slotsNeededFor } from '../lib/factCoverage'
import type { GeneratedQuiz, QuizQuestion } from '../lib/quiz'
import type { QuestionType } from '../lib/quizTypes'
import { shuffleQuizOptions, shuffleSingleQuestionOptions } from '../lib/shuffleOptions'

interface DeletedQuestionState {
  question: QuizQuestion
  index: number
}

interface UseQuizEditorParams {
  /** The quiz's Archive entry id (a follow-up quiz copies its settings). */
  quizId: string
  initialQuiz: GeneratedQuiz
  sourceText: string
  questionType: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  requestedCount: number
  incomplete: boolean
  onPersist: (quiz: GeneratedQuiz) => void
  includeExplanations?: boolean
  shuffleOptions?: boolean
  includeHints?: boolean
  focusSnippets?: string[]
}

const UNDO_WINDOW_MS = 6000

/** "{title} · 2", then "· 3" for a follow-up of a follow-up. */
export function followUpTitle(title: string): string {
  const match = /^(.*) · (\d+)$/.exec(title)
  return match ? `${match[1]} · ${Number(match[2]) + 1}` : `${title} · 2`
}

export function useQuizEditor({
  quizId,
  initialQuiz,
  sourceText,
  questionType,
  difficulty,
  optionsCount,
  outputLanguage,
  requestedCount,
  incomplete,
  onPersist,
  includeExplanations = true,
  shuffleOptions = false,
  includeHints = true,
  focusSnippets = [],
}: UseQuizEditorParams) {
  const [quiz, setQuiz] = useState(initialQuiz)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [regenerateError, setRegenerateError] = useState<GenerateErrorCode | null>(null)
  const [deleted, setDeleted] = useState<DeletedQuestionState | null>(null)
  const [missingCount, setMissingCount] = useState(incomplete ? Math.max(0, requestedCount - initialQuiz.questions.length) : 0)
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [topUpError, setTopUpError] = useState<GenerateErrorCode | null>(null)
  const [isAddingMissing, setIsAddingMissing] = useState(false)
  const [addMissingError, setAddMissingError] = useState<GenerateErrorCode | null>(null)
  const navigate = useNavigate()
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Read the latest quiz without adding it as a dependency everywhere — every mutator below
  // computes its next state from this ref and commits with a single plain setQuiz/onPersist
  // call (never a functional updater with side effects, which React 19 StrictMode
  // double-invokes in development and would otherwise apply the mutation twice).
  const quizRef = useRef(quiz)
  useEffect(() => {
    quizRef.current = quiz
  }, [quiz])

  useEffect(
    () => () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    },
    [],
  )

  const persist = useCallback(
    (next: GeneratedQuiz) => {
      setQuiz(next)
      onPersist(next)
    },
    [onPersist],
  )

  const updateTitle = useCallback(
    (title: string) => {
      persist({ ...quizRef.current, title })
    },
    [persist],
  )

  const updateQuestion = useCallback(
    (id: string, updater: (question: QuizQuestion) => QuizQuestion) => {
      const current = quizRef.current
      // An edited question keeps its facts (counted as covered, no longer verifiable).
      persist({ ...current, questions: current.questions.map((question) => (question.id === id ? { ...updater(question), edited: true } : question)) })
    },
    [persist],
  )

  const deleteQuestion = useCallback(
    (id: string) => {
      const current = quizRef.current
      const index = current.questions.findIndex((question) => question.id === id)
      if (index === -1) return
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
      setDeleted({ question: current.questions[index], index })
      undoTimeoutRef.current = setTimeout(() => setDeleted(null), UNDO_WINDOW_MS)
      persist({ ...current, questions: current.questions.filter((question) => question.id !== id) })
    },
    [persist],
  )

  const undoDelete = useCallback(() => {
    if (!deleted) return
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    const current = quizRef.current
    const questions = [...current.questions]
    questions.splice(Math.min(deleted.index, questions.length), 0, deleted.question)
    persist({ ...current, questions })
    setDeleted(null)
  }, [deleted, persist])

  const regenerateQuestion = useCallback(
    async (id: string) => {
      const current = quizRef.current
      const target = current.questions.find((question) => question.id === id)
      if (!target) return
      setRegeneratingId(id)
      setRegenerateError(null)
      try {
        const others = current.questions.filter((question) => question.id !== id)
        const avoidQuestions = others.map((question) => question.question)
        const otherQuestions = others.map(otherQuestionOf)
        const factIds = current.coverage && target.factIds && target.factIds.length > 0 ? target.factIds : undefined
        const result = await regenerateOneQuestion({
          text: sourceText,
          questionType: target.type,
          difficulty,
          optionsCount,
          outputLanguage,
          avoidQuestions,
          otherQuestions,
          includeExplanations,
          includeHints,
          focusSnippets,
          ...(factIds
            ? { factIds, factItems: target.factItems, plan: current.coverage!.facts.filter((fact) => factIds.includes(fact.id)) }
            : {}),
        })
        const nextQuestion = shuffleOptions ? shuffleSingleQuestionOptions(result.question) : result.question
        const latest = quizRef.current
        persist({ ...latest, questions: latest.questions.map((question) => (question.id === id ? nextQuestion : question)) })
      } catch (error) {
        setRegenerateError(error instanceof GenerateApiError ? error.code : 'upstream')
      } finally {
        setRegeneratingId(null)
      }
    },
    [sourceText, difficulty, optionsCount, outputLanguage, persist, includeExplanations, includeHints, focusSnippets, shuffleOptions],
  )

  const topUp = useCallback(async () => {
    if (missingCount <= 0) return
    setIsToppingUp(true)
    setTopUpError(null)
    try {
      const current = quizRef.current
      const avoidQuestions = current.questions.slice(-30).map((question) => question.question)
      const result = await topUpQuestions({
        text: sourceText,
        questionType,
        questionCount: String(missingCount),
        difficulty,
        optionsCount,
        outputLanguage,
        avoidQuestions,
        includeExplanations,
        includeHints,
        focusSnippets,
      })
      const newQuestions = shuffleOptions ? shuffleQuizOptions(result.questions) : result.questions
      const latest = quizRef.current
      persist({ ...latest, questions: [...latest.questions, ...newQuestions] })
      setMissingCount((count) => Math.max(0, count - result.questions.length))
    } catch (error) {
      setTopUpError(error instanceof GenerateApiError ? error.code : 'upstream')
    } finally {
      setIsToppingUp(false)
    }
  }, [missingCount, sourceText, questionType, difficulty, optionsCount, outputLanguage, persist, includeExplanations, includeHints, focusSnippets, shuffleOptions])

  /**
   * "Add questions for missing facts": the questions the missing facts need, in the quiz's type and
   * difficulty, appended. When the maximum count has no room for them, a new quiz over the remaining
   * facts is saved as its own Archive entry ("{title} · 2") and opened instead.
   */
  const addMissing = useCallback(async () => {
    const current = quizRef.current
    if (!current.coverage) return
    const missing = missingEntries(current.coverage, current.questions)
    if (missing.length === 0) return
    setIsAddingMissing(true)
    setAddMissingError(null)
    const common = {
      text: sourceText,
      questionType,
      difficulty,
      optionsCount,
      outputLanguage,
      avoidQuestions: current.questions.slice(-30).map((question) => question.question),
      includeExplanations,
      includeHints,
      focusSnippets,
    }
    try {
      if (current.questions.length + slotsNeededFor(missing, questionType as QuestionType) <= MAX_QUESTION_COUNT) {
        const result = await coverMissingFacts({
          ...common,
          otherQuestions: current.questions.map(otherQuestionOf),
          existingCount: current.questions.length,
          plan: current.coverage.facts,
          missing: missingPayloadEntries(missing),
        })
        const added = shuffleOptions ? shuffleQuizOptions(result.questions) : result.questions
        const reworded = new Map(result.replaced.map((question) => [question.id, shuffleOptions ? shuffleSingleQuestionOptions(question) : question]))
        const latest = quizRef.current
        persist({ ...latest, questions: [...latest.questions.map((question) => (question.edited ? question : (reworded.get(question.id) ?? question))), ...added] })
        return
      }
      const generated = await generateQuiz({
        ...common,
        questionCount: 'auto',
        shuffleOptions,
        plan: current.coverage.facts,
        onlyFactIds: missing.map((entry) => entry.fact.id),
      })
      const title = followUpTitle(current.title)
      const questions = shuffleOptions ? shuffleQuizOptions(generated.questions) : generated.questions
      const entry = getArchiveEntry(quizId)
      const id = createArchiveEntryId()
      addArchiveEntry({
        id,
        title,
        createdAt: new Date().toISOString(),
        source: entry?.source ?? 'text',
        questionType,
        difficulty,
        questionCount: 'auto',
        optionsCount: optionsCount ?? null,
        outputLanguage,
        sourceText,
        quiz: { title, questions, ...(generated.coverage ? { coverage: generated.coverage } : {}) },
        includeExplanations,
        shuffleOptions,
        includeHints,
        focusPartsCount: entry?.focusPartsCount ?? focusSnippets.length,
        sourceHash: entry?.sourceHash ?? sourceTextHash(sourceText),
        coverageScope: 'part',
      })
      navigate(`/archive/${id}`)
    } catch (error) {
      setAddMissingError(error instanceof GenerateApiError ? error.code : 'upstream')
    } finally {
      setIsAddingMissing(false)
    }
  }, [quizId, sourceText, questionType, difficulty, optionsCount, outputLanguage, includeExplanations, includeHints, focusSnippets, shuffleOptions, persist, navigate])

  return {
    quiz,
    addMissing,
    isAddingMissing,
    addMissingError,
    updateTitle,
    updateQuestion,
    deleteQuestion,
    deleted,
    undoDelete,
    regeneratingId,
    regenerateError,
    regenerateQuestion,
    missingCount,
    isToppingUp,
    topUpError,
    topUp,
  }
}
