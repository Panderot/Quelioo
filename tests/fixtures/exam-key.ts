import { computeRightOrder } from '../../src/lib/exam/factory'
import { defaultExamSettings } from '../../src/lib/exam/types'
import type { ExamQuestion, WrittenExam } from '../../src/lib/exam/types'

// A written exam whose correct answers are known: every question type, 4- and 5-option multiple choice, a matching question
// with extra right-column items. `KEY_TRUTH` states each answer by text, independent of positions and letters.

export type Truth =
  | { kind: 'mcq'; stem: string; text: string }
  | { kind: 'tf'; stem: string; value: boolean }
  | { kind: 'text'; stem: string; answer: string }
  | { kind: 'match'; stem: string; map: Record<string, string> }

export const KEY_EXAM_ID = '3c9e1f20-5b7a-4d1e-9f3a-6a2b8c4d0e11'

const PAIRS = [
  { left: 'Mitokondri', right: 'ATP üretimi' },
  { left: 'Ribozom', right: 'Protein sentezi' },
  { left: 'Lizozom', right: 'Hücre içi sindirim' },
  { left: 'Golgi cisimciği', right: 'Paketleme ve salgılama' },
]
const EXTRAS = ['Fotosentez', 'Su depolama']

export function keyQuestions(): ExamQuestion[] {
  const one = (points: number, text = 'Doğru cevap') => [{ text, points }]
  return [
    { id: 'k-open', type: 'open-ended', stem: 'Hücre zarının seçici geçirgen olmasının hücreye yararını açıklayınız.', answer: 'Giren ve çıkan maddeleri denetleyerek iç ortamı korur.', rubric: [{ text: 'Seçici geçirgenliği açıklar', points: 10 }, { text: 'İç ortamın korunmasını belirtir', points: 10 }], points: 20, topic: 'Hücre zarı', difficulty: 'medium', lines: 4 },
    { id: 'k-short', type: 'short-answer', stem: 'Protein sentezini gerçekleştiren yapının adı nedir?', answer: 'Ribozom', acceptableAnswers: ['Ribozom', 'ribozomlar'], rubric: one(10, 'Ribozom'), points: 10, topic: 'Ribozom', difficulty: 'easy', lines: 1 },
    { id: 'k-fill', type: 'fill-blanks', stem: 'Bitki hücrelerinde su depolayan büyük yapıya merkezi ___ denir.', answer: 'koful', rubric: one(10), points: 10, topic: 'Koful', difficulty: 'easy', lines: 0 },
    { id: 'k-tf1', type: 'true-false', stem: 'Kloroplast fotosentez yapan organeldir.', answer: 'true', answerBool: true, rubric: one(10), points: 10, topic: 'Kloroplast', difficulty: 'easy', lines: 0 },
    { id: 'k-tf2', type: 'true-false', stem: 'Lizozom hücrede ATP üreten organeldir.', answer: 'false', answerBool: false, rubric: one(10), points: 10, topic: 'Lizozom', difficulty: 'easy', lines: 0 },
    { id: 'k-mcq4', type: 'mcq', stem: 'Hücrede ATP üreten organel hangisidir?', options: ['Golgi cisimciği', 'Mitokondri', 'Lizozom', 'Ribozom'], answerIndex: 1, answer: 'Mitokondri', rubric: one(10), points: 10, topic: 'Mitokondri', difficulty: 'easy', lines: 0 },
    { id: 'k-mcq5', type: 'mcq', stem: 'Kalıtım materyalini taşıyan yapı hangisidir?', options: ['Çekirdek', 'Koful', 'Hücre duvarı', 'Sentrozom', 'Kloroplast'], answerIndex: 0, answer: 'Çekirdek', rubric: one(10), points: 10, topic: 'Çekirdek', difficulty: 'medium', lines: 0 },
    { id: 'k-match', type: 'matching', stem: 'Organelleri görevleriyle eşleştiriniz.', pairs: PAIRS.map((pair) => ({ ...pair })), extras: [...EXTRAS], rightOrder: computeRightOrder(PAIRS.length, EXTRAS.length, 'k-match'), answer: PAIRS.map((pair) => `${pair.left} = ${pair.right}`).join('; '), rubric: PAIRS.map((pair) => ({ text: `${pair.left} = ${pair.right}`, points: 5 })), points: 20, topic: 'Organeller', difficulty: 'medium', lines: 0 },
  ]
}

export function keyExam(overrides: Partial<WrittenExam> = {}): WrittenExam {
  const settings = defaultExamSettings(new Date('2026-10-13T10:00:00Z'))
  settings.header = { school: 'Atatürk Anadolu Lisesi', academicYear: '2026-2027', term: 1, examNo: 1, course: 'Biyoloji', grade: '9', section: 'A', teacher: 'Deneme Öğretmen' }
  settings.groups = true
  settings.answerKey = true
  settings.outputLanguage = 'tr'
  return { id: KEY_EXAM_ID, title: 'Biyoloji anahtar denemesi', settings, questions: keyQuestions(), sourceQuizId: null, sourceText: '', createdAt: '2026-10-13T10:00:00.000Z', updatedAt: '2026-10-13T10:00:00.000Z', ...overrides }
}

/** The correct answer of every question, by its text (what the key must say whatever the order and the letters). */
export function truthOf(questions: ExamQuestion[]): Truth[] {
  return questions.map((question): Truth => {
    switch (question.type) {
      case 'mcq':
        return { kind: 'mcq', stem: question.stem, text: question.options![question.answerIndex!] }
      case 'true-false':
        return { kind: 'tf', stem: question.stem, value: question.answerBool! }
      case 'matching':
        return { kind: 'match', stem: question.stem, map: Object.fromEntries(question.pairs!.map((pair) => [pair.left, pair.right])) }
      default:
        return { kind: 'text', stem: question.stem, answer: question.answer }
    }
  })
}
