import { strFromU8, unzipSync } from 'fflate'

import { test, expect } from './fixtures'
import { seedExams, storedExams } from './examHelpers'
import { buildExamDocx, buildExamZip, examFileName } from '../../src/lib/exam/docx'
import { appendQuestion, moveQuestion, removeQuestion, withExtras, withPairs } from '../../src/lib/exam/edit'
import { blankQuestion, computeRightOrder, sanitizeExam } from '../../src/lib/exam/factory'
import { quizToExam } from '../../src/lib/exam/fromQuiz'
import { balanceMcqLetters } from '../../src/lib/exam/balance'
import { applyFix } from '../../src/lib/exam/generate'
import { rightColumn } from '../../src/lib/exam/paperText'
import { sanitizeExamQuestion } from '../../api/_lib/exam'
import { distributePoints, rescalePoints, setQuestionPoints } from '../../src/lib/exam/points'
import { defaultExamHeader } from '../../src/lib/exam/types'
import type { ExamGroup, ExamQuestion, WrittenExam } from '../../src/lib/exam/types'
import type { ArchiveEntry } from '../../src/lib/archiveSource'
import type { QuizQuestion } from '../../src/lib/quiz'
import { KEY_EXAM_ID, keyExam, keyQuestions, truthOf } from '../fixtures/exam-key'
import type { Truth } from '../fixtures/exam-key'

// The answer key stays right through every step a teacher takes and in every output: the printed paper is read back as text
// (question by its stem, options and right column by their letters) and checked against answers stated by text, not by position.

type Page = import('@playwright/test').Page

interface PaperRead {
  number: number
  text: string
  letters: Record<string, string>
  lefts: string[]
}

const norm = (value: string) => value.replace(/\s+/g, ' ').trim()

