import { computeDerangement } from '../matching'
import { BLOOM_SETTINGS, EXAM_LEVELS, EXAM_QUESTION_TYPES, defaultExamSettings } from './types'
import type { BloomLevel, BloomSetting, ExamDifficulty, ExamDistributionRow, ExamFormat, ExamHeader, ExamLevel, ExamPair, ExamQuestion, ExamQuestionType, ExamRubricItem, ExamSettings, SourceMemory, WrittenExam } from './types'

/** A shuffle of a matching question's right column (the pairs' rights, then the extras): no item sits at its own index, so a pair is never opposite its own match. */
export function computeRightOrder(pairCount: number, extraCount: number, seed: string): number[] {
  return computeDerangement(pairCount + extraCount, seed)
}

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
  // The correct option and the true / false answer start unset: the teacher has to choose, and the export check says so while they are not.
  if (type === 'mcq') return { ...base, options: ['', '', '', ''] }
  if (type === 'true-false') return base
  if (type === 'matching') {
    const pairs: ExamPair[] = Array.from({ length: 4 }, () => ({ left: '', right: '' }))
    const extras = ['', '']
    return { ...base, pairs, extras, rightOrder: computeRightOrder(pairs.length, extras.length, id) }
  }
  return base
}

/** The default name of an exam: only the parts that are filled in, joined by single spaces. */
export function defaultTitle(header: Pick<ExamHeader, 'course' | 'grade' | 'term' | 'examNo'>): string {
  const grade = header.grade.trim().replace(/[.]+$/, '')
  const parts = [header.course.trim(), grade ? (/^\d+$/.test(grade) ? `${grade}. sınıf` : grade) : '', `${header.term}. dönem ${header.examNo}. yazılı`]
  return parts.filter(Boolean).join(' · ').replace(/\s+/g, ' ')
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
  const bloom = typeof raw.bloomLevel === 'number' ? Math.round(raw.bloomLevel) : 0
  if (bloom >= 1 && bloom <= 6) question.bloomLevel = bloom as BloomLevel
  if (typeof raw.context === 'string' && raw.context.trim()) question.context = raw.context
  if (typeof raw.fact === 'string' && raw.fact.trim()) question.fact = raw.fact.trim().slice(0, 400)
  if (typeof raw.concept === 'string' && raw.concept.trim()) question.concept = raw.concept.trim().slice(0, 120)
  const acceptable = strings(raw.acceptableAnswers, 8)
  if (acceptable.length > 0) question.acceptableAnswers = acceptable
  if (type === 'mcq') {
    const options = strings(raw.options, 5)
    if (options.length < 2) return null
    question.options = options
    if (typeof raw.answerIndex === 'number') question.answerIndex = int(raw.answerIndex, 0, 0, options.length - 1)
  } else if (type === 'true-false') {
    if (typeof raw.answerBool === 'boolean') question.answerBool = raw.answerBool
  } else if (type === 'matching') {
    const pairs = Array.isArray(raw.pairs)
      ? raw.pairs
          .filter(isRecord)
          .map((pair) => ({ left: str(pair.left), right: str(pair.right) }))
          .slice(0, 10)
      : []
    if (pairs.length < 2) return null
    question.pairs = pairs
    const extras = strings(raw.extras, 4)
    if (extras.length > 0) question.extras = extras
    const size = pairs.length + extras.length
    const order = Array.isArray(raw.rightOrder) ? raw.rightOrder : []
    const valid = order.length === size && new Set(order).size === size && order.every((v) => Number.isInteger(v) && v >= 0 && v < size)
    question.rightOrder = valid ? (order as number[]) : extras.length > 0 ? computeRightOrder(pairs.length, extras.length, id) : computeDerangement(pairs.length, id)
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

/** The settings with a new header: the level (AI depth and Bloom mix) follows the grade the teacher picked. */
export function settingsWithHeader(settings: ExamSettings, header: ExamHeader): ExamSettings {
  const level = levelFromGrade(header.grade) ?? (header.grade.trim() ? 'other' : settings.level)
  return { ...settings, header, level }
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
  const header = sanitizeHeader(source.header, base.header)
  const storedLevel = EXAM_LEVELS.includes(source.level as never) ? (source.level as ExamLevel) : null
  // Older exams hold a grade in the header and a level beside it: the grade (when it is a school grade) is the one field, the level follows it.
  const level = levelFromGrade(header.grade) ?? storedLevel ?? base.level
  const rawBloom = typeof source.bloom === 'string' && BLOOM_SETTINGS.includes(source.bloom as BloomSetting) ? (source.bloom as BloomSetting) : base.bloom
  const format: ExamFormat = source.format === 'meb' ? 'meb' : 'free'
  const distribution: ExamDistributionRow[] = Array.isArray(source.distribution)
    ? source.distribution
        .filter(isRecord)
        .map((row) => ({ text: str(row.text).slice(0, 300), count: int(row.count, 0, 0, 40) }))
        .slice(0, 30)
    : []
  return {
    header: storedLevel && !header.grade.trim() && /^\d+$/.test(storedLevel) ? { ...header, grade: storedLevel } : header,
    durationMinutes: source.durationMinutes === null ? null : int(source.durationMinutes, base.durationMinutes ?? 40, 5, 240),
    level,
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
    bloom: rawBloom,
    format,
    distribution,
    ...(sanitizeMemory(source.sourceMemory) ? { sourceMemory: sanitizeMemory(source.sourceMemory) as SourceMemory } : {}),
  }
}

/** The school grade a header's grade text names ("9", "9.", "9. sınıf"), as an exam level; null for anything else. */
export function levelFromGrade(grade: string): ExamLevel | null {
  const digits = /^\s*(\d{1,2})\s*\.?\s*(?:sınıf\w*)?\s*$/iu.exec(grade)?.[1]
  if (digits && EXAM_LEVELS.includes(digits as ExamLevel)) return digits as ExamLevel
  if (/üniversite|university|համալսարան/iu.test(grade)) return 'university'
  return null
}

export function sanitizeMemory(raw: unknown): SourceMemory | null {
  if (!isRecord(raw) || typeof raw.hash !== 'string' || !raw.hash) return null
  const signature = Array.isArray(raw.signature) ? raw.signature.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).slice(0, 64) : []
  return { hash: raw.hash.slice(0, 80), signature, facts: strings(raw.facts, 80).map((fact) => fact.slice(0, 300)), forms: strings(raw.forms, 80).map((form) => form.slice(0, 40)) }
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
