import { expect, test } from '@playwright/test'

import { restoreLatex, sanitizeExamQuestion, sanitizeExamQuestions } from '../../api/_lib/exam'
import type { ExamGenerationRequest } from '../../api/_lib/exam'
import { distributePoints } from '../../src/lib/exam/points'
import { SOFT_RULES, checkExamQuality, conceptCapacity, pairKey, repeatedTerms, repeatsExistingQuestion, termLimit, trueFalseRange } from '../../src/lib/exam/quality'
import type { ExamQualityRule } from '../../src/lib/exam/quality'
import { emptyCounts } from '../../src/lib/exam/types'
import type { ExamQuestion, ExamQuestionType } from '../../src/lib/exam/types'

// Whole-exam quality rules (pure logic, no browser): each rule has a case that fails and one that passes.

let serial = 0

function q(type: ExamQuestionType, stem: string, extra: Partial<ExamQuestion> = {}): ExamQuestion {
  serial += 1
  const base: ExamQuestion = { id: `q${serial}`, type, stem, answer: `Cevap numarası ${serial}`, rubric: [{ text: 'Doğru cevap', points: 1 }], points: 0, topic: 'Konu', difficulty: 'medium', lines: 0 }
  if (type === 'true-false') return { ...base, answerBool: true, answer: 'true', ...extra }
  if (type === 'mcq') return { ...base, options: ['Birinci seçenek', 'İkinci seçenek', 'Üçüncü seçenek', 'Dördüncü seçenek'], answerIndex: 0, ...extra }
  return { ...base, ...extra }
}

function rulesOf(questions: ExamQuestion[], counts: Record<ExamQuestionType, number> | null = null): ExamQualityRule[] {
  return checkExamQuality(questions, counts).filter((issue) => issue.rule !== 'points').map((issue) => issue.rule)
}

function idsOf(questions: ExamQuestion[], rule: ExamQualityRule): string[] {
  return checkExamQuality(questions, null).filter((issue) => issue.rule === rule).map((issue) => issue.id ?? '')
}

test.describe('count rule', () => {
  const counts = { ...emptyCounts(), 'short-answer': 2, mcq: 1 }

  test('fails when a type is short or over, naming the type', () => {
    const questions = [q('short-answer', 'Birinci soru metni nedir ve ne işe yarar?'), q('mcq', 'Hangisi doğrudur diye sorulan çoktan seçmeli soru?')]
    const issues = checkExamQuality(questions, counts).filter((issue) => issue.rule === 'count')
    expect(issues).toEqual([{ rule: 'count', id: null, type: 'short-answer' }])
    expect(rulesOf([...questions, q('mcq', 'Tamamen başka bir konuda ikinci çoktan seçmeli soru')], counts)).toContain('count')
  })

  test('passes when every type has exactly the requested number', () => {
    const questions = [q('short-answer', 'Hücre zarının görevi nedir, kısaca yazınız?'), q('short-answer', 'Ribozomlarda hangi madde sentezlenir söyleyiniz?'), q('mcq', 'Aşağıdakilerden hangisi enerji santralidir diye sorulan soru?')]
    expect(rulesOf(questions, counts)).not.toContain('count')
  })
})

test.describe('duplicate rule', () => {
  test('fails for the same fact asked twice, even with different suffixes', () => {
    const a = q('short-answer', 'Kurultay hangi konularda karar verirdi?')
    const b = q('short-answer', 'Kurultayın hangi konularda karar verdiği nedir?')
    expect(idsOf([a, b], 'duplicate')).toEqual([b.id])
  })

  test('fails for an identical stem in two different types', () => {
    const a = q('open-ended', 'x^2 + 5x + 6 = 0 denkleminin köklerini bulunuz ve işlemleri gösteriniz.')
    const b = q('short-answer', 'x^2 + 5x + 6 = 0 denkleminin köklerini bulunuz ve işlemleri gösteriniz.')
    expect(idsOf([a, b], 'duplicate')).toEqual([b.id])
  })

  test('fails for two matching questions that ask the same terms', () => {
    const pairs = [
      { left: 'Kurultay', right: 'Danışma meclisi' },
      { left: 'Töre', right: 'Yazısız kurallar' },
      { left: 'Kağan', right: 'Hükümdar' },
      { left: 'Yabgu', right: 'Yardımcı yönetici' },
    ]
    const a = q('matching', 'Eşleştiriniz.', { pairs })
    const b = q('matching', 'Kavramları karşılıklarıyla eşleştiriniz.', { pairs: pairs.map((pair) => ({ ...pair })) })
    expect(idsOf([a, b], 'duplicate')).toEqual([b.id])
  })

  test('passes for questions about different facts', () => {
    const a = q('short-answer', 'Kurultay hangi konularda karar verirdi?')
    const b = q('short-answer', 'Orhun yazıtlarını hangi alfabe ile yazılmıştır?')
    expect(idsOf([a, b], 'duplicate')).toEqual([])
  })
})