function decode(xml: string): string {
  return xml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/** The paragraphs of a Word file, as plain text (tabs kept). */
function docxParagraphs(bytes: Uint8Array): string[] {
  const xml = strFromU8(unzipSync(bytes)['word/document.xml'])
  return xml.split('</w:p>').map((chunk) => (chunk.match(/<w:tab\/>|<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((token) => (token === '<w:tab/>' ? '	' : decode(token.replace(/<[^>]+>/g, '')))).join(''))
}

function readDocxPaper(bytes: Uint8Array): PaperRead[] {
  const out: PaperRead[] = []
  for (const paragraph of docxParagraphs(bytes)) {
    const start = /^(\d+)\.\t(.*)$/s.exec(paragraph)
    if (start) {
      out.push({ number: Number(start[1]), text: norm(start[2]), letters: {}, lefts: [] })
      continue
    }
    const current = out[out.length - 1]
    if (!current) continue
    const left = /^\(\s+\) (\d+)\. (.*)$/s.exec(paragraph)
    if (left) {
      current.lefts[Number(left[1]) - 1] = norm(left[2])
      continue
    }
    const letter = /^([A-J])\) (.*)$/s.exec(paragraph)
    if (letter) current.letters[letter[1]] = norm(letter[2])
  }
  return out
}

/** Key blocks of a Word key by question number (one per group when the file holds A and B). */
function readDocxKeys(bytes: Uint8Array, pointsWord: string): Record<number, string>[] {
  const groups: Record<number, string>[] = []
  let current: Record<number, string> = {}
  let last = 0
  let number = 0
  for (const paragraph of docxParagraphs(bytes)) {
    const head = /^(\d+)\. (.*)$/s.exec(paragraph)
    if (head && paragraph.includes(pointsWord)) {
      number = Number(head[1])
      if (number <= last) {
        groups.push(current)
        current = {}
      }
      last = number
      current[number] = norm(head[2])
    } else if (number > 0 && paragraph.trim()) {
      current[number] = `${current[number]} | ${norm(paragraph)}`
    }
  }
  groups.push(current)
  return groups
}

/** Every question of the paper is found by its stem and its key says the truth in the paper's own letters. */
function verify(paper: PaperRead[], keys: Record<number, string>, truth: Truth[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const stemPart = (stem: string) => norm(stem.split('___')[0]).slice(0, 30)
  if (paper.length !== truth.length) errors.push(`paper has ${paper.length} questions, expected ${truth.length}`)
  for (const question of paper) {
    const matches = truth.filter((entry) => question.text.includes(stemPart(entry.stem)))
    if (matches.length !== 1) {
      errors.push(`${question.number}: stem not found once (${question.text.slice(0, 40)})`)
      continue
    }
    const entry = matches[0]
    seen.add(entry.stem)
    const key = keys[question.number] ?? ''
    if (!key) errors.push(`${question.number}: no key`)
    if (entry.kind === 'mcq') {
      const letter = /Cevap: ([A-J])\) /.exec(key)?.[1]
      if (!letter || question.letters[letter] !== norm(entry.text)) errors.push(`${question.number}: key ${letter} -> "${letter ? question.letters[letter] : ''}", truth "${entry.text}"`)
      if (!key.includes(`${letter}) ${entry.text}`)) errors.push(`${question.number}: key text "${key}" lacks "${entry.text}"`)
    } else if (entry.kind === 'tf') {
      if (!key.startsWith(`Cevap: ${entry.value ? 'Doğru' : 'Yanlış'}`)) errors.push(`${question.number}: tf key "${key}"`)
    } else if (entry.kind === 'text') {
      if (!key.includes(norm(entry.answer))) errors.push(`${question.number}: key "${key}" lacks "${entry.answer}"`)
    } else {
      const list = /Cevap: ([\d]+-[A-J](?:, \d+-[A-J])*)/.exec(key)?.[1]
      const found = (list ?? '').split(', ').filter(Boolean)
      if (found.length !== Object.keys(entry.map).length) errors.push(`${question.number}: matching key "${key}"`)
      for (const item of found) {
        const [index, letter] = item.split('-')
        const left = question.lefts[Number(index) - 1]
        if (!left || entry.map[left] !== question.letters[letter]) errors.push(`${question.number}: ${left} -> ${question.letters[letter]}, truth ${left ? entry.map[left] : '?'}`)
      }
      const rights = Object.values(question.letters)
      for (const right of Object.values(entry.map)) if (rights.filter((value) => value === right).length !== 1) errors.push(`${question.number}: right item "${right}" not printed once`)
    }
  }
  for (const entry of truth) if (!seen.has(entry.stem)) errors.push(`missing on paper: ${entry.stem}`)
  return errors
}

/** The paper of a group against its Word key; with groups on, the "both" key file holds the same key in its second part. */
async function checkWord(exam: WrittenExam, truth: Truth[]): Promise<string[]> {
  const groups: ExamGroup[] = exam.settings.groups ? ['A', 'B'] : ['A']
  const errors: string[] = []
  const both = readDocxKeys(await buildExamDocx(exam, 'key', 'both'), 'puan)')
  for (const [index, group] of groups.entries()) {
    const paper = readDocxPaper(await buildExamDocx(exam, 'exam', group))
    const [keys] = readDocxKeys(await buildExamDocx(exam, 'key', group), 'puan)')
    errors.push(...verify(paper, keys, truth).map((error) => `${group}: ${error}`))
    errors.push(...verify(paper, both[index] ?? {}, truth).map((error) => `${group} (both): ${error}`))
  }
  return errors
}

const BASE_TRUTH = truthOf(keyQuestions())

test.describe('answer key: code paths (no AI)', () => {
  test('the fixture: papers A and B, their Word keys and the combined key are right', async () => {
    expect(await checkWord(keyExam(), BASE_TRUTH)).toEqual([])
  })

  test('the check itself catches a wrong key: another correct option, a swapped pair, a flipped statement', async () => {
    const wrong = keyExam({
      questions: keyQuestions().map((question) => {
        if (question.id === 'k-mcq4') return { ...question, answerIndex: 2 }
        if (question.id === 'k-tf1') return { ...question, answerBool: false }
        if (question.id === 'k-match') return { ...question, pairs: question.pairs!.map((pair, index) => (index === 0 ? { ...pair, right: question.pairs![1].right } : index === 1 ? { ...pair, right: question.pairs![0].right } : pair)) }
        return question
      }),
    })
    const errors = await checkWord(wrong, BASE_TRUTH)
    for (const part of ['key C', 'tf key', 'Mitokondri -> Protein sentezi']) expect(errors.some((error) => error.includes(part)), part).toBe(true)
  })

  test('group B really reorders: questions within a type, options and the right column', () => {
    // (read from the Word papers, so the shuffle that is checked is the printed one)
    return (async () => {
      const a = readDocxPaper(await buildExamDocx(keyExam(), 'exam', 'A'))
      const b = readDocxPaper(await buildExamDocx(keyExam(), 'exam', 'B'))
      expect(b.map((question) => question.text)).not.toEqual(a.map((question) => question.text))
      const mcqA = a.find((question) => question.text.startsWith('Hücrede ATP'))!
      const mcqB = b.find((question) => question.text.startsWith('Hücrede ATP'))!
      expect(Object.values(mcqB.letters)).not.toEqual(Object.values(mcqA.letters))
    })()
  })

  test('saving and loading again keeps every key', async () => {
    const reloaded = sanitizeExam(JSON.parse(JSON.stringify(keyExam())))!
    expect(reloaded.questions).toHaveLength(8)
    expect(await checkWord(reloaded, BASE_TRUTH)).toEqual([])
  })

  test('moving and deleting questions, changing and spreading points keep every key', async () => {
    let exam = keyExam()
    exam = moveQuestion(exam, 'k-mcq5', -1)
    exam = moveQuestion(exam, 'k-open', 3)
    exam = { ...exam, questions: exam.questions.map((question) => (question.id === 'k-match' ? setQuestionPoints(question, 13) : question)) }
    expect(await checkWord(exam, BASE_TRUTH)).toEqual([])
    exam = { ...exam, questions: rescalePoints(exam.questions) }
    expect(exam.questions.reduce((sum, question) => sum + question.points, 0)).toBe(100)
    expect(await checkWord(exam, BASE_TRUTH)).toEqual([])
    exam = { ...exam, questions: distributePoints(exam.questions) }
    expect(await checkWord(exam, BASE_TRUTH)).toEqual([])
    const without = removeQuestion(exam, 'k-tf2')
    expect(await checkWord(without, BASE_TRUTH.filter((entry) => entry.stem !== 'Lizozom hücrede ATP üreten organeldir.'))).toEqual([])
  })

  test('matching: adding and removing pairs and extra items keeps the key', async () => {
    let exam = keyExam()
    const edit = (update: (question: ExamQuestion) => ExamQuestion) => {
      exam = { ...exam, questions: exam.questions.map((question) => (question.id === 'k-match' ? update(question) : question)) }
    }
    edit((question) => withPairs(question, [...question.pairs!, { left: 'Kloroplast', right: 'Fotosentez yapma' }]))
    edit((question) => withExtras(question, [...question.extras!, 'Hücre bölünmesi']))
    edit((question) => withPairs(question, question.pairs!.filter((pair) => pair.left !== 'Ribozom')))
    edit((question) => withExtras(question, question.extras!.filter((extra) => extra !== 'Fotosentez')))
    const truth = truthOf(exam.questions)
    expect((truth.find((entry) => entry.kind === 'match') as { map: Record<string, string> }).map).toEqual({ Mitokondri: 'ATP üretimi', Lizozom: 'Hücre içi sindirim', 'Golgi cisimciği': 'Paketleme ve salgılama', Kloroplast: 'Fotosentez yapma' })
    expect(await checkWord(exam, truth)).toEqual([])
    expect(await checkWord(sanitizeExam(JSON.parse(JSON.stringify(exam)))!, truth)).toEqual([])
  })

  test('"Add" gives a new question of every type whose key is right once filled in', async () => {
    let exam = keyExam()
    const filled: ExamQuestion[] = [
      { ...blankQuestion('open-ended', 'n-open'), stem: 'Golgi cisimciğinin görevini açıklayınız.', answer: 'Maddeleri paketleyip salgılar.', points: 5 },
      { ...blankQuestion('short-answer', 'n-short'), stem: 'Fotosentez yapan organelin adı nedir?', answer: 'Kloroplast', points: 5 },
      { ...blankQuestion('fill-blanks', 'n-fill'), stem: 'Hücre içi sindirimi sağlayan organel ___ olarak adlandırılır.', answer: 'lizozom', points: 5 },
      { ...blankQuestion('true-false', 'n-tf'), stem: 'Ribozomların zarı yoktur.', answerBool: true, answer: 'true', points: 5 },
      { ...blankQuestion('mcq', 'n-mcq'), stem: 'Hangisi bitki hücresinde bulunur?', options: ['Sentrozom', 'Hücre duvarı', 'Kas lifi', 'Sinir ucu'], answerIndex: 1, answer: 'Hücre duvarı', points: 5 },
      { ...withExtras(withPairs(blankQuestion('matching', 'n-match'), [{ left: 'Koful', right: 'Su depolar' }, { left: 'Çekirdek', right: 'Etkinlikleri yönetir' }, { left: 'Hücre zarı', right: 'Madde geçişini denetler' }]), ['Işık soğurur', 'Enzim üretir']), stem: 'Yapıları özellikleriyle eşleştiriniz.', points: 5 },
    ]
    for (const question of filled) exam = appendQuestion(exam, question)
    expect(await checkWord(exam, [...BASE_TRUTH, ...truthOf(filled)])).toEqual([])
  })

  test('the zip holds the same papers and keys as the single files', async () => {
    const exam = keyExam()
    const files = unzipSync(await buildExamZip(exam))
    for (const group of ['A', 'B'] as const) {
      const paper = readDocxPaper(files[examFileName(exam, 'exam', group)])
      const [keys] = readDocxKeys(files[examFileName(exam, 'key', group)], 'puan)')
      expect(verify(paper, keys, BASE_TRUTH), group).toEqual([])
    }
  })

  test('50 different shuffles (exam ids, option places and right-column orders): the key is always right', async () => {
    const failures: string[] = []
    for (let seed = 0; seed < 50; seed += 1) {
      const id = `${KEY_EXAM_ID.slice(0, -2)}${String(seed).padStart(2, '0')}`
      const questions = keyQuestions().map((question) => {
        if (question.type === 'mcq') {
          // The correct option moves to another place for every seed.
          const options = [...question.options!]
          const correct = options[question.answerIndex!]
          const to = (seed + question.options!.length) % options.length
          options.splice(question.answerIndex!, 1)
          options.splice(to, 0, correct)
          return { ...question, options, answerIndex: to, answer: correct }
        }
        if (question.type === 'matching') return { ...question, rightOrder: computeRightOrder(question.pairs!.length, question.extras!.length, `seed-${seed}`) }
        return question
      })
      const exam = keyExam({ id, questions })
      failures.push(...(await checkWord(exam, truthOf(questions))).map((error) => `seed ${seed}: ${error}`))
    }
    expect(failures).toEqual([])
  })

  test('generation: the server option shuffle, the letter balance and a corrected matching key keep the right answer', async () => {
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let run = 0; run < 50; run += 1) {
      const raw = { type: 'mcq', stem: 'Hücrede ATP üreten organel hangisidir?', options: ['Golgi cisimciği', 'Mitokondri', 'Lizozom', 'Ribozom'], answerIndex: run % 4, topic: 't', difficulty: 'easy' }
      const question = sanitizeExamQuestion(raw, 'mcq', 4, false)!
      expect(question.options![question.answerIndex!]).toBe(raw.options[run % 4])
    }
    // Ten questions all keyed A: the balance moves options, never the answer.
    const texts = Array.from({ length: 10 }, (_, index) => [`Doğru ${index}`, `Yanlış ${index} bir`, `Yanlış ${index} iki`, `Yanlış ${index} üç`])
    for (let run = 0; run < 50; run += 1) {
      const mcqs: ExamQuestion[] = texts.map((options, index) => ({ id: `b${index}`, type: 'mcq', stem: `Soru ${index}?`, options: [...options], answerIndex: 0, answer: options[0], rubric: [], points: 10, topic: 't', difficulty: 'easy', lines: 0 }))
      const balanced = balanceMcqLetters(mcqs, random)
      for (const [index, question] of balanced.entries()) expect(question.options![question.answerIndex!]).toBe(`Doğru ${index}`)
    }
    // A matching key corrected from the source reading: the pairs, the answer and the key follow the reading; the printed column stays.
    const matching = keyQuestions().find((question) => question.id === 'k-match')!
    const printed = rightColumn(matching)
    const reading = ['Protein sentezi', 'ATP üretimi', 'Hücre içi sindirim', 'Paketleme ve salgılama']
    const fixed = applyFix(matching, { wrong: [matching.id], fixes: [{ id: matching.id, matches: reading }], same: [], reviews: [] } as never)
    expect(rightColumn(fixed)).toEqual(printed)
    expect(fixed.pairs!.map((pair) => pair.right)).toEqual(reading)
    const exam = keyExam({ questions: keyQuestions().map((question) => (question.id === 'k-match' ? fixed : question)) })
    expect(await checkWord(exam, truthOf(exam.questions))).toEqual([])
  })

  test('an Archive quiz turned into a written exam keeps every key', async () => {
    const quizQuestions: QuizQuestion[] = [
      { id: 'z1', type: 'mcq', question: 'Hücrede ATP üreten organel hangisidir?', options: ['Golgi cisimciği', 'Lizozom', 'Ribozom', 'Mitokondri'], answerIndex: 3 },
      { id: 'z2', type: 'mcq', question: 'Kalıtım materyalini taşıyan yapı hangisidir?', options: ['Koful', 'Çekirdek', 'Hücre duvarı', 'Sentrozom', 'Kloroplast'], answerIndex: 1 },
      { id: 'z3', type: 'true-false', question: 'Lizozom hücrede ATP üreten organeldir.', answerBool: false },
      { id: 'z4', type: 'fill-blanks', question: 'Bitki hücrelerinde su depolayan büyük yapıya merkezi ___ denir.', answer: 'koful' },
      { id: 'z5', type: 'short-answer', question: 'Protein sentezini gerçekleştiren yapının adı nedir?', answer: 'Ribozom' },
      { id: 'z6', type: 'matching', question: 'Organelleri görevleriyle eşleştiriniz.', pairs: [{ left: 'Mitokondri', right: 'ATP üretimi' }, { left: 'Ribozom', right: 'Protein sentezi' }, { left: 'Lizozom', right: 'Hücre içi sindirim' }], rightOrder: [2, 0, 1] },
      { id: 'z7', type: 'open-ended', question: 'Hücre zarının seçici geçirgen olmasının hücreye yararını açıklayınız.', answer: 'Giren ve çıkan maddeleri denetler.' },
    ] as QuizQuestion[]
    const entry: ArchiveEntry = { id: 'quiz-key', title: 'Hücre', createdAt: '2026-10-13T10:00:00.000Z', source: 'text', questionType: 'mixed', difficulty: 'medium', questionCount: '7', optionsCount: '4', outputLanguage: 'tr', sourceText: 'kaynak', quiz: { title: 'Hücre', questions: quizQuestions } as ArchiveEntry['quiz'] }
    const converted = quizToExam(entry, defaultExamHeader())
    const exam = { ...converted, settings: { ...converted.settings, groups: true, answerKey: true, header: { ...converted.settings.header, course: 'Biyoloji', grade: '9' } } }
    const truth: Truth[] = [
      { kind: 'mcq', stem: 'Hücrede ATP üreten organel hangisidir?', text: 'Mitokondri' },
      { kind: 'mcq', stem: 'Kalıtım materyalini taşıyan yapı hangisidir?', text: 'Çekirdek' },
      { kind: 'tf', stem: 'Lizozom hücrede ATP üreten organeldir.', value: false },
      { kind: 'text', stem: 'Bitki hücrelerinde su depolayan büyük yapıya merkezi ___ denir.', answer: 'koful' },
      { kind: 'text', stem: 'Protein sentezini gerçekleştiren yapının adı nedir?', answer: 'Ribozom' },
      { kind: 'match', stem: 'Organelleri görevleriyle eşleştiriniz.', map: { Mitokondri: 'ATP üretimi', Ribozom: 'Protein sentezi', Lizozom: 'Hücre içi sindirim' } },
      { kind: 'text', stem: 'Hücre zarının seçici geçirgen olmasının hücreye yararını açıklayınız.', answer: 'Giren ve çıkan maddeleri denetler.' },
    ]
    expect(await checkWord(exam, truth)).toEqual([])
    expect(await checkWord(sanitizeExam(JSON.parse(JSON.stringify(exam)))!, truth)).toEqual([])
  })
})

/** The print view of a paper, read like the Word file. */
async function readPrintPaper(page: Page): Promise<PaperRead[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-question]')].map((block) => {
      const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()
      const letters: Record<string, string> = {}
      const lefts: string[] = []
      for (const option of block.querySelectorAll('.xp-opt')) {
        const [letter, text] = option.querySelectorAll(':scope > span')
        letters[clean(letter.textContent).replace(')', '')] = clean(text.textContent)
      }
      const cells = [...block.querySelectorAll(':scope .xp-match > div')]
      for (let index = 0; index + 1 < cells.length; index += 2) {
        const leftSpans = cells[index].querySelectorAll(':scope > span')
        if (leftSpans.length >= 3) lefts[Number(clean(leftSpans[1].textContent).replace('.', '')) - 1] = clean(leftSpans[2].textContent)
        const [letter, text] = cells[index + 1].querySelectorAll(':scope > span')
        letters[clean(letter.textContent).replace(')', '')] = clean(text.textContent)
      }
      return { number: Number(block.dataset.question), text: clean(block.querySelector('.xp-qtext')?.textContent), letters, lefts }
    }),
  )
}

