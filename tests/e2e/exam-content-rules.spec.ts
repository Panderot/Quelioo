import { expect, test } from '@playwright/test'

import { balanceMcqLetters } from '../../src/lib/exam/balance'
import { boldNegative, cleanAccepted, cleanRubric, correctIsLongest, hasAbsoluteWord, joinsTwoClaims, letterLimit, mcqExamIssues, optionsKeepOrder, shortAnswerProblems, stemPattern } from '../../src/lib/exam/contentRules'
import { checkExamQuality } from '../../src/lib/exam/quality'
import type { ExamQualityRule } from '../../src/lib/exam/quality'
import type { ExamQuestion, ExamQuestionType } from '../../src/lib/exam/types'

// Content rules per question type (A1, A3, A5, A6, A7), with the questions of a real Biyoloji / 9. sınıf exam as fixtures.

let serial = 0

function q(type: ExamQuestionType, stem: string, extra: Partial<ExamQuestion> = {}): ExamQuestion {
  serial += 1
  const base: ExamQuestion = { id: `c${serial}`, type, stem, answer: `terim${serial}`, rubric: [{ text: 'Doğru cevap', points: 1 }], points: 0, topic: 'Hücre', difficulty: 'medium', lines: 0 }
  if (type === 'true-false') return { ...base, answerBool: true, answer: 'true', ...extra }
  if (type === 'mcq') return { ...base, options: ['Mitokondri', 'Ribozom', 'Kloroplast', 'Çekirdek'], answerIndex: 0, answer: 'Mitokondri', ...extra }
  return { ...base, ...extra }
}

const rules = (questions: ExamQuestion[]): ExamQualityRule[] => checkExamQuality(questions, null).filter((issue) => issue.rule !== 'points').map((issue) => issue.rule)
const idsOf = (questions: ExamQuestion[], rule: ExamQualityRule): string[] => checkExamQuality(questions, null).filter((issue) => issue.rule === rule).map((issue) => issue.id ?? '')

test.describe('A1: the scenario does not give the answer away', () => {
  const leaky = q('open-ended', 'Hooke’un bu gözleminin canlıların yapısı hakkında neyi gösterdiğini açıklayınız.', {
    topic: 'Hücre teorisi',
    context: 'Robert Hooke, 17. yüzyılda mikroskopla mantar dokusunu inceledi ve gördüğü küçük boşluklara hücre adını verdi. Bu gözlem, canlıların küçük birimlerden oluştuğu fikrinin temelini attı.',
    answer: 'Hooke mantar dokusunu mikroskopla inceleyerek hücreyi keşfetti; canlıların hücrelerden oluştuğu fikrinin temelini attı.',
    rubric: [
      { text: 'Hooke’un mantar dokusunu mikroskopla incelediğini belirtir', points: 3 },
      { text: 'Gördüğü boşluklara hücre adını verdiğini söyler', points: 3 },
      { text: 'Gözlemin canlıların küçük birimlerden oluştuğu fikrinin temelini attığını açıklar', points: 3 },
    ],
  })

  test('a scenario that states the rubric items fails', () => {
    expect(idsOf([leaky], 'answer-leak')).toEqual([leaky.id])
  })

  test('the same question with a scenario that only sets the problem passes', () => {
    const clean = q('open-ended', 'Bu gözlemi yapan bilim insanının adını ve odacıklara verdiği adı belirterek buluşun önemini açıklayınız.', {
      topic: 'Hücre teorisi',
      context: '17. yüzyılda bir bilim insanı, geliştirdiği mercekli aletle bitkisel bir doku diliminde küçük odacıklar fark etti.',
      answer: 'Robert Hooke, odacıklara hücre adını verdi; bu buluş canlıların hücrelerden oluştuğu fikrine yol açtı.',
      rubric: [
        { text: 'Bilim insanının Robert Hooke olduğunu yazar', points: 3 },
        { text: 'Odacıklara hücre adının verildiğini belirtir', points: 3 },
        { text: 'Buluşun canlıların birimlerini anlamada önemini açıklar', points: 3 },
      ],
    })
    expect(idsOf([clean], 'answer-leak')).toEqual([])
  })

  test('a short answer whose word is in the stem fails', () => {
    const leak = q('short-answer', 'Hücrenin enerji santrali olan mitokondri nedir?', { answer: 'mitokondri' })
    expect(idsOf([leak], 'answer-leak')).toEqual([leak.id])
    expect(idsOf([q('short-answer', 'Hücrenin enerji santrali olarak bilinen organelin adı nedir?', { answer: 'mitokondri' })], 'answer-leak')).toEqual([])
  })

  test('the judge reading "answerable by copying" fails a question the word check cannot see', () => {
    const prokaryote = q('open-ended', 'Çekirdek zarı bulunmayan bu hücre hangi grupta sınıflandırılır?', { answer: 'Prokaryot hücre', topic: 'Hücre türleri' })
    expect(rules([prokaryote])).not.toContain('answer-leak')
    const issues = checkExamQuality([prokaryote], null, { copyable: new Map([[prokaryote.id, true]]) })
    expect(issues.map((issue) => issue.rule)).toContain('answer-leak')
  })

  test('a multiple-choice stem that holds only the correct option fails; one that holds all options does not', () => {
    const leak = q('mcq', 'Kloroplast fotosentezin yapıldığı organeldir. Fotosentezin yapıldığı organel hangisidir?', { options: ['Kloroplast', 'Ribozom', 'Golgi', 'Lizozom'], answerIndex: 0, answer: 'Kloroplast' })
    expect(idsOf([leak], 'answer-leak')).toEqual([leak.id])
    const fine = q('mcq', 'Kloroplast, ribozom, golgi ve lizozom arasından fotosentez yapan hangisidir?', { options: ['Kloroplast', 'Ribozom', 'Golgi', 'Lizozom'], answerIndex: 0, answer: 'Kloroplast' })
    expect(idsOf([fine], 'answer-leak')).toEqual([])
  })
})