test.describe('same-answer rule', () => {
  test('fails when two questions share the correct answer, across types', () => {
    const a = q('short-answer', 'Türk devletlerinde danışma meclisine ne ad verilirdi?', { answer: 'Kurultay' })
    const b = q('mcq', 'Hükümdarın seçiminde son sözü hangi kurul söylerdi?', { options: ['Kurultay', 'Divan', 'Yabgu', 'Tuğ'], answerIndex: 0, answer: 'Kurultay' })
    expect(idsOf([a, b], 'same-answer')).toEqual([b.id])
  })

  test('passes for different answers and ignores very short answers such as numbers', () => {
    const a = q('short-answer', 'Birinci sorunun tamamen farklı ifadesi şudur?', { answer: 'Kurultay' })
    const b = q('short-answer', 'İkinci soruyu bambaşka kelimelerle yazdık burada?', { answer: 'Divan' })
    const c = q('fill-blanks', 'Toplamları on iki olan iki sayıdan biri ___ olabilir.', { answer: '5' })
    const d = q('fill-blanks', 'Çarpımı otuz olan sayılardan biri ___ olabilir tabii.', { answer: '5' })
    expect(idsOf([a, b, c, d], 'same-answer')).toEqual([])
  })
})

test.describe('true-false balance rule', () => {
  const tf = (answerBool: boolean, index: number) => q('true-false', `Bambaşka ${index}. ifade hakkında farklı kelimelerle yazılmış cümle ${'abcdefg'[index]}${index * 7}`, { answerBool, answer: String(answerBool) })

  test('allowed range keeps 40-60 % true and never all true', () => {
    expect(trueFalseRange(1)).toEqual([0, 0])
    expect(trueFalseRange(2)).toEqual([0, 1])
    expect(trueFalseRange(3)).toEqual([1, 2])
    expect(trueFalseRange(4)).toEqual([2, 2])
    expect(trueFalseRange(5)).toEqual([2, 3])
    expect(trueFalseRange(10)).toEqual([4, 6])
  })

  test('fails when most are true: the surplus statements are reported', () => {
    const questions = [true, true, true, true, true].map(tf)
    expect(idsOf(questions, 'true-false-balance')).toEqual([questions[3].id, questions[4].id])
  })

  test('fails when most are false, and when a short list has no false statement', () => {
    expect(idsOf([false, false, false, false, true].map(tf), 'true-false-balance')).toHaveLength(1)
    expect(idsOf([true, true].map(tf), 'true-false-balance')).toHaveLength(1)
    expect(idsOf([true].map(tf), 'true-false-balance')).toHaveLength(1)
  })

  test('passes for a balanced list', () => {
    expect(idsOf([true, false, true, false, false].map(tf), 'true-false-balance')).toEqual([])
    expect(idsOf([true, false].map(tf), 'true-false-balance')).toEqual([])
    expect(idsOf([true, false, false].map(tf), 'true-false-balance')).toEqual([])
  })
})

