import { expect, test } from '@playwright/test'

import type { ArchiveEntry } from '../../src/lib/archiveSource'
import { DRAFT_MAX_AGE_MS, chooseVersion, clearAllDraftsFor, clearDraft, clearSetupDraft, purgeStaleDrafts, readDraft, readSetupDraft, writeDraft, writeSetupDraft } from '../../src/lib/exam/drafts'
import { blankQuestion, sanitizeExam } from '../../src/lib/exam/factory'
import { quizToExam } from '../../src/lib/exam/fromQuiz'
import { answerLetter, buildGroup, examSections } from '../../src/lib/exam/groups'
import { distributePoints, isTotalValid, scaleRubric, setQuestionPoints } from '../../src/lib/exam/points'
import { EXAM_QUESTION_TYPES, defaultExamHeader, defaultExamSettings, emptyCounts, totalPoints } from '../../src/lib/exam/types'
import type { ExamDifficulty, ExamQuestion, ExamQuestionType, WrittenExam } from '../../src/lib/exam/types'
import type { QuizQuestion } from '../../src/lib/quiz'

// Pure logic of the written exam (no browser).

const DIFFICULTIES: ExamDifficulty[] = ['easy', 'medium', 'hard']

function question(type: ExamQuestionType, index: number, difficulty: ExamDifficulty = 'medium'): ExamQuestion {
  const base = blankQuestion(type, `${type}-${index}`)
  const filled: ExamQuestion = { ...base, stem: `Question ${type} ${index}`, difficulty, answer: 'x' }
  if (type === 'mcq') return { ...filled, options: ['one', 'two', 'three', 'four'], answerIndex: index % 4 }
  if (type === 'matching') return { ...filled, pairs: [0, 1, 2, 3].map((i) => ({ left: `L${index}${i}`, right: `R${index}${i}` })) }
  if (type === 'open-ended') return { ...filled, rubric: [{ text: 'a', points: 2 }, { text: 'b', points: 1 }, { text: 'c', points: 1 }] }
  return filled
}

function makeQuestions(counts: Partial<Record<ExamQuestionType, number>>): ExamQuestion[] {
  const list: ExamQuestion[] = []
  for (const type of EXAM_QUESTION_TYPES) for (let i = 0; i < (counts[type] ?? 0); i += 1) list.push(question(type, i, DIFFICULTIES[i % 3]))
  return list
}