test.describe('A3: short answers are short', () => {
  test('a sentence answer, an "açıklayınız" stem and too many alternatives are caught', () => {
    expect(shortAnswerProblems(q('short-answer', 'Ribozomun görevi nedir?', { answer: 'Ribozomlar hücrede protein sentezinin yapıldığı yerdir.' }))).toContain('answer-long')
    expect(shortAnswerProblems(q('short-answer', 'Koful neden önemlidir? Açıklayınız.', { answer: 'su depolar' }))).toContain('stem-explain')
    expect(shortAnswerProblems(q('short-answer', 'Hücre zarının yapısında hangi iki madde bulunur?', { answer: 'fosfolipit ve protein', acceptableAnswers: ['a1', 'b2', 'c3', 'd4'] }))).toContain('accepted-many')
    expect(idsOf([q('short-answer', 'Koful neden önemlidir? Açıklayınız.', { answer: 'su depolar' })], 'short-answer')).toHaveLength(1)
  })

  test('direct questions with 1-4 word answers pass', () => {
    for (const [stem, answer] of [['Protein sentezinin yapıldığı organel hangisidir?', 'ribozom'], ['Bitki hücresinde suyu depolayan büyük yapı nedir?', 'merkezi koful'], ['Hücre zarı hangi iki maddeden oluşur?', 'fosfolipit ve protein']] as const) {
      const item = q('short-answer', stem, { answer, rubric: [{ text: answer, points: 1 }] })
      expect(shortAnswerProblems(item)).toEqual([])
      expect(idsOf([item], 'short-answer')).toEqual([])
    }
  })

  test('"Kabul edilebilir" keeps at most three real alternatives without trailing punctuation and drops the same sentence reworded', () => {
    expect(cleanAccepted('ribozom', ['Ribozom.', 'ribosome;', 'ribozomlar', 'protein fabrikası', 'dördüncü', 'ribozom']))
      .toEqual(['ribosome', 'ribozomlar', 'protein fabrikası'])
    expect(cleanAccepted('ribozom', ['Ribozomlar hücrede protein sentezinin yapıldığı küçük yapılardır elbette.'])).toEqual([])
  })
})