test.describe('reference rule', () => {
  test('fails for "Bu modele göre" when the question holds no model', () => {
    expect(idsOf([q('short-answer', 'Bu modele göre hücre zarından hangi madde geçemez?')], 'reference')).toHaveLength(1)
    expect(idsOf([q('mcq', 'Yukarıdaki tabloda hangi element en ağırdır?')], 'reference')).toHaveLength(1)
    expect(idsOf([q('short-answer', 'Şekle göre hangi organel enerji üretir?', { context: 'Kısa bir senaryo.' })], 'reference')).toHaveLength(1)
    expect(idsOf([q('short-answer', 'Metne göre savaşın nedeni nedir?')], 'reference')).toHaveLength(1)
    expect(idsOf([q('short-answer', 'According to the table, which metal melts first?')], 'reference')).toHaveLength(1)
  })

  test('passes when the scenario holds the referred content', () => {
    const model = q('short-answer', 'Bu modele göre hücre zarından hangi madde geçemez?', { context: 'Aşağıdaki modelde seçici geçirgen bir zar ve iki taraftaki derişimler gösterilmiştir.' })
    const text = q('short-answer', 'Metne göre savaşın nedeni nedir?', { context: 'Köylüler, yıllarca süren kuraklıktan sonra ürünlerinin yarısını kaybetti ve şehre göç etti.' })
    expect(idsOf([model, text], 'reference')).toEqual([])
  })

  test('fails for "calculate" without any number to calculate with, passes with the numbers in stem, scenario or options', () => {
    expect(idsOf([q('short-answer', 'Calculate the density of the metal block and include the correct unit.')], 'reference')).toHaveLength(1)
    expect(idsOf([q('short-answer', 'Bu fonksiyonun tepe noktasının apsisini hesaplayınız.')], 'reference')).toHaveLength(1)
    expect(idsOf([q('short-answer', 'Calculate the density of a block with a mass of 200 g and a volume of 50 cm3.')], 'reference')).toEqual([])
    expect(idsOf([q('short-answer', 'Calculate the density of the block.', { context: 'A block has a mass of 200 grams and a volume of 50 cubic centimetres.' })], 'reference')).toEqual([])
    expect(idsOf([q('mcq', 'Which value do you calculate for the discriminant?', { options: ['4', '8', '12', '16'] })], 'reference')).toEqual([])
  })

  test('passes for a topic that merely contains the word (no demonstrative)', () => {
    expect(idsOf([q('short-answer', 'Bohr atom modelinde elektronlar nerede bulunur?'), q('short-answer', 'Tablo veya grafik çizerken hangi eksen bağımsız değişkeni gösterir?')], 'reference')).toEqual([])
  })
})

test.describe('scenario rule', () => {
  const shared = 'Ayşe sabah okula giderken yolda bir kuş yuvası gördü ve yuvanın yanında durdu.'

  test('fails when the same scenario sentence is used in two questions', () => {
    const a = q('short-answer', 'Birinci soru bambaşka konuda yazılmıştır burada?', { context: `${shared} Kuşlar neden yuva yapar?` })
    const b = q('short-answer', 'İkinci soru tamamen başka konuyu sorar bu kez?', { context: `Akşam olunca ev ödevine döndü. ${shared}` })
    expect(idsOf([a, b], 'scenario')).toEqual([b.id])
  })

  test('fails for scenarios that are near copies with other names', () => {
    const a = q('short-answer', 'Birinci soru bambaşka konuda yazılmıştır burada?', { context: 'Mehmet markette alışveriş yaparken kasada indirimli ürünlerin fiyatlarını karşılaştırdı.' })
    const b = q('short-answer', 'İkinci soru tamamen başka konuyu sorar bu kez?', { context: 'Mehmet markette alışveriş yaparken kasada indirimli ürünlerin fiyatlarını hesapladı.' })
    expect(idsOf([a, b], 'scenario')).toEqual([b.id])
  })

  test('passes for different scenarios', () => {
    const a = q('short-answer', 'Birinci soru bambaşka konuda yazılmıştır burada?', { context: 'Mehmet markette alışveriş yaparken indirimli ürünlere baktı.' })
    const b = q('short-answer', 'İkinci soru tamamen başka konuyu sorar bu kez?', { context: 'Zeynep laboratuvarda deney tüpündeki sıvının rengini gözlemledi.' })
    expect(idsOf([a, b], 'scenario')).toEqual([])
  })
})

