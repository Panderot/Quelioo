import { computeDerangement } from '../matching'
import { EXAM_LEVELS, EXAM_QUESTION_TYPES, defaultExamSettings } from './types'
import type { ExamDifficulty, ExamHeader, ExamPair, ExamQuestion, ExamQuestionType, ExamRubricItem, ExamSettings, WrittenExam } from './types'

/** A new id for an exam: a UUID, which is what the `written_exams` table stores. */
export function newExamId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function newQuestionId(): string {
  return `q-${newExamId().slice(0, 8)}`
}

const DEFAULT_LINES: Record<ExamQuestionType, number> = { 'open-ended': 5, 'short-answer': 2, 'fill-blanks': 0, 'true-false': 0, mcq: 0, matching: 0 }

/** An empty question of a type, ready for the teacher to fill in. */
export function blankQuestion(type: ExamQuestionType, id: string = newQuestionId()): ExamQuestion {
  const base: ExamQuestion = { id, type, stem: '', answer: '', rubric: [], points: 0, topic: '', difficulty: 'medium', lines: DEFAULT_LINES[type] }
  if (type === 'mcq') return { ...base, options: ['', '', '', ''], answerIndex: 0 }
  if (type === 'true-false') return { ...base, answerBool: true }
  if (type === 'matching') {
    const pairs: ExamPair[] = Array.from({ length: 4 }, () => ({ left: '', right: '' }))
    return { ...base, pairs, rightOrder: computeDerangement(pairs.length, id) }
  }
  return base
}

export function defaultTitle(header: Pick<ExamHeader, 'course' | 'grade' | 'term' | 'examNo'>): string {
  const parts = [header.course.trim(), header.grade.trim() ? `${header.grade.trim()}. sınıf` : '', `${header.term}. dönem ${header.examNo}. yazılı`]
  return parts.filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------------------
// Defensive parsing (jsonb from the server, localStorage): anything malformed is repaired or dropped.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

function int(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
}

function strings(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, max) : []
}

const DIFFICULTIES = new Set<string>(['easy', 'medium', 'hard'])

function sanitizeRubric(value: unknown): ExamRubricItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((item) => ({ text: str(item.text), points: int(item.points, 0, 0, 100) }))
    .slice(0, 12)
}

export function sanitizeQuestion(raw: unknown): ExamQuestion | null {
  if (!isRecord(raw)) return null
  const type = raw.type as ExamQuestionType
  if (!EXAM_QUESTION_TYPES.includes(type)) return null
  const id = str(raw.id) || newQuestionId()
  const question: ExamQuestion = {
    id,
    type,
    stem: str(raw.stem),
    answer: str(raw.answer),
    rubric: sanitizeRubric(raw.rubric),
    points: int(raw.points, 0, 0, 100),
    topic: str(raw.topic),
    difficulty: DIFFICULTIES.has(str(raw.difficulty)) ? (raw.difficulty as ExamDifficulty) : 'medium',
    lines: int(raw.lines, DEFAULT_LINES[type], 0, 20),
  }
  if (typeof raw.context === 'string' && raw.context.trim()) question.context = raw.context
  if (typeof raw.fact === 'string' && raw.fact.trim()) question.fact = raw.fact.trim().slice(0, 400)
  const acceptable = strings(raw.acceptableAnswers, 8)
  if (acceptable.length > 0) question.acceptableAnswers = acceptable
  if (type === 'mcq') {
    const options = strings(raw.options, 5)
    if (options.length < 2) return null
    question.options = options
    question.answerIndex = int(raw.answerIndex, 0, 0, options.length - 1)
  } else if (type === 'true-false') {
    question.answerBool = raw.answerBool === true
  } else if (type === 'matching') {
    const pairs = Array.isArray(raw.pairs)
      ? raw.pairs
          .filter(isRecord)
          .map((pair) => ({ left: str(pair.left), right: str(pair.right) }))
          .slice(0, 10)
      : []
    if (pairs.length < 2) return null
    question.pairs = pairs
    const order = Array.isArray(raw.rightOrder) ? raw.rightOrder : []
    const valid = order.length === pairs.length && new Set(order).size === pairs.length && order.every((v) => Number.isInteger(v) && v >= 0 && v < pairs.length)
    question.rightOrder = valid ? (order as number[]) : computeDerangement(pairs.length, id)
  }
  return question
}

function sanitizeHeader(raw: unknown, base: ExamHeader): ExamHeader {
  const source = isRecord(raw) ? raw : {}
  return {
    school: str(source.school, base.school).slice(0, 200),
    academicYear: str(source.academicYear, base.academicYear).slice(0, 20),
    term: source.term === 2 ? 2 : 1,
    examNo: source.examNo === 2 || source.examNo === 3 ? source.examNo : 1,
    course: str(source.course, base.course).slice(0, 120),
    grade: str(source.grade, base.grade).slice(0, 40),
    section: str(source.section, base.section).slice(0, 40),
    teacher: str(source.teacher, base.teacher).slice(0, 120),
  }
}

export function sanitizeHeaderDefaults(raw: unknown): ExamHeader {
  return sanitizeHeader(raw, defaultExamSettings().header)
}

function sanitizeSettings(raw: unknown): ExamSettings {
  const base = defaultExamSettings()
  const source = isRecord(raw) ? raw : {}
  const counts = { ...base.counts }
  const rawCounts = isRecord(source.counts) ? source.counts : {}
  for (const type of EXAM_QUESTION_TYPES) counts[type] = int(rawCounts[type], 0, 0, 20)
  const mix = isRecord(source.difficultyMix) ? source.difficultyMix : {}
  const difficultyMix = { easy: int(mix.easy, 30, 0, 100), medium: int(mix.medium, 50, 0, 100), hard: int(mix.hard, 20, 0, 100) }
  const flag = (key: 'contextBased' | 'answerKey' | 'groups' | 'topicTable' | 'footer') => (typeof source[key] === 'boolean' ? (source[key] as boolean) : base[key])
  return {
    header: sanitizeHeader(source.header, base.header),
    durationMinutes: int(source.durationMinutes, base.durationMinutes, 5, 600),
    level: EXAM_LEVELS.includes(source.level as never) ? (source.level as ExamSettings['level']) : base.level,
    counts,
    optionsCount: source.optionsCount === 5 ? 5 : 4,
    difficultyMix,
    contextBased: flag('contextBased'),
    outputLanguage: str(source.outputLanguage, 'auto').slice(0, 40) || 'auto',
    topics: strings(source.topics, 40).map((topic) => topic.slice(0, 300)),
    answerKey: flag('answerKey'),
    groups: flag('groups'),
    topicTable: flag('topicTable'),
    footer: flag('footer'),
  }
}

/** A stored exam (jsonb row or localStorage) as a valid WrittenExam, or null when it is not one. */
export function sanitizeExam(raw: unknown): WrittenExam | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (!id || !Array.isArray(raw.questions)) return null
  const questions = raw.questions.map(sanitizeQuestion).filter((question): question is ExamQuestion => question !== null)
  if (questions.length !== raw.questions.length) return null
  return {
    id,
    title: str(raw.title).slice(0, 300),
    settings: sanitizeSettings(raw.settings),
    questions,
    sourceQuizId: typeof raw.sourceQuizId === 'string' && raw.sourceQuizId ? raw.sourceQuizId : null,
    sourceText: str(raw.sourceText),
    createdAt: str(raw.createdAt) || new Date(0).toISOString(),
    updatedAt: str(raw.updatedAt) || new Date(0).toISOString(),
  }
}