test.describe('A5: rubric items are real', () => {
  const open = (rubric: string[], answer: string): ExamQuestion => q('open-ended', 'Mitokondrinin hücredeki rolünü açıklayınız.', { answer, rubric: rubric.map((text) => ({ text, points: 2 })), topic: 'Organeller' })

  test('empty items, repeated items and too many items for a one-sentence answer fail', () => {
    expect(rules([open(['Bu ifadenin hücre için önemli olduğunu açıkladığını belirtir', 'ATP üretildiğini yazar'], 'Mitokondri ATP üretir.')])).toContain('rubric')
    expect(rules([open(['Sınıflandırma ölçütü olarak açıklar', 'ATP üretildiğini yazar'], 'Mitokondri ATP üretir.')])).toContain('rubric')
    expect(rules([open(['ATP üretimini belirtir', 'ATP üretimini açıklar'], 'Mitokondri ATP üretir ve enerji sağlar.')])).toContain('rubric')
    expect(rules([open(['ATP üretir', 'Enerji sağlar', 'Hücre solunumu yapar', 'Organel olduğunu belirtir'], 'Mitokondri ATP üretir.')])).toContain('rubric')
  })

  test('separate observable items pass, and the cleaner removes empty and repeated ones', () => {
    expect(rules([open(['ATP üretildiğini belirtir', 'Hücre solunumunun burada yapıldığını yazar'], 'Mitokondri hücre solunumunun yapıldığı yerdir. Burada ATP üretilir.')])).not.toContain('rubric')
    const items = cleanRubric([{ text: 'ATP üretimini belirtir' }, { text: 'ATP üretimini açıklar' }, { text: 'Bu ifadenin enerji verdiğini açıkladığını belirtir' }, { text: 'Solunumu yazar' }])
    expect(items.map((item) => item.text)).toEqual(['ATP üretimini belirtir', 'Solunumu yazar'])
  })
})

test.describe('A6: one concept, two questions at most, and only when they differ', () => {
  test('two multiple-choice questions on the same organelle at the same level are caught (kloroplast)', () => {
    const a = q('mcq', 'Fotosentezin gerçekleştiği organel aşağıdakilerden hangisidir?', { concept: 'Kloroplast', bloomLevel: 1, difficulty: 'easy' })
    const b = q('mcq', 'Klorofil pigmentini taşıyan yapı aşağıdakilerden hangisidir?', { concept: 'Kloroplast', bloomLevel: 1, difficulty: 'easy', options: ['Kloroplast', 'Lizozom', 'Golgi', 'Koful'], answer: 'Kloroplast' })
    expect(idsOf([a, b], 'concept-cap')).toEqual([b.id])
  })

  test('the same concept in another type or at another level is allowed, a third is not', () => {
    const a = q('mcq', 'Fotosentezin gerçekleştiği organel aşağıdakilerden hangisidir?', { concept: 'Kloroplast', bloomLevel: 1 })
    const b = q('mcq', 'Klorofil pigmentinin bulunduğu organel aşağıdakilerden hangisidir?', { concept: 'Kloroplast', bloomLevel: 2 })
    const c = q('short-answer', 'Fotosentez yapan organelin adı nedir?', { concept: 'Kloroplast', answer: 'kloroplast' })
    expect(idsOf([a, b], 'concept-cap')).toEqual([])
    expect(idsOf([a, b, c], 'concept-cap')).toEqual([c.id])
  })
})