test.describe('scenario retold in the stem', () => {
  test('fails when the stem repeats the scenario, passes when it only builds on it', () => {
    const context = 'Bir tarihçi, eski Türk devletlerinin geçmişini araştırırken sekizinci yüzyılda dikilmiş yazıtları inceliyor.'
    const retold = q('fill-blanks', 'Bir tarihçi, eski Türk devletlerinin geçmişini araştırırken sekizinci yüzyılda dikilmiş yazıtları inceliyor. Bu yazıtlara ___ denir.', { context, answer: 'Orhun Yazıtları' })
    const fine = q('fill-blanks', 'İncelenen bu yazıtlara genel olarak ___ adı verilir.', { context, answer: 'Orhun Yazıtları' })
    expect(idsOf([retold], 'scenario')).toEqual([retold.id])
    expect(idsOf([fine], 'scenario')).toEqual([])
    // The same sentence with a word added or dropped is still the same sentence.
    const reworded = q('short-answer', 'Bir tarihçi, Göktürklerin geçmişteki bağımsızlık anlayışını ve devletin zayıflama sebeplerini araştırmaktadır. Hangi yazılı kaynaklardan yararlanmalıdır?', { context: 'Tarihçi, Göktürklerin geçmişteki bağımsızlık anlayışını ve devletin zayıflama sebeplerini araştırmaktadır.' })
    expect(idsOf([reworded], 'scenario')).toEqual([reworded.id])
  })
})

test.describe('term-repeat rule (soft)', () => {
  const about = (term: string, index: number) => q('short-answer', `${['Birinci', 'İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci', 'Altıncı', 'Yedinci', 'Sekizinci'][index]} soruda ${term} hakkında farklı bir olgu sorar`, { answer: `Cevap ${index}` })

  test('is a soft rule', () => {
    expect(SOFT_RULES).toContain('term-repeat')
    expect(termLimit(19)).toBe(3)
    expect(termLimit(5)).toBe(3)
  })

  test('flags the questions after the limit when one term is behind too many of them, and names the term', () => {
    const repeated = [0, 1, 2, 3, 4].map((index) => about('kurultayın', index))
    const others = [5, 6, 7].map((index) => about(['coğrafyanın', 'ekonominin', 'mimarinin'][index - 5], index))
    const all = [...repeated, ...others, ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => q('short-answer', `Alakasız ${index} soru için ayrı ${'abcdefghijkl'[index]}${index}konu${index} yazıldı`))]
    const ids = idsOf(all, 'term-repeat')
    expect(ids).toEqual(repeated.slice(termLimit(all.length)).map((question) => question.id))
    expect(repeatedTerms(all)).toEqual(['kurultayın'])
  })

  test('short proper names count too: four questions about "Avar" are one too many', () => {
    const about4 = [0, 1, 2, 3].map((index) => q('short-answer', `Soru ${index + 1} için bambaşka giriş: Bumin Kağan'ın sona erdirdiği ${['egemenlik', 'yönetim', 'ordu', 'düzen'][index]} hangi Avar topluluğuna aittir?`, { answer: `Cevap ${index}` }))
    const filler = Array.from({ length: 15 }, (_, offset) => offset + 4).map((index) => q('short-answer', `Başka ${index} sorusu farklı kelimeler ${'mnopqrstuvwxyzab'[index - 4]}${index}sözcük${index} içerir`))
    expect(idsOf([...about4, ...filler], 'term-repeat')).toEqual([about4[3].id])
  })

  test('passes at the limit, for generic question words and for the teacher\'s own topics', () => {
    const atLimit = [0, 1, 2].map((index) => about('kurultayın', index))
    const filler = Array.from({ length: 16 }, (_, offset) => offset + 3).map((index) => q('short-answer', `Başka ${index} sorusu farklı kelimeler ${'mnopqrstuvwxyzab'[index - 3]}${index}sözcük${index} içerir`))
    expect(idsOf([...atLimit, ...filler], 'term-repeat')).toEqual([])
    const generic = Array.from({ length: 6 }, (_, index) => q('mcq', `Aşağıdakilerden hangisi ${index} numaralı ${'abcdef'[index]}${index}konu${index} örneğidir?`))
    expect(idsOf(generic, 'term-repeat')).toEqual([])
    const topical = [0, 1, 2, 3, 4].map((index) => about('kurultayın', index))
    expect(checkExamQuality([...topical, ...filler], null, { topics: ['Kurultay'] }).filter((issue) => issue.rule === 'term-repeat')).toEqual([])
  })
})