function makeExam(counts: Partial<Record<ExamQuestionType, number>>, id = 'exam-1'): WrittenExam {
  const questions = distributePoints(makeQuestions(counts))
  return { id, title: 'T', settings: defaultExamSettings(), questions, sourceQuizId: null, sourceText: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
}

test.describe('exam points', () => {
  test('always total exactly 100 in whole numbers, at least 1 each', () => {
    const mixes: Partial<Record<ExamQuestionType, number>>[] = [
      { mcq: 1 },
      { 'open-ended': 1 },
      { 'open-ended': 5, 'short-answer': 5, 'true-false': 5, mcq: 5 },
      { 'open-ended': 7, 'short-answer': 3, 'fill-blanks': 9, 'true-false': 11, mcq: 6, matching: 4 },
      { 'true-false': 20, mcq: 20 },
      { 'open-ended': 20, 'short-answer': 20 },
      { 'open-ended': 7, 'short-answer': 7, 'fill-blanks': 7, 'true-false': 7, mcq: 6, matching: 6 },
    ]
    for (const mix of mixes) {
      const result = distributePoints(makeQuestions(mix))
      expect(isTotalValid(result), JSON.stringify(mix)).toBe(true)
      expect(totalPoints(result)).toBe(100)
      expect(result.every((q) => Number.isInteger(q.points) && q.points >= 1)).toBe(true)
    }
    expect(distributePoints([])).toEqual([])
  })

  test('40 questions total 100; heavier types and harder questions get more', () => {
    const forty = distributePoints(makeQuestions({ 'open-ended': 7, 'short-answer': 7, 'fill-blanks': 7, 'true-false': 7, mcq: 6, matching: 6 }))
    expect(forty).toHaveLength(40)
    expect(totalPoints(forty)).toBe(100)
    const [open, tf] = distributePoints([question('open-ended', 0), question('true-false', 0)], 100)
    expect(open.points).toBeGreaterThan(tf.points)
    const [easy, hard] = distributePoints([question('mcq', 0, 'easy'), question('mcq', 1, 'hard')], 100)
    expect(hard.points).toBeGreaterThan(easy.points)
  })

  test('rubric points follow the question points', () => {
    const result = distributePoints(makeQuestions({ 'open-ended': 4, mcq: 3 }))
    for (const q of result.filter((item) => item.rubric.length > 0)) expect(q.rubric.reduce((sum, item) => sum + item.points, 0)).toBe(q.points)
    const changed = setQuestionPoints(result[0], 17)
    expect(changed.points).toBe(17)
    expect(changed.rubric.reduce((sum, item) => sum + item.points, 0)).toBe(17)
  })

  test('scaleRubric: largest remainder, whole numbers, every item at least 1 when points allow', () => {
    const rubric = [{ text: 'a', points: 1 }, { text: 'b', points: 1 }, { text: 'c', points: 1 }]
    expect(scaleRubric(rubric, 10).map((item) => item.points)).toEqual([4, 3, 3])
    expect(scaleRubric(rubric, 3).map((item) => item.points)).toEqual([1, 1, 1])
    expect(scaleRubric(rubric, 2).reduce((sum, item) => sum + item.points, 0)).toBe(2)
    expect(scaleRubric([{ text: 'a', points: 9 }, { text: 'b', points: 1 }], 2).map((item) => item.points)).toEqual([1, 1])
    const uneven = scaleRubric([{ text: 'a', points: 5 }, { text: 'b', points: 1 }, { text: 'c', points: 1 }], 12)
    expect(uneven.reduce((sum, item) => sum + item.points, 0)).toBe(12)
    expect(uneven.every((item) => item.points >= 1)).toBe(true)
    expect(scaleRubric([], 5)).toEqual([])
    expect(scaleRubric([{ text: 'a', points: 0 }, { text: 'b', points: 0 }], 4).map((item) => item.points)).toEqual([2, 2])
  })
})

test.describe('exam groups', () => {
  const exam = makeExam({ 'open-ended': 3, 'true-false': 4, mcq: 5, matching: 3 })

  test('A is the exam as is', () => {
    const a = buildGroup(exam, 'A')
    expect(a.map((q) => q.id)).toEqual(exam.questions.map((q) => q.id))
    expect(a.map((q) => q.number)).toEqual(a.map((_, i) => i + 1))
    expect(a.every((q) => q.number === q.aNumber)).toBe(true)
  })

  test('B reorders inside each run of a type, keeps points, and maps back to A numbers', () => {
    const a = buildGroup(exam, 'A')
    const b = buildGroup(exam, 'B')
    expect(b).toHaveLength(a.length)
    for (const section of examSections(exam.questions)) {
      const aRun = a.slice(section.start, section.end).map((q) => q.id)
      const bRun = b.slice(section.start, section.end).map((q) => q.id)
      expect([...bRun].sort()).toEqual([...aRun].sort())
      expect(bRun).not.toEqual(aRun)
    }
    for (const q of b) {
      const source = a[q.aNumber - 1]
      expect(source.id).toBe(q.id)
      expect(q.points).toBe(source.points)
      expect(q.rubric).toEqual(source.rubric)
    }
    expect(b.map((q) => q.number)).toEqual(b.map((_, i) => i + 1))
    expect(totalPoints(b)).toBe(100)
  })

  test('B shuffles options keeping the correct one, and the matching column consistently', () => {
    const a = buildGroup(exam, 'A')
    const b = buildGroup(exam, 'B')
    for (const q of b.filter((item) => item.type === 'mcq')) {
      const source = a[q.aNumber - 1]
      expect(q.options).not.toEqual(source.options)
      expect([...q.options!].sort()).toEqual([...source.options!].sort())
      expect(q.options![q.answerIndex!]).toBe(source.options![source.answerIndex!])
    }
    for (const q of b.filter((item) => item.type === 'matching')) {
      const source = a[q.aNumber - 1]
      expect([...q.rightOrder!].sort()).toEqual([0, 1, 2, 3])
      expect(q.rightOrder!.every((pairIndex, position) => pairIndex !== position)).toBe(true)
      expect(q.rightOrder).not.toEqual(source.rightOrder)
      expect(q.pairs).toEqual(source.pairs)
    }
  })

  test('deterministic, and a single-question run stays put', () => {
    expect(buildGroup(exam, 'B')).toEqual(buildGroup(exam, 'B'))
    expect(buildGroup({ ...exam, id: 'other' }, 'B').map((q) => q.id)).not.toEqual(buildGroup(exam, 'B').map((q) => q.id))
    const single = makeExam({ mcq: 1, 'true-false': 1 })
    expect(buildGroup(single, 'B').map((q) => q.id)).toEqual(single.questions.map((q) => q.id))
  })

  test('sections and letters', () => {
    const sections = examSections([{ type: 'mcq' }, { type: 'mcq' }, { type: 'matching' }, { type: 'mcq' }])
    expect(sections).toEqual([
      { type: 'mcq', start: 0, end: 2 },
      { type: 'matching', start: 2, end: 3 },
      { type: 'mcq', start: 3, end: 4 },
    ])
    expect([answerLetter(0), answerLetter(4)]).toEqual(['A', 'E'])
  })
})

test.describe('quiz to exam', () => {
  const quizQuestions: QuizQuestion[] = [
    { id: 'a', type: 'mcq', question: 'Q1', explanation: '', options: ['w', 'x', 'y', 'z'], answerIndex: 2 },
    { id: 'b', type: 'true-false', question: 'Q2', explanation: '', answerBool: false },
    { id: 'c', type: 'fill-blanks', question: 'Q3 ___', explanation: '', answer: 'ab', acceptableAnswers: ['abc'] },
    { id: 'd', type: 'short-answer', question: 'Q4', explanation: '', answer: 'short' },
    { id: 'e', type: 'matching', question: 'Q5', explanation: '', pairs: [{ left: '1', right: 'a' }, { left: '2', right: 'b' }, { left: '3', right: 'c' }] },
    { id: 'f', type: 'open-ended', question: 'Q6', explanation: '', answer: 'long', keyPoints: ['p1', 'p2'] },
    { id: 'g', type: 'open-ended', question: 'Q7', explanation: '', answer: 'long' },
  ]
  const entry: ArchiveEntry = {
    id: 'quiz-1',
    title: 'Hücre',
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'text',
    questionType: 'mixed',
    difficulty: 'hard',
    questionCount: '7',
    optionsCount: '4',
    sourceText: 'source text',
    quiz: { title: 'Hücre', questions: quizQuestions },
  }

  test('maps every question without any network call and totals 100', () => {
    const original = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('network call')
    }) as typeof fetch
    try {
      const exam = quizToExam(entry, defaultExamHeader())
      expect(exam.questions).toHaveLength(7)
      expect(totalPoints(exam.questions)).toBe(100)
      expect(exam.sourceQuizId).toBe('quiz-1')
      expect(exam.sourceText).toBe('source text')
      expect(exam.settings.counts.mcq).toBe(1)
      expect(exam.settings.counts['open-ended']).toBe(2)
      const [mcq, tf, fill, , matching, open, bare] = exam.questions
      expect(mcq.options![mcq.answerIndex!]).toBe('y')
      expect(tf.answerBool).toBe(false)
      expect(fill.acceptableAnswers).toEqual(['abc'])
      expect(matching.rightOrder).toHaveLength(3)
      expect(open.rubric.map((item) => item.text)).toEqual(['p1', 'p2'])
      expect(open.rubric.reduce((sum, item) => sum + item.points, 0)).toBe(open.points)
      expect(bare.rubric).toEqual([])
      expect(exam.questions.every((q) => q.difficulty === 'hard' && q.topic === 'Hücre')).toBe(true)
    } finally {
      globalThis.fetch = original
    }
  })
})

