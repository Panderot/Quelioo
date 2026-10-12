import { expect, test } from '@playwright/test'

import { moveItem, withExtras, withPairs } from '../../src/lib/exam/edit'
import { blankQuestion, defaultTitle, sanitizeExam, settingsWithHeader } from '../../src/lib/exam/factory'
import { buildGroup } from '../../src/lib/exam/groups'
import { gradeLabelTr, paperLabels } from '../../src/lib/exam/paperLabels'
import { examFileBase, keyAnswer, matchingKey, rightColumn } from '../../src/lib/exam/paperText'
import { rescalePoints } from '../../src/lib/exam/points'
import { exportIssues, questionProblems } from '../../src/lib/exam/problems'
import { distributionRows, specRows, specTotals } from '../../src/lib/exam/tables'
import { EXAM_QUESTION_TYPES } from '../../src/lib/exam/types'
import type { ExamHeader, ExamQuestion } from '../../src/lib/exam/types'
import { sampleExam } from '../fixtures/exam'

// B2 header formats, B3 points, B4 key text, B9 templates and problems, E6 tables, V3 groups: pure logic, no browser.

const header = (change: Partial<ExamHeader> = {}): ExamHeader => ({ school: '', academicYear: '2026-2027', term: 1, examNo: 1, course: '', grade: '9', section: '', teacher: '', ...change })

test.describe('B2: the header', () => {
  test('Turkish: "9. SINIF" with a class only, "9/A SINIFI" with a section, other names keep their words', () => {
    const tr = paperLabels('tr')
    expect(tr.titleLine(header({ course: 'Biyoloji' }))).toBe('9. SINIF BİYOLOJİ DERSİ 1. DÖNEM 1. YAZILI SINAVI')
    expect(tr.titleLine(header({ course: 'Biyoloji', section: 'a' }))).toBe('9/A SINIFI BİYOLOJİ DERSİ 1. DÖNEM 1. YAZILI SINAVI')
    expect(gradeLabelTr(header({ grade: 'Hazırlık' }))).toBe('HAZIRLIK SINIFI')
    expect(gradeLabelTr(header({ grade: 'Üniversite' }))).toBe('ÜNİVERSİTE')
    expect(gradeLabelTr(header({ grade: '10.' }))).toBe('10. SINIF')
    expect(tr.titleLine(header({ grade: '', course: '' }))).toBe('1. DÖNEM 1. YAZILI SINAVI')
  })

  test('school and course are upper-cased with Turkish rules (i becomes İ, ı becomes I)', () => {
    const tr = paperLabels('tr')
    expect(tr.schoolLine(header({ school: 'istanbul fen lisesi' }))).toBe('İSTANBUL FEN LİSESİ')
    expect(tr.titleLine(header({ course: 'din kültürü' }))).toContain('DİN KÜLTÜRÜ DERSİ')
    expect(tr.titleLine(header({ course: 'ıslık' }))).toContain('ISLIK DERSİ')
  })

  test('English and Western Armenian keep their own format; the time line is hidden when empty', () => {
    const en = paperLabels('en')
    expect(en.titleLine(header({ course: 'Biology', section: 'b' }))).toBe('BIOLOGY – GRADE 9/B – TERM 1 – WRITTEN EXAM 1')
    expect(en.schoolLine(header({ school: 'Central High' }))).toBe('Central High')
    expect(en.timeLine(40)).toBe('Time: 40 minutes')
    expect(en.timeLine(null)).toBeNull()
    expect(paperLabels('tr').timeLine(40)).toBe('Süre: 40 dakika')
    expect(paperLabels('tr').timeLine(null)).toBeNull()
    expect(paperLabels('hyw').titleLine(header({ course: 'Կենսաբանութիւն' }))).toContain('ԿԵՆՍԱԲԱՆՈՒԹԻՒՆ')
  })

  test('the default title has single spaces and only the parts that are filled in', () => {
    expect(defaultTitle(header({ course: '   Biyoloji  ', grade: ' 9 ' }))).toBe('Biyoloji · 9. sınıf · 1. dönem 1. yazılı')
    expect(defaultTitle(header({ course: '', grade: '' }))).toBe('1. dönem 1. yazılı')
    expect(defaultTitle(header({ course: 'Tarih' }))).not.toMatch(/\s{2,}/)
  })

  test('the level follows the grade; old exams with a grade and a separate level still open', () => {
    const settings = sampleExam().settings
    expect(settingsWithHeader(settings, header({ grade: '5' })).level).toBe('5')
    expect(settingsWithHeader(settings, header({ grade: 'Üniversite' })).level).toBe('university')
    expect(settingsWithHeader(settings, header({ grade: 'Hazırlık' })).level).toBe('other')
    const old = sanitizeExam({ ...sampleExam(), settings: { ...settings, level: '7', header: { ...settings.header, grade: '' } } })
    expect(old?.settings.header.grade).toBe('7')
    expect(old?.settings.level).toBe('7')
    const both = sanitizeExam({ ...sampleExam(), settings: { ...settings, level: '7', header: { ...settings.header, grade: '10' } } })
    expect(both?.settings.level).toBe('10')
  })
})