test.describe('blank-leak rule', () => {
  test('fails when the answer is in the sentence, also with a suffix or in the scenario', () => {
    expect(idsOf([q('fill-blanks', 'Kurultay toplantısında alınan kararlara ___ denirdi.', { answer: 'Kurultay' })], 'blank-leak')).toHaveLength(1)
    expect(idsOf([q('fill-blanks', 'Kurultayda alınan kararlar hükümdarı bağlar; bu meclise ___ denir.', { answer: 'kurultay' })], 'blank-leak')).toHaveLength(1)
    expect(idsOf([q('fill-blanks', 'Bu meclise ___ denir.', { answer: 'kurultay', context: 'Kurultay toplandı ve karar verdi.' })], 'blank-leak')).toHaveLength(1)
    expect(idsOf([q('fill-blanks', 'Meclis toplantısına ___ denir.', { answer: 'Büyük Millet Meclisi', acceptableAnswers: ['TBMM', 'Büyük Millet Meclisi'], context: 'Büyük Millet Meclisi açıldı.' })], 'blank-leak')).toHaveLength(1)
  })

  test('passes when the answer is not in the sentence', () => {
    expect(idsOf([q('fill-blanks', 'Türklerde danışma meclisine ___ denirdi.', { answer: 'Kurultay', acceptableAnswers: ['Toy'] })], 'blank-leak')).toEqual([])
  })
})

test.describe('points rule', () => {
  const base = () => distributePoints([q('short-answer', 'İlk soru oldukça kısa bir sorudur burada?'), q('open-ended', 'İkinci soru bambaşka konuyu sorar bu seferde?', { rubric: [{ text: 'a', points: 2 }, { text: 'b', points: 1 }] })], 100)

  test('passes when the total is 100 and every rubric adds up to its question', () => {
    expect(checkExamQuality(base(), null).filter((issue) => issue.rule === 'points')).toEqual([])
  })

  test('fails when the total is not 100', () => {
    const questions = base()
    questions[0] = { ...questions[0], points: questions[0].points - 1 }
    expect(checkExamQuality(questions, null).some((issue) => issue.rule === 'points')).toBe(true)
  })

  test('fails when a rubric does not add up to the question points, or is empty', () => {
    const questions = base()
    questions[1] = { ...questions[1], rubric: questions[1].rubric.map((item) => ({ ...item, points: item.points + 1 })) }
    expect(checkExamQuality(questions, null).some((issue) => issue.rule === 'points')).toBe(true)
    const empty = base()
    empty[0] = { ...empty[0], rubric: [] }
    expect(checkExamQuality(empty, null).some((issue) => issue.rule === 'points')).toBe(true)
  })
})

test.describe('a replacement question', () => {
  const others = [q('short-answer', 'Kurultay hangi konularda karar verirdi?', { answer: 'Savaş ve barış' }), q('short-answer', 'Orhun yazıtlarını hangi alfabe ile yazılmıştır?', { answer: 'Göktürk alfabesi' })]

  test('is rejected when it repeats another question or its answer', () => {
    expect(repeatsExistingQuestion(q('short-answer', 'Kurultayın hangi konularda karar verdiği nedir?'), others)).toBe(true)
    expect(repeatsExistingQuestion(q('short-answer', 'Yazıtların dili ve alfabesi nedir diye merak edilir?', { answer: 'Göktürk alfabesi' }), others)).toBe(true)
  })

  test('is accepted when it asks something new', () => {
    expect(repeatsExistingQuestion(q('short-answer', 'Kağan ölünce yerine kim geçerdi?', { answer: 'Oğlu veya kardeşi' }), others)).toBe(false)
  })
})