test.describe('A7: multiple choice', () => {
  const mcq = (stem: string, answerIndex: number, options: string[]) => q('mcq', stem, { options, answerIndex, answer: options[answerIndex] })

  test('the correct option is the longest in at most 40 % of the questions', () => {
    const long = (n: number) => mcq(`Soru ${n} hangi organeldir burada?`, 2, ['Kısa bir', 'Kısa iki', 'Doğru olan uzun seçenek', 'Kısa dört'])
    const short = (n: number) => mcq(`Başka ${n} hangi yapıyı anlatır?`, 0, ['Doğru', 'Yanlış seçenek uzun', 'Bir diğer uzun seçenek', 'Dördüncü uzun seçenek'])
    expect(correctIsLongest(long(1))).toBe(true)
    expect(correctIsLongest(short(1))).toBe(false)
    expect(mcqExamIssues([long(1), long(2), long(3), short(4), short(5)]).longest).toHaveLength(1)
    expect(mcqExamIssues([long(1), long(2), short(3), short(4), short(5)]).longest).toHaveLength(0)
  })

  test('no letter is correct in more than 40 %, and the balancer fixes it by moving options', () => {
    const questions = [0, 0, 0, 0, 1].map((answerIndex, index) => mcq(`Soru ${index} aşağıdakilerden hangisi doğrudur şu an?`, answerIndex, [`a${index}x`, `b${index}x`, `c${index}x`, `d${index}x`]))
    expect(mcqExamIssues(questions).letters.length).toBeGreaterThan(0)
    expect(letterLimit(5, 4)).toBe(2)
    const balanced = balanceMcqLetters(questions)
    expect(mcqExamIssues(balanced).letters).toEqual([])
    for (const [index, question] of balanced.entries()) expect(question.options?.[question.answerIndex ?? 0]).toBe(questions[index].options?.[questions[index].answerIndex ?? 0])
  })

  test('options that keep their order (all of the above, ascending numbers) are never moved', () => {
    expect(optionsKeepOrder(['A', 'B', 'Hepsi'])).toBe(true)
    expect(optionsKeepOrder(['2', '4', '8', '16'])).toBe(true)
    expect(optionsKeepOrder(['Golgi', 'Ribozom', 'Koful'])).toBe(false)
    const fixed = [0, 0, 0, 0, 0].map((_, index) => mcq(`Sıralı ${index} soru hangi sayıdır bunlar?`, 0, ['2', '4', '8', '16']))
    expect(balanceMcqLetters(fixed).map((question) => question.answerIndex)).toEqual([0, 0, 0, 0, 0])
  })

  test('at most 40 % of the stems open the same way, and at most one negative stem', () => {
    const same = (n: number) => mcq(`Aşağıdakilerden hangisi doğrudur ${n}. kez?`, n % 4, ['bir', 'iki', 'üç', 'dört'])
    expect(stemPattern('Aşağıdakilerden hangisi doğrudur?')).toBe('aşağıdakilerden hangisi')
    expect(mcqExamIssues([same(1), same(2), same(3), mcq('Hücre zarı nedir tam olarak?', 0, ['a', 'b', 'c', 'd']), mcq('Hangi yapı enerji üretir burada?', 1, ['a', 'b', 'c', 'd'])]).stems).toHaveLength(1)
    const negative = (n: number) => mcq(`Organeller ${n}. grupta aşağıdakilerden hangisi hücre için doğru değildir?`, 1, ['a', 'b', 'c', 'd'])
    expect(mcqExamIssues([negative(1), negative(2)]).negative).toHaveLength(1)
    expect(boldNegative('Aşağıdakilerden hangisi mitokondri için doğru değildir?')).toBe('Aşağıdakilerden hangisi mitokondri için doğru **değildir**?')
    expect(boldNegative('Hangisi **değildir**?')).toBe('Hangisi **değildir**?')
  })
})

test.describe('A7: true-false, fill-in, matching', () => {
  const tf = (stem: string, answerBool: boolean) => q('true-false', stem, { answerBool, answer: String(answerBool) })

  test('absolute words may not sit mostly in false statements', () => {
    expect(hasAbsoluteWord('Mitokondri hücrenin her zaman enerji üretir.')).toBe(true)
    expect(hasAbsoluteWord('Mitokondri enerji üretir.')).toBe(false)
    expect(idsOf([tf('Bitki hücresi her zaman kloroplast içerir burada.', false), tf('Ribozom asla protein sentezlemez hiçbir hücrede.', false), tf('Koful hücrede su depolayabilir elbette.', true), tf('Çekirdek kalıtım bilgisini taşır tabii.', true), tf('Golgi salgı yapar kesinlikle böyledir.', true)], 'tf-absolute')).toHaveLength(1)
    expect(idsOf([tf('Bitki hücresi her zaman kloroplast içerir burada.', false), tf('Hayvan hücresi sadece çekirdek bulundurur bence.', true)], 'tf-absolute')).toEqual([])
  })

  test('a statement with two claims joined by "ve" is caught, a list of nouns is not', () => {
    expect(joinsTwoClaims('Mitokondri enerji üretir ve kloroplast fotosentez yapar.')).toBe(true)
    expect(joinsTwoClaims('DNA ve RNA nükleik asitlerdir.')).toBe(false)
    expect(joinsTwoClaims('Mitokondri enerji üretir.')).toBe(false)
  })

  test('a fill-in needs one blank and a specific key term', () => {
    expect(rules([q('fill-blanks', 'Hücrenin enerji santrali ___ organelidir.', { answer: 'mitokondri' })])).not.toContain('fill-blank')
    expect(rules([q('fill-blanks', 'Hücrenin ___ enerji santrali ___ organelidir.', { answer: 'mitokondri' })])).toContain('fill-blank')
    expect(rules([q('fill-blanks', 'Hücre zarı ___ geçirgendir.', { answer: 'bir' })])).toContain('fill-blank')
    expect(rules([q('fill-blanks', 'Hücrenin enerji santrali ___ organelidir.', { answer: 'çok uzun bir cevap cümlesi yazdık' })])).toContain('fill-blank')
  })

  test('a matching question needs at least two extra items and distinct sides', () => {
    const pairs = [{ left: 'Ribozom', right: 'Protein sentezi' }, { left: 'Lizozom', right: 'Sindirim' }, { left: 'Golgi', right: 'Salgı' }, { left: 'Kloroplast', right: 'Fotosentez' }]
    expect(rules([q('matching', 'Eşleştiriniz.', { pairs, rightOrder: [1, 2, 3, 0] })])).toContain('matching')
    expect(rules([q('matching', 'Eşleştiriniz.', { pairs, extras: ['Boşaltım'], rightOrder: [1, 2, 3, 4, 0] })])).toContain('matching')
    expect(rules([q('matching', 'Eşleştiriniz.', { pairs, extras: ['Boşaltım', 'Depolama'], rightOrder: [1, 2, 3, 4, 5, 0] })])).not.toContain('matching')
  })
})