test.describe('B3: scaling the points to 100', () => {
  const questions = (points: number[]): ExamQuestion[] =>
    points.map((value, index) => ({ id: `p${index}`, type: 'open-ended', stem: 's', answer: 'a', rubric: [{ text: 'bir', points: Math.ceil(value / 2) }, { text: 'iki', points: Math.floor(value / 2) }], points: value, topic: 't', difficulty: 'medium', lines: 3 }))

  test('97 becomes exactly 100 with whole numbers, the same ratios and every rubric rescaled', () => {
    const scaled = rescalePoints(questions([30, 30, 20, 10, 7]))
    expect(scaled.reduce((sum, question) => sum + question.points, 0)).toBe(100)
    for (const question of scaled) {
      expect(Number.isInteger(question.points)).toBe(true)
      expect(question.rubric.reduce((sum, item) => sum + item.points, 0)).toBe(question.points)
    }
    expect(scaled.map((question) => question.points)).toEqual([31, 31, 21, 10, 7])
    // Ratios are kept: the first two stay equal and the largest stays the largest.
    expect(scaled[0].points).toBe(scaled[1].points)
  })

  test('a total above 100 scales down, and an exam without any points is spread by type', () => {
    const down = rescalePoints(questions([60, 60, 30]))
    expect(down.reduce((sum, question) => sum + question.points, 0)).toBe(100)
    expect(down[0].points).toBe(down[1].points)
    expect(rescalePoints(questions([0, 0, 0])).reduce((sum, question) => sum + question.points, 0)).toBe(100)
  })

  test('the export check names the points total only when it is not 100', () => {
    const exam = sampleExam()
    expect(exportIssues(exam)).toBeNull()
    const off = { ...exam, questions: exam.questions.map((question, index) => (index === 0 ? { ...question, points: 7 } : question)) }
    expect(exportIssues(off)?.points).toBe(97)
    const empty = { ...exam, settings: { ...exam.settings, header: { ...exam.settings.header, course: '' } } }
    expect(exportIssues(empty)?.header).toBe(true)
  })
})