test.describe('exam drafts', () => {
  const store = new Map<string, string>()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  test.beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
          return store.size
        },
      },
    })
  })
  test.afterAll(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  })
  test.beforeEach(() => store.clear())

  const exam = makeExam({ mcq: 2 })
  const NOW = Date.UTC(2026, 5, 1)

  test('keyed by user and exam', () => {
    writeDraft('u1', exam, exam.updatedAt, NOW)
    expect(readDraft('u1', exam.id, NOW)?.exam.id).toBe(exam.id)
    expect(readDraft('u2', exam.id, NOW)).toBeNull()
    expect(readDraft('u1', 'other', NOW)).toBeNull()
    clearDraft('u1', exam.id)
    expect(readDraft('u1', exam.id, NOW)).toBeNull()
  })

  test('older than 7 days is dropped, also by the purge', () => {
    writeDraft('u1', exam, exam.updatedAt, NOW)
    expect(readDraft('u1', exam.id, NOW + DRAFT_MAX_AGE_MS - 1000)).not.toBeNull()
    expect(readDraft('u1', exam.id, NOW + DRAFT_MAX_AGE_MS + 1000)).toBeNull()
    expect(store.size).toBe(0)

    writeDraft('u1', exam, exam.updatedAt, NOW)
    writeSetupDraft('u1', 's1', { text: 'hello' }, NOW)
    writeDraft('u1', { ...exam, id: 'fresh' }, exam.updatedAt, NOW + DRAFT_MAX_AGE_MS)
    store.set('quelio.examDraft.v1.u1.junk', '{not json')
    purgeStaleDrafts('u1', NOW + DRAFT_MAX_AGE_MS + 1000)
    expect([...store.keys()]).toEqual(['quelio.examDraft.v1.u1.fresh'])
  })

  test('setup drafts are keyed per user and setup, and expire', () => {
    writeSetupDraft('u1', 's1', { text: 'hello' }, NOW)
    expect(readSetupDraft('u1', 's1', NOW)?.value).toEqual({ text: 'hello' })
    expect(readSetupDraft('u1', 's2', NOW)).toBeNull()
    expect(readSetupDraft('u2', 's1', NOW)).toBeNull()
    expect(readSetupDraft('u1', 's1', NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull()
    writeSetupDraft('u1', 's1', 1, NOW)
    clearSetupDraft('u1', 's1')
    expect(readSetupDraft('u1', 's1', NOW)).toBeNull()
  })

  test('clearAllDraftsFor removes one user or everyone', () => {
    writeDraft('u1', exam, exam.updatedAt, NOW)
    writeDraft('u2', exam, exam.updatedAt, NOW)
    writeSetupDraft('u1', 's', 1, NOW)
    clearAllDraftsFor('u1')
    expect(readDraft('u2', exam.id, NOW)).not.toBeNull()
    expect(store.size).toBe(1)
    clearAllDraftsFor()
    expect(store.size).toBe(0)
  })

  test('chooseVersion: server wins unless the draft is newer and different', () => {
    const server: WrittenExam = { ...exam, updatedAt: new Date(NOW).toISOString() }
    const edited: WrittenExam = { ...exam, title: 'edited' }
    const draftAt = (savedAt: number, e: WrittenExam) => ({ exam: e, baseUpdatedAt: exam.updatedAt, savedAt })
    expect(chooseVersion(null, server)).toBe('server')
    expect(chooseVersion(draftAt(NOW - 1000, edited), server)).toBe('server')
    expect(chooseVersion(draftAt(NOW + 1000, { ...server, updatedAt: 'x' }), server)).toBe('server')
    expect(chooseVersion(draftAt(NOW + 1000, edited), server)).toBe('ask')
    expect(chooseVersion(draftAt(NOW + 1000, edited), null)).toBe('draft')
  })
})