test.describe('server reply filter', () => {
  const request: ExamGenerationRequest = {
    text: 'kaynak',
    type: 'short-answer',
    course: '',
    slots: [],
    variety: [],
    avoidFacts: [],
    difficulty: { easy: 0, medium: 4, hard: 0 },
    level: '9',
    outputLanguage: 'tr',
    contextBased: true,
    optionsCount: 4,
    topics: [],
    avoidStems: [],
    avoidAnswers: ['Kurultay'],
    avoidTerms: [],
    avoidConcepts: [],
    facts: [],
    trueFalseAnswers: [],
    partIndex: 0,
    partCount: 1,
  }
  const item = (stem: string, answer: string, extra: Record<string, unknown> = {}) => ({ type: 'short-answer', stem, answer, rubric: [{ text: 'a', weight: 1 }], topic: 't', difficulty: 'medium', lines: 2, ...extra })

  test('drops a question whose answer is already on the exam, a repeat inside the reply and a dangling reference', () => {
    const reply = {
      questions: [
        item('Hükümdar seçiminde danışma meclisinin adı nedir?', 'Kurultay'),
        item('Orhun yazıtlarını hangi alfabe ile yazılmıştır?', 'Göktürk alfabesi'),
        item('Orhun yazıtlarının yazıldığı alfabe hangisidir söyleyiniz?', 'Göktürk alfabesi'),
        item('Bu modele göre hangi devlet en eskidir?', 'Hunlar'),
        item('Türklerde yazısız hukuk kurallarına ne ad verilirdi?', 'Töre'),
      ],
    }
    const kept = sanitizeExamQuestions(reply, request, 4).map((question) => question.answer)
    expect(kept).toEqual(['Göktürk alfabesi', 'Töre'])
  })

  test('with trueFalseAnswer set, keeps only statements with that answer', () => {
    const tfRequest: ExamGenerationRequest = { ...request, type: 'true-false', avoidAnswers: [], trueFalseAnswer: false }
    const tf = (stem: string, answerBool: boolean) => ({ type: 'true-false', stem, answerBool, rubric: [{ text: 'a', weight: 1 }], topic: 't', difficulty: 'medium' })
    const kept = sanitizeExamQuestions({ questions: [tf('Birinci ifade hakkında bir cümle yazılmıştır burada.', true), tf('Tamamen farklı ikinci ifade hakkında başka cümle.', false)] }, tfRequest, 2)
    expect(kept.map((question) => question.answerBool)).toEqual([false])
  })
})

test.describe('fact ids and the key-term check', () => {
  const facts = [
    { id: 'f1', fact: 'Mitokondri hücrenin enerji santralidir ve ATP üretir.', topic: 'Hücre' },
    { id: 'f2', fact: 'Ribozomlar protein sentezlenen yapılardır ve sitoplazmada bulunur.', topic: 'Hücre' },
  ]
  const request: ExamGenerationRequest = {
    text: 'kaynak',
    type: 'short-answer',
    course: '',
    slots: [],
    variety: [],
    avoidFacts: [],
    difficulty: { easy: 2, medium: 0, hard: 0 },
    level: '9',
    outputLanguage: 'tr',
    contextBased: false,
    optionsCount: 4,
    topics: [],
    avoidStems: [],
    avoidAnswers: [],
    avoidTerms: [],
    avoidConcepts: [],
    facts,
    trueFalseAnswers: [],
    partIndex: 0,
    partCount: 1,
  }
  const item = (stem: string, answer: string, factId: string, fact: string) => ({ type: 'short-answer', stem, answer, rubric: [{ text: 'a', weight: 1 }], topic: 'Hücre', difficulty: 'easy', lines: 1, factId, fact })

  test('the writer returns the fact id and the question is bound to that fact', () => {
    const kept = sanitizeExamQuestions({ questions: [item('Hücrede ATP üretiminin yapıldığı organel hangisidir?', 'Mitokondri', 'f1', facts[0].fact), item('Protein sentezinin yapıldığı yapı nedir?', 'Ribozom', 'f2', facts[1].fact)] }, request, 2)
    expect(kept.map((question) => question.factId)).toEqual(['f1', 'f2'])
  })

  test('a question that carries none of its fact’s key terms drifted to another fact and is rejected', () => {
    const drifted = item('Bitki hücrelerinde klorofil hangi organelde bulunur?', 'Kloroplast', 'f1', facts[0].fact)
    const kept = sanitizeExamQuestions({ questions: [drifted, item('Protein sentezinin yapıldığı yapı nedir?', 'Ribozom', 'f2', facts[1].fact)] }, request, 2)
    expect(kept.map((question) => question.factId)).toEqual(['f2'])
  })

  test('a second question that claims an id already taken does not get another fact’s place', () => {
    const kept = sanitizeExamQuestions({ questions: [item('Protein sentezinin yapıldığı yapı nedir?', 'Ribozom', 'f2', facts[1].fact), item('Ribozomlar proteinleri nerede sentezler, sitoplazmada mı?', 'Sitoplazma', 'f2', facts[1].fact)] }, request, 2)
    expect(kept.map((question) => question.factId)).toEqual(['f2'])
  })
})