test.describe('B9: a new question of every type is a correct template', () => {
  test('every type starts empty but well-formed, and says what is missing', () => {
    for (const type of EXAM_QUESTION_TYPES) {
      const question = blankQuestion(type)
      expect(question.type).toBe(type)
      expect(questionProblems(question).length, type).toBeGreaterThan(0)
    }
    const mcq = blankQuestion('mcq')
    expect(mcq.options).toEqual(['', '', '', ''])
    expect(mcq.answerIndex).toBeUndefined()
    expect(questionProblems({ ...mcq, stem: 'Soru?', options: ['a', 'b', 'c', 'd'] })).toEqual(['correctOption'])
    expect(questionProblems(blankQuestion('true-false'))).toContain('truth')
    expect(questionProblems({ ...blankQuestion('fill-blanks'), stem: 'Hücre ile ilgili', answer: 'x' })).toEqual(['blank'])
    const matching = blankQuestion('matching')
    expect(matching.pairs).toHaveLength(4)
    expect(matching.extras).toHaveLength(2)
    expect(matching.rightOrder).toHaveLength(6)
  })

  test('a completed question of each type passes', () => {
    const done: ExamQuestion[] = [
      { ...blankQuestion('open-ended'), stem: 'Açıklayınız.', answer: 'Cevap cümlesi.' },
      { ...blankQuestion('short-answer'), stem: 'Nedir?', answer: 'ribozom' },
      { ...blankQuestion('fill-blanks'), stem: 'Organel ___ adını alır.', answer: 'koful' },
      { ...blankQuestion('true-false'), stem: 'Doğru bir ifade.', answerBool: true },
      { ...blankQuestion('mcq'), stem: 'Hangisi?', options: ['a', 'b'], answerIndex: 1, answer: 'b' },
      { ...withExtras(withPairs(blankQuestion('matching'), [{ left: 'a', right: 'b' }, { left: 'c', right: 'd' }]), ['x', 'y']), stem: 'Eşleştir.' },
    ]
    for (const question of done) expect(questionProblems(question), question.type).toEqual([])
  })

  test('the export check lists unfinished questions by number with the reason', () => {
    const exam = sampleExam()
    const broken = { ...exam, questions: [...exam.questions, { ...blankQuestion('mcq'), stem: 'Soru?', options: ['a', 'b', 'c', 'd'], points: 0 }] }
    const issues = exportIssues(broken)
    expect(issues?.incomplete).toEqual([{ number: exam.questions.length + 1, problems: ['correctOption'] }])
  })

  test('options and pairs reorder without losing the key', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    const matching = withPairs(blankQuestion('matching'), [...(blankQuestion('matching').pairs ?? []), { left: '', right: '' }])
    expect(matching.pairs).toHaveLength(5)
    expect(matching.rightOrder).toHaveLength(7)
  })
})

test.describe('B4: the answer key text', () => {
  const labels = paperLabels('tr')
  const short: ExamQuestion = { id: 'a', type: 'short-answer', stem: 'Nedir?', answer: 'kloroplast', acceptableAnswers: ['kloroplast', 'plastid.', 'Plastit;', '  yeşil plastid  .'], rubric: [{ text: 'kloroplast', points: 3 }], points: 3, topic: 't', difficulty: 'easy', lines: 1 }

  test('"Kabul edilebilir" never ends in a dot or a semicolon and drops the answer itself', () => {
    const key = keyAnswer(short, labels)
    expect(key.accepted).toEqual(['plastid', 'Plastit', 'yeşil plastid'])
    expect(key.accepted.join(' / ')).toBe('plastid / Plastit / yeşil plastid')
    expect(key.accepted.every((value) => !/[.;,]$/.test(value))).toBe(true)
  })

  test('evaluation and creation questions say "Örnek cevap", the others "Beklenen cevap"', () => {
    const open: ExamQuestion = { ...short, type: 'open-ended', acceptableAnswers: undefined }
    expect(keyAnswer({ ...open, bloomLevel: 5 }, labels).expectedLabel).toBe('Örnek cevap')
    expect(keyAnswer({ ...open, bloomLevel: 6 }, labels).expectedLabel).toBe('Örnek cevap')
    expect(keyAnswer({ ...open, bloomLevel: 3 }, labels).expectedLabel).toBe('Beklenen cevap')
    expect(keyAnswer(open, labels).expectedLabel).toBe('Beklenen cevap')
    expect(keyAnswer({ ...open, bloomLevel: 6 }, paperLabels('en')).expectedLabel).toBe('Sample answer')
  })

  test('file names carry the group and "Cevap-Anahtari"', () => {
    const exam = sampleExam()
    expect(examFileBase(exam, 'key', 'A')).toBe('Biyoloji-10-Sinif-Yazili-A-Grubu-Cevap-Anahtari')
    expect(examFileBase(exam, 'exam', 'B')).toBe('Biyoloji-10-Sinif-Yazili-B-Grubu')
    expect(examFileBase({ ...exam, settings: { ...exam.settings, groups: false } }, 'exam', 'A')).toBe('Biyoloji-10-Sinif-Yazili')
  })
})