async function readPrintKey(page: Page): Promise<Record<number, string>> {
  return page.evaluate(() => {
    const keys: Record<number, string> = {}
    for (const block of document.querySelectorAll<HTMLElement>('[data-key-question]')) {
      const lines = [...block.children].map((child) => (child.textContent ?? '').replace(/\s+/g, ' ').trim())
      keys[Number(block.dataset.keyQuestion)] = lines.join(' | ').replace(/^\d+\. /, '')
    }
    return keys
  })
}

test.describe('answer key: editor and print view', () => {
  test('print and key pages of A and B agree with the truth', async ({ page }) => {
    await seedExams(page, [keyExam()])
    for (const group of ['A', 'B'] as const) {
      await page.goto(`/exams/${KEY_EXAM_ID}/print?part=exam&group=${group}&lng=tr`)
      await expect(page.locator('[data-question]').first()).toBeVisible()
      const paper = await readPrintPaper(page)
      await page.goto(`/exams/${KEY_EXAM_ID}/print?part=key&group=${group}&lng=tr`)
      await expect(page.locator('[data-key-question]').first()).toBeVisible()
      expect(verify(paper, await readPrintKey(page), BASE_TRUTH), group).toEqual([])
    }
  })

  test('reordering questions and options, a new correct option, delete and undo: the saved exam and every output stay right', async ({ page }) => {
    await seedExams(page, [keyExam()])
    await page.goto(`/exams/${KEY_EXAM_ID}?lng=en`)
    const cards = page.locator('[data-purpose="exam-question"]')
    await expect(cards).toHaveCount(8)
    const card = (stem: string) => cards.filter({ has: page.locator('[data-purpose="exam-stem"]', { hasText: stem }) })
    // Question order.
    await card('Kalıtım materyalini').locator('[data-purpose="exam-move-up"]').click()
    // Option order: the correct option (A, "Çekirdek") moves down twice; then the correct option of the 4-option question changes to "Ribozom".
    const mcq5 = card('Kalıtım materyalini')
    await mcq5.getByLabel('Move option A down').click()
    await mcq5.getByLabel('Move option B down').click()
    await expect(mcq5.getByLabel('Option C is correct')).toBeChecked()
    const mcq4 = card('Hücrede ATP')
    await mcq4.getByLabel('Option D is correct').check()
    // Delete a question and undo.
    await card('Lizozom hücrede ATP').locator('[data-purpose="exam-delete-question"]').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(cards).toHaveCount(7)
    await page.locator('[data-purpose="exam-undo"]').click()
    await expect(cards).toHaveCount(8)
    await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')

    const stored = sanitizeExam((await storedExams(page))[0])!
    const truth = BASE_TRUTH.map((entry): Truth => (entry.stem === 'Hücrede ATP üreten organel hangisidir?' ? { ...entry, text: 'Ribozom' } as Truth : entry))
    expect(await checkWord(stored, truth)).toEqual([])
    for (const group of ['A', 'B'] as const) {
      await page.goto(`/exams/${KEY_EXAM_ID}/print?part=exam&group=${group}&lng=tr`)
      await expect(page.locator('[data-question]').first()).toBeVisible()
      const paper = await readPrintPaper(page)
      await page.goto(`/exams/${KEY_EXAM_ID}/print?part=key&group=${group}&lng=tr`)
      await expect(page.locator('[data-key-question]').first()).toBeVisible()
      expect(verify(paper, await readPrintKey(page), truth), group).toEqual([])
    }
  })
})