test.describe('same worked fact in another type', () => {
  test('fails when two questions work on the same numbers in mostly the same words', () => {
    const a = q('open-ended', 'Kökleri $4$ ve $-1$ olan ikinci dereceden denklemi, baş katsayısı $1$ olacak biçimde oluşturunuz.')
    const b = q('short-answer', 'Kökleri $4$ ve $-1$ olan ikinci dereceden denklemi kökler toplamı ve çarpımını kullanarak yazınız.')
    const c = q('true-false', 'Bu koşullardaki denklem $x^2-3x-4=0$ biçimindedir.', { context: 'Bir öğretmen, kökleri $4$ ve $-1$ olan ikinci dereceden denklemi baş katsayı $1$ olacak şekilde yazmak istiyor.' })
    expect(idsOf([a, b, c], 'duplicate')).toEqual([b.id, c.id])
  })

  test('passes for different numbers or a shared number only', () => {
    const a = q('short-answer', 'Kökleri $4$ ve $-1$ olan ikinci dereceden denklemi yazınız.')
    const b = q('short-answer', 'Kökleri $2$ ve $5$ olan ikinci dereceden denklemi yazınız.')
    const c = q('short-answer', 'Kökleri $4$ ve $7$ olan ikinci dereceden denklemi yazınız.')
    expect(idsOf([a, b, c], 'duplicate')).toEqual([])
  })
})

test.describe('what the model hands back', () => {
  test('a LaTeX command swallowed by JSON escapes is restored', () => {
    // JSON.parse turns \frac into form feed + "rac", \theta into tab + "heta", \right into carriage return + "ight".
    const broken = JSON.parse('"p $\\frac{c}{a}$ $\\theta$ $\\right)$"') as string
    expect(broken).toContain('\f')
    expect(restoreLatex(broken)).toBe('p $\\frac{c}{a}$ $\\theta$ $\\right)$')
    expect(restoreLatex('Δ=0 ve düz metin')).toBe('Δ=0 ve düz metin')
    expect(restoreLatex('ilk satır\nikinci satır')).toBe('ilk satır\nikinci satır')
  })

  test('multiple-choice options are mixed and the key follows the right option', () => {
    const positions = new Set<number>()
    for (let run = 0; run < 40; run += 1) {
      const question = sanitizeExamQuestion({ type: 'mcq', stem: 'Hangisi?', options: ['Doğru', 'Yanlış bir', 'Yanlış iki', 'Yanlış üç'], answerIndex: 0, topic: 't', difficulty: 'easy' }, 'mcq', 4, false)!
      expect(question.options![question.answerIndex!]).toBe('Doğru')
      expect(question.answer).toBe('Doğru')
      positions.add(question.answerIndex!)
    }
    expect(positions.size).toBeGreaterThan(1)
  })

  test('options that depend on their order stay as written', () => {
    const question = sanitizeExamQuestion({ type: 'mcq', stem: 'Hangisi?', options: ['Yalnız I', 'Yalnız II', 'I ve II', 'Hiçbiri'], answerIndex: 2, topic: 't', difficulty: 'easy' }, 'mcq', 4, false)!
    expect(question.options).toEqual(['Yalnız I', 'Yalnız II', 'I ve II', 'Hiçbiri'])
    expect(question.answerIndex).toBe(2)
  })
})