test.describe('A9 and polish rules found in the real-AI audit', () => {
  test('"Verilen tarih ve süreleri kullanarak" without the data in the question is a dangling reference; with a scenario that holds it, it passes', () => {
    const dangling = q('open-ended', 'Verilen tarih ve süreleri kullanarak kuşatmanın uzun sürdüğünü savununuz.')
    expect(idsOf([dangling], 'reference')).toEqual([dangling.id])
    const printed = q('open-ended', 'Verilen tarih ve süreleri kullanarak kuşatmanın uzun sürdüğünü savununuz.', { context: 'Kuşatma 6 Nisan 1453 tarihinde başladı ve 29 Mayıs 1453 tarihinde, yaklaşık elli üç gün sonra, kent alındı.' })
    expect(idsOf([printed], 'reference')).toEqual([])
    expect(idsOf([q('short-answer', 'Haritada gösterilen nehir hangisidir?')], 'reference')).toHaveLength(1)
  })

  test('a false true-false statement written as a plain negation is caught, a changed detail is not', () => {
    const tf = (stem: string, answerBool: boolean) => q('true-false', stem, { answerBool, answer: String(answerBool) })
    expect(idsOf([tf('Olay, kişilerin başından geçen durumlar değil, hikâyenin geçtiği yerdir.', false)], 'tf-claims')).toHaveLength(1)
    expect(idsOf([tf('The cell wall is not found in plant cells at all.', false)], 'tf-claims')).toHaveLength(1)
    expect(idsOf([tf('Olay, hikâyenin geçtiği yerdir.', false)], 'tf-claims')).toEqual([])
    // A true statement may use "değil".
    expect(idsOf([tf('Hücre zarı cansız değil, canlı bir yapıdır.', true)], 'tf-claims')).toEqual([])
  })
})

test.describe('A1: a short answer that only shares words with its question is not a giveaway', () => {
  test('a definition pair is fine, a copied term or phrase is not', () => {
    const sign = q('short-answer', 'Soru bildiren cümlenin sonuna hangi işaret konur?', { answer: 'Soru işareti', topic: 'Noktalama' })
    expect(idsOf([sign], 'answer-leak')).toEqual([])
    const copiedTerm = q('short-answer', 'Hücrenin enerji santrali olan mitokondri hangi görevi üstlenir mitokondri?', { answer: 'mitokondri' })
    expect(idsOf([copiedTerm], 'answer-leak')).toEqual([copiedTerm.id])
    const copiedPhrase = q('short-answer', 'Hücrede protein yapan organel olan endoplazmik retikulum granüllü müdür?', { answer: 'endoplazmik retikulum' })
    expect(idsOf([copiedPhrase], 'answer-leak')).toEqual([copiedPhrase.id])
  })
})
