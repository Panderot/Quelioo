import { useCallback, useEffect, useRef, useState } from 'react'

import { GenerateApiError, regenerateOneQuestion, topUpQuestions } from '../api/generateQuiz'
import type { GenerateErrorCode } from '../api/generateQuiz'
import { answerSummary } from '../lib/quiz'
import type { GeneratedQuiz, QuizQuestion } from '../lib/quiz'
import { shuffleQuizOptions, shuffleSingleQuestionOptions } from '../lib/shuffleOptions'

interface DeletedQuestionState {
  question: QuizQuestion
  index: number
}

interface UseQuizEditorParams {
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

export function useQuizEditor({
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
      persist({ ...current, questions: current.questions.map((question) => (question.id === id ? updater(question) : question)) })
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
        const otherQuestions = others.map((question) => ({ question: question.question, answer: answerSummary(question), type: question.type }))
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

  return {
    quiz,
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