test.describe('concepts: the same skill with other numbers', () => {
  const skill = (type: ExamQuestionType, fact: string, difficulty: 'easy' | 'medium' | 'hard', stem: string, extra: Partial<ExamQuestion> = {}) =>
    q(type, stem, { fact, concept: 'İkinci dereceden denklemde diskriminant', difficulty, ...extra })

  test('capacity counts a concept at most twice and a fact without a concept once', () => {
    expect(conceptCapacity([{ concept: 'A' }, { concept: 'A' }, { concept: 'A' }, { concept: 'B' }, {}, {}])).toBe(5)
    expect(conceptCapacity([{ concept: 'Diskriminant' }, { concept: ' diskriminant ' }, { concept: 'DİSKRİMİNANT' }])).toBe(2)
    expect(conceptCapacity([])).toBe(0)
  })

  test('two questions on one skill with other numbers are allowed when they differ in type or difficulty', () => {
    const a = skill('short-answer', 'x²−5x+6=0 denkleminin diskriminantı 1 olur', 'easy', '$x^2-5x+6=0$ denkleminin diskriminantını hesaplayınız.')
    const b = skill('mcq', 'x²+2x+5=0 denkleminin diskriminantı −16 olur', 'medium', '$x^2+2x+5=0$ denkleminin diskriminantı kaçtır?')
    // The facts share words, so the pair goes to the judge; it says they are different (other numbers, another form).
    const verdicts = { judged: new Map([[pairKey(a, b), false]]) }
    const rules = checkExamQuality([a, b], null, verdicts).map((issue) => issue.rule)
    expect(rules).not.toContain('concept-cap')
    expect(rules).not.toContain('duplicate')
    // Without that verdict the close pair is treated as a repeat; the judge decides, never the word count alone.
    expect(rulesOf([a, b])).toContain('duplicate')
    const sameType = skill('short-answer', 'x²+2x+5=0 denkleminin diskriminantı −16 olur', 'easy', '$x^2+2x+5=0$ denkleminin diskriminantını bulunuz.')
    // Same type and same difficulty: the cap's "differ in type or difficulty" condition is not met.
    expect(idsOf([a, sameType], 'concept-cap')).toEqual([sameType.id])
  })

  test('a third question on the same skill is always flagged, whatever it looks like', () => {
    const a = skill('short-answer', 'birinci uygulama diskriminant 1', 'easy', '$x^2-5x+6=0$ denkleminin diskriminantını hesaplayınız.')
    const b = skill('mcq', 'ikinci uygulama diskriminant −16', 'medium', '$x^2+2x+5=0$ denkleminin diskriminantı kaçtır?')
    const c = skill('open-ended', 'üçüncü uygulama diskriminant 0', 'hard', '$x^2+4x+4=0$ denkleminin kökleri için diskriminantın anlamını açıklayınız.')
    expect(idsOf([a, b, c], 'concept-cap')).toEqual([c.id])
  })

  test('the same question again is never allowed: same fact is a duplicate, even inside the cap', () => {
    const a = skill('short-answer', 'x²−5x+6=0 denkleminin diskriminantı 1 olur', 'easy', '$x^2-5x+6=0$ denkleminin diskriminantını hesaplayınız.')
    const again = skill('mcq', 'x²−5x+6=0 denkleminin diskriminantı 1 olur', 'medium', '$x^2-5x+6=0$ denkleminde diskriminant kaçtır?')
    expect(idsOf([a, again], 'duplicate')).toEqual([again.id])
    expect(idsOf([a, again], 'concept-cap')).toEqual([])
  })

  test('questions without a concept are never grouped', () => {
    const plain = [0, 1, 2].map((index) => q('short-answer', `Bambaşka ${index} soru metni ${'abc'[index]}${index}sözcük farklı olgu`, { difficulty: 'easy' }))
    expect(idsOf(plain, 'concept-cap')).toEqual([])
  })
})

test.describe('scenario rule: the stem does not retell the scenario', () => {
  test('a stem that opens with the same person as the scenario fails; one that starts with the question passes', () => {
    const retold = q('mcq', 'Zeynep, kütüphanedeki etkinlikte çekirdek zarı olmayan bir canlı grubu görüyor. Hangisi bu gruba örnektir?', { context: 'Zeynep, şehir kütüphanesinde canlıların hücre yapılarını sınıflandıran bir etkinliğe katılıyor.' })
    expect(idsOf([retold], 'scenario')).toEqual([retold.id])
    const clean = q('mcq', 'Bu etkinlikte çekirdek zarı olmayan canlı grubu için hangisi örnektir?', { context: 'Zeynep, şehir kütüphanesinde canlıların hücre yapılarını sınıflandıran bir etkinliğe katılıyor.' })
    expect(idsOf([clean], 'scenario')).toEqual([])
  })
})