test.describe('sanitizeExam', () => {
  test('keeps a valid exam and rejects junk', () => {
    const exam = makeExam({ mcq: 2, matching: 1, 'true-false': 1 })
    expect(sanitizeExam(JSON.parse(JSON.stringify(exam)))).toEqual(exam)
    for (const junk of [null, 5, 'x', [], {}, { id: 'a' }, { id: 'a', questions: 'no' }, { id: '', questions: [] }, { id: 'a', questions: [{ type: 'nope' }] }, { id: 'a', questions: [{ type: 'mcq', options: ['only'] }] }]) {
      expect(sanitizeExam(junk), JSON.stringify(junk)).toBeNull()
    }
  })

  test('repairs bad fields', () => {
    const repaired = sanitizeExam({ id: 'a', questions: [{ type: 'matching', id: 'm', pairs: [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }], rightOrder: [0, 0], points: 'many', difficulty: 'wild' }], settings: { counts: { mcq: 99 }, level: 'x' } })
    expect(repaired).not.toBeNull()
    expect(repaired!.questions[0].rightOrder).toEqual([1, 0])
    expect(repaired!.questions[0].points).toBe(0)
    expect(repaired!.questions[0].difficulty).toBe('medium')
    expect(repaired!.settings.counts.mcq).toBe(20)
    expect(repaired!.settings.level).toBe('9')
    expect(emptyCounts().mcq).toBe(0)
  })
})
