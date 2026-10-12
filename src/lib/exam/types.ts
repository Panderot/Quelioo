import type { QuizQuestionType } from '../quiz.js'

/** Written exam ("Yazılı Sınav"): a printable school paper made from a teacher's own material. */

export type ExamQuestionType = QuizQuestionType

/** Order types appear in the creation form, the counts table and (by default) the paper. */
export const EXAM_QUESTION_TYPES: ExamQuestionType[] = ['open-ended', 'short-answer', 'fill-blanks', 'true-false', 'mcq', 'matching']

export type ExamDifficulty = 'easy' | 'medium' | 'hard'

export const MAX_EXAM_QUESTIONS = 40
export const MAX_EXAM_TYPE_QUESTIONS = 20
export const EXAM_TOTAL_POINTS = 100

/** One grading criterion; the items of a question add up to the question's points. */
export interface ExamRubricItem {
  text: string
  points: number
}

export interface ExamPair {
  left: string
  right: string
}

/** Question text may hold LaTeX between $...$ (rendered with KaTeX on screen, as Word equations in .docx). */
export interface ExamQuestion {
  id: string
  type: ExamQuestionType
  /** The question (for fill-blanks the sentence with "___" for the blank). */
  stem: string
  /** Short real-life scenario shown before the stem (context-based question). */
  context?: string
  /** mcq */
  options?: string[]
  answerIndex?: number
  /** true-false */
  answerBool?: boolean
  /** matching: pair i is left[i] ↔ right[i]; rightOrder[position] = index of the pair shown at that position of the right column */
  pairs?: ExamPair[]
  rightOrder?: number[]
  /** Expected answer (fill-blanks, short-answer, open-ended). For the other types a readable summary. */
  answer: string
  /** Other accepted answers (fill-blanks, short-answer). */
  acceptableAnswers?: string[]
  /** Grading criteria; points add up to `points`. */
  rubric: ExamRubricItem[]
  points: number
  /** The one fact of the source this question tests (kept for the quality checks; never shown on the paper). */
  fact?: string
  /** Topic or learning outcome the question tests. */
  topic: string
  difficulty: ExamDifficulty
  /** Ruled answer lines (open-ended, short-answer). */
  lines: number
}

export interface ExamHeader {
  school: string
  /** "2026-2027" */
  academicYear: string
  term: 1 | 2
  examNo: 1 | 2 | 3
  course: string
  /** "9", "10", "Hazırlık" … */
  grade: string
  section: string
  teacher: string
}

export type ExamLevel = '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'university' | 'other'

export const EXAM_LEVELS: ExamLevel[] = ['5', '6', '7', '8', '9', '10', '11', '12', 'university', 'other']

export interface ExamSettings {
  header: ExamHeader
  durationMinutes: number
  level: ExamLevel
  /** Number of questions per type (0 hides the type). */
  counts: Record<ExamQuestionType, number>
  /** 4 or 5 options for multiple choice. */
  optionsCount: 4 | 5
  /** Share of easy / medium / hard questions, percent, adds up to 100. */
  difficultyMix: Record<ExamDifficulty, number>
  contextBased: boolean
  /** Output language code (see src/data/outputLanguages.ts), "auto" follows the source. */
  outputLanguage: string
  /** Topics / learning outcomes the questions must cover, one per entry. */
  topics: string[]
  answerKey: boolean
  groups: boolean
  topicTable: boolean
  footer: boolean
}

export interface WrittenExam {
  id: string
  title: string
  settings: ExamSettings
  questions: ExamQuestion[]
  /** Archive quiz this exam was made from (no AI), or null. */
  sourceQuizId: string | null
  /** Text the questions came from, kept for "regenerate this question". */
  sourceText: string
  createdAt: string
  /** Server timestamp of the last save; the guard against saving over a newer copy from another tab. */
  updatedAt: string
}

/** A question as placed on a printed paper of one group. */
export interface PaperQuestion extends ExamQuestion {
  /** Number on this paper (1-based). */
  number: number
  /** Number the same question has on paper A. */
  aNumber: number
}

export type ExamGroup = 'A' | 'B'

export function emptyCounts(): Record<ExamQuestionType, number> {
  return { 'open-ended': 0, 'short-answer': 0, 'fill-blanks': 0, 'true-false': 0, mcq: 0, matching: 0 }
}

export function currentAcademicYear(now = new Date()): string {
  const year = now.getFullYear()
  const start = now.getMonth() >= 8 ? year : year - 1 // the school year starts in September
  return `${start}-${start + 1}`
}

export function defaultExamHeader(now = new Date()): ExamHeader {
  return { school: '', academicYear: currentAcademicYear(now), term: 1, examNo: 1, course: '', grade: '9', section: '', teacher: '' }
}

export function defaultExamSettings(now = new Date()): ExamSettings {
  return {
    header: defaultExamHeader(now),
    durationMinutes: 40,
    level: '9',
    counts: { ...emptyCounts(), 'open-ended': 5, 'short-answer': 5, 'true-false': 5, mcq: 5 },
    optionsCount: 4,
    difficultyMix: { easy: 30, medium: 50, hard: 20 },
    contextBased: true,
    outputLanguage: 'auto',
    topics: [],
    answerKey: true,
    groups: false,
    topicTable: true,
    footer: true,
  }
}

export function totalQuestionCount(counts: Record<ExamQuestionType, number>): number {
  return EXAM_QUESTION_TYPES.reduce((sum, type) => sum + counts[type], 0)
}

export function totalPoints(questions: Pick<ExamQuestion, 'points'>[]): number {
  return questions.reduce((sum, question) => sum + question.points, 0)
}