test.describe('E6: the two tables match the questions', () => {
  const rows = (exam = sampleExam()) => buildGroup(exam, 'A')

  test('the topic distribution lists the question numbers, the count and the points of each topic', () => {
    const questions = rows()
    const distribution = distributionRows(questions)
    expect(distribution.reduce((sum, row) => sum + row.count, 0)).toBe(questions.length)
    expect(distribution.reduce((sum, row) => sum + row.points, 0)).toBe(100)
    const fotosentez = distribution.find((row) => row.topic === 'Fotosentez')
    expect(fotosentez?.numbers).toEqual([1, 2, 3, 4])
    expect(fotosentez?.points).toBe(40)
  })

  test('the table of specifications puts question numbers under their Bloom level, with totals', () => {
    const questions = rows()
    const spec = specRows(questions)
    const totals = specTotals(spec)
    expect(totals.total).toBe(questions.length)
    expect(totals.perLevel.reduce((a, b) => a + b, 0) + totals.unset).toBe(questions.length)
    const fotosentez = spec.find((row) => row.topic === 'Fotosentez')
    expect(fotosentez?.cells[2]).toEqual([1]) // open-1 is level 3
    expect(fotosentez?.cells[4]).toEqual([2]) // open-2 is level 5
    expect(totals.unset).toBeGreaterThan(0)
  })

  test('both tables follow edits of points, topics and levels', () => {
    const exam = sampleExam()
    const edited = { ...exam, questions: exam.questions.map((question) => (question.id === 'open-1' ? { ...question, points: 4, topic: 'Yeni konu', bloomLevel: 6 as const } : question)) }
    const questions = rows(edited)
    const distribution = distributionRows(questions)
    expect(distribution.find((row) => row.topic === 'Yeni konu')).toMatchObject({ numbers: [1], count: 1, points: 4 })
    expect(specRows(questions).find((row) => row.topic === 'Yeni konu')?.cells[5]).toEqual([1])
    expect(distribution.find((row) => row.topic === 'Fotosentez')?.numbers).toEqual([2, 3, 4])
  })

  test('group B tables use the numbers of paper B', () => {
    const exam = sampleExam()
    const b = buildGroup(exam, 'B')
    const numbers = distributionRows(b).flatMap((row) => row.numbers).sort((x, y) => x - y)
    expect(numbers).toEqual(Array.from({ length: b.length }, (_, index) => index + 1))
  })
})

test.describe('V3: the B paper keeps every question, and its key points at the same answers', () => {
  test('mcq: the correct option text is the same on A and B', () => {
    const exam = sampleExam()
    const a = buildGroup(exam, 'A')
    const b = buildGroup(exam, 'B')
    for (const questionB of b) {
      const questionA = a.find((candidate) => candidate.id === questionB.id) as ExamQuestion
      if (questionB.type === 'mcq') expect(questionB.options?.[questionB.answerIndex ?? 0]).toBe(questionA.options?.[questionA.answerIndex ?? 0])
      if (questionB.type === 'true-false') expect(questionB.answerBool).toBe(questionA.answerBool)
    }
    expect(b.map((question) => question.id).sort()).toEqual(a.map((question) => question.id).sort())
    expect(b.map((question) => question.id)).not.toEqual(a.map((question) => question.id))
  })

  test('matching with extra items: each left item has the same match on A and B, and no pair sits opposite its own', () => {
    const matching: ExamQuestion = {
      id: 'm1',
      type: 'matching',
      stem: 'Eşleştir.',
      pairs: [
        { left: 'Ribozom', right: 'Protein sentezi' },
        { left: 'Lizozom', right: 'Sindirim' },
        { left: 'Golgi', right: 'Salgı' },
        { left: 'Kloroplast', right: 'Fotosentez' },
      ],
      extras: ['Boşaltım', 'Depolama'],
      rightOrder: [1, 2, 3, 4, 5, 0],
      answer: '',
      rubric: [{ text: 'Eşleştirmeler', points: 5 }],
      points: 5,
      topic: 'T',
      difficulty: 'medium',
      lines: 0,
    }
    const exam = { ...sampleExam(), questions: [matching] }
    for (const group of ['A', 'B'] as const) {
      const question = buildGroup(exam, group)[0]
      const column = rightColumn(question)
      expect(column).toHaveLength(6)
      expect(new Set(column)).toEqual(new Set(['Protein sentezi', 'Sindirim', 'Salgı', 'Fotosentez', 'Boşaltım', 'Depolama']))
      const key = matchingKey(question).split(', ')
      expect(key).toHaveLength(4)
      key.forEach((entry, index) => {
        const letter = entry.split('-')[1]
        expect(column[letter.charCodeAt(0) - 65]).toBe((matching.pairs ?? [])[index].right)
        expect(letter.charCodeAt(0) - 65).not.toBe(index)
      })
    }
  })
})
