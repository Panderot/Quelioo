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

/** Revised Bloom taxonomy (Anderson & Krathwohl, 2001): 1 Hatırlama … 6 Yaratma. */
export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6
export const BLOOM_LEVELS: BloomLevel[] = [1, 2, 3, 4, 5, 6]

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
  /** matching: extra right-column items that match no left item (distractors). */
  extras?: string[]
  /** matching: the right column is the pairs' rights followed by the extras; rightOrder[position] = index into that list. */
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
  /** The concept or skill the fact belongs to; worked applications of one formula share a concept (at most two questions per concept). */
  concept?: string
  /** Topic or learning outcome the question tests. */
  topic: string
  difficulty: ExamDifficulty
  /** Cognitive level (revised Bloom); undefined when the teacher has not set it ("Belirtilmedi"). Never printed on the student paper. */
  bloomLevel?: BloomLevel
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

export type ExamLevel = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'university' | 'other'

export const EXAM_LEVELS: ExamLevel[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'university', 'other']

/** Bloom setting of the setup screen: a mix that follows the grade, one level, or the three upper levels. */
export type BloomSetting = 'balanced' | '1' | '2' | '3' | '4' | '5' | '6' | 'higher'
export const BLOOM_SETTINGS: BloomSetting[] = ['balanced', '1', '2', '3', '4', '5', '6', 'higher']

/** "free": every question type; "meb": MEB ortak yazılı (only open-ended and short-answer, key and rubric forced on). */
export type ExamFormat = 'free' | 'meb'

/** One row of the teacher's own topic distribution (kazanım and its question count). */
export interface ExamDistributionRow {
  text: string
  count: number
}

export interface ExamSettings {
  header: ExamHeader
  /** Exam time in whole minutes (5 to 240); null hides the line on the paper. */
  durationMinutes: number | null
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
  /** "Konu ve Bloom tabloları": the topic distribution and specification tables in the answer key. */
  topicTable: boolean
  footer: boolean
  bloom: BloomSetting
  format: ExamFormat
  /** The teacher's own topic distribution (empty = the plan decides). */
  distribution: ExamDistributionRow[]
  /** What earlier exams from the same source used (never the text itself); lets the next exam avoid repeats. */
  sourceMemory?: SourceMemory
}

/** Fingerprint of the source an exam was made from, with what it already tested. */
export interface SourceMemory {
  /** Hash of the normalised source text. */
  hash: string
  /** MinHash signature of the text's word shingles (similar sources have similar signatures). */
  signature: number[]
  /** The facts the exam's questions tested. */
  facts: string[]
  /** The question forms used: "type:bloom". */
  forms: string[]
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

/** Is the exam time a usable number of minutes (5 to 240)? Empty (NaN) is allowed and hides the line. */
export const EXAM_MIN_MINUTES = 5
export const EXAM_MAX_MINUTES = 240

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
    bloom: 'balanced',
    format: 'free',
    distribution: [],
  }
}

export function totalQuestionCount(counts: Record<ExamQuestionType, number>): number {
  return EXAM_QUESTION_TYPES.reduce((sum, type) => sum + counts[type], 0)
}

export function totalPoints(questions: Pick<ExamQuestion, 'points'>[]): number {
  return questions.reduce((sum, question) => sum + question.points, 0)
}

/** A source needs about this many words for each question asked for; a shorter one cannot carry them without asking the same thing twice. */
export const EXAM_WORDS_PER_QUESTION = 20

/** How many different questions a source of `words` words can carry. */
export function maxQuestionsForWords(words: number): number {
  return Math.max(1, Math.floor(words / EXAM_WORDS_PER_QUESTION))
}
