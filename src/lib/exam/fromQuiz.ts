import type { ArchiveEntry } from '../archiveSource'
import { getKeyPoints } from '../quiz'
import type { QuizQuestion } from '../quiz'
import { getRightOrder } from '../matching'
import { newExamId } from './factory'
import { distributePoints } from './points'
import { defaultExamSettings, emptyCounts } from './types'
import type { ExamDifficulty, ExamHeader, ExamQuestion, WrittenExam } from './types'

function difficultyOf(value: string): ExamDifficulty {
  return value === 'easy' || value === 'hard' ? value : 'medium'
}

function toExamQuestion(question: QuizQuestion, topic: string, difficulty: ExamDifficulty): ExamQuestion {
  const base = { id: question.id, stem: question.question, rubric: [], points: 0, topic, difficulty, lines: 0 }
  switch (question.type) {
    case 'mcq':
      return { ...base, type: 'mcq', options: [...question.options], answerIndex: question.answerIndex, answer: question.options[question.answerIndex] ?? '' }
    case 'true-false':
      return { ...base, type: 'true-false', answerBool: question.answerBool, answer: question.answerBool ? 'Doğru' : 'Yanlış' }
    case 'fill-blanks':
      return { ...base, type: 'fill-blanks', answer: question.answer, ...(question.acceptableAnswers?.length ? { acceptableAnswers: [...question.acceptableAnswers] } : {}) }
    case 'short-answer':
      return {
        ...base,
        type: 'short-answer',
        lines: 2,
        answer: question.answer,
        rubric: [{ text: question.answer, points: 1 }],
        ...(question.acceptableAnswers?.length ? { acceptableAnswers: [...question.acceptableAnswers] } : {}),
      }
    case 'matching':
      return {
        ...base,
        type: 'matching',
        pairs: question.pairs.map((pair) => ({ ...pair })),
        rightOrder: [...getRightOrder(question)],
        answer: question.pairs.map((pair) => `${pair.left} = ${pair.right}`).join('; '),
      }
    case 'open-ended': {
      // Without key points the rubric stays empty: the editor offers to generate one.
      const rubric = question.keyPoints && question.keyPoints.length > 0 ? getKeyPoints(question).map((text) => ({ text, points: 1 })) : []
      return { ...base, type: 'open-ended', lines: 5, answer: question.answer, rubric }
    }
  }
}

/** An exam made from the questions of an Archive quiz — no AI call. Points are spread automatically. */
export function quizToExam(entry: ArchiveEntry, defaults: ExamHeader, now = new Date()): WrittenExam {
  const difficulty = difficultyOf(entry.difficulty)
  const questions = distributePoints(entry.quiz.questions.map((question) => toExamQuestion(question, entry.title, difficulty)))
  const counts = emptyCounts()
  for (const question of questions) counts[question.type] += 1
  const settings = defaultExamSettings(now)
  settings.header = { ...defaults }
  settings.counts = counts
  settings.optionsCount = questions.some((question) => question.type === 'mcq' && (question.options?.length ?? 0) >= 5) ? 5 : 4
  settings.level = 'other'
  settings.contextBased = false
  settings.outputLanguage = entry.outputLanguage ?? 'auto'
  const stamp = now.toISOString()
  return {
    id: newExamId(),
    title: entry.title,
    settings,
    questions,
    sourceQuizId: entry.id,
    sourceText: entry.sourceText ?? '',
    createdAt: stamp,
    updatedAt: stamp,
  }
}
