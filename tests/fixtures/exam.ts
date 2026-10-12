import { defaultExamSettings } from '../../src/lib/exam/types'
import type { ExamDifficulty, ExamQuestion, WrittenExam } from '../../src/lib/exam/types'

/** A complete written exam with every question type (LaTeX, Turkish letters, groups on); 100 points over 22 questions, three or more printed pages. */

function split(points: number, texts: string[]) {
  const base = Math.floor(points / texts.length)
  return texts.map((text, index) => ({ text, points: index === 0 ? points - base * (texts.length - 1) : base }))
}

function open(index: number, difficulty: ExamDifficulty): ExamQuestion {
  return {
    id: `open-${index}`,
    type: 'open-ended',
    stem: `Fotosentezin ışığa bağımlı evresini, kloroplastın hangi bölümünde gerçekleştiğini belirterek açıklayınız. (Örnek ${index})`,
    context: index === 1 ? 'Ayşe, pencere önündeki fesleğenin yaprakları şişlik kazanınca ışığın bitki için önemini merak etti.' : undefined,
    answer: 'Işığa bağımlı evre tilakoit zarlarda gerçekleşir; ışık enerjisi ATP ve NADPH üretiminde kullanılır, oksijen açığa çıkar.',
    rubric: split(10, ['Tilakoit zarını belirtir', 'ATP ve NADPH üretimini açıklar', 'Oksijenin açığa çıktığını söyler']),
    points: 10,
    topic: 'Fotosentez',
    difficulty,
    lines: 6,
  }
}

export function sampleQuestions(): ExamQuestion[] {
  const questions: ExamQuestion[] = [open(1, 'medium'), open(2, 'hard'), open(3, 'easy'), open(4, 'medium')]
  for (let i = 1; i <= 3; i += 1) {
    questions.push({
      id: `short-${i}`,
      type: 'short-answer',
      stem: `$x^2 + \\frac{1}{2}x = \\sqrt{${i + 3}}$ denkleminin kaç çözümü olabileceğini kısaca yazınız.`,
      answer: 'En fazla iki gerçek çözümü vardır.',
      acceptableAnswers: ['2 çözüm'],
      rubric: split(5, ['Doğru sonuç', 'Kısa gerekçe']),
      points: 5,
      topic: 'İkinci derece denklemler',
      difficulty: 'medium',
      lines: 2,
    })
  }
  for (let i = 1; i <= 3; i += 1) {
    questions.push({
      id: `fill-${i}`,
      type: 'fill-blanks',
      stem: `Işık enerjisini kimyasal enerjiye çeviren organel ___ adını alır. (${i})`,
      answer: 'kloroplast',
      acceptableAnswers: ['kloroplastlar'],
      rubric: [{ text: 'Doğru terim', points: 3 }],
      points: 3,
      topic: 'Hücre organelleri',
      difficulty: 'easy',
      lines: 0,
    })
  }
  for (let i = 1; i <= 4; i += 1) {
    questions.push({
      id: `tf-${i}`,
      type: 'true-false',
      stem: `Güneş enerjisi yalnızca şişmiş yapraklarda ğüşıöçİ kullanılır. (${i})`,
      answer: i % 2 ? 'Doğru' : 'Yanlış',
      answerBool: i % 2 === 1,
      rubric: [{ text: 'Doğru işaretleme', points: 2 }],
      points: 2,
      topic: 'Enerji dönüşümü',
      difficulty: 'easy',
      lines: 0,
    })
  }
  for (let i = 1; i <= 6; i += 1) {
    questions.push({
      id: `mcq-${i}`,
      type: 'mcq',
      stem: `Aşağıdakilerden hangisi $\\sin^2 x + \\cos^2 x$ ifadesinin değeridir? (${i})`,
      options: i % 2 ? ['0', '1', '2', '$\\pi$'] : ['Birinci seçenek, oldukça uzun bir açıklama cümlesi', 'İkinci seçenek de uzun bir açıklama', 'Üçüncü seçenek', 'Dördüncü seçenek'],
      answerIndex: i % 4,
      answer: '',
      rubric: [{ text: 'Doğru seçenek', points: 3 }],
      points: 3,
      topic: 'Trigonometri',
      difficulty: 'medium',
      lines: 0,
    })
  }
  for (let i = 1; i <= 2; i += 1) {
    questions.push({
      id: `match-${i}`,
      type: 'matching',
      stem: `Aşağıdaki kavramları karşılıklarıyla eşleştiriniz. (${i})`,
      pairs: [
        { left: 'Kloroplast', right: 'Fotosentez' },
        { left: 'Mitokondri', right: 'Hücresel solunum' },
        { left: 'Ribozom', right: 'Protein sentezi' },
        { left: 'Çekirdek', right: 'Kalıtım bilgisi' },
      ],
      rightOrder: [1, 2, 3, 0],
      answer: '',
      rubric: [{ text: 'Doğru eşleştirmeler', points: 5 }],
      points: 5,
      topic: 'Hücre organelleri',
      difficulty: 'hard',
      lines: 0,
    })
  }
  // A unique tag ends every stem, so tests can find a question in extracted PDF text.
  return questions.map((question) => ({ ...question, stem: `${question.stem} [${question.id}]` }))
}

export function sampleExam(overrides: Partial<WrittenExam> = {}): WrittenExam {
  const settings = defaultExamSettings(new Date('2026-10-01T10:00:00Z'))
  settings.header = { school: 'Atatürk Anadolu Lisesi', academicYear: '2026-2027', term: 1, examNo: 1, course: 'Biyoloji', grade: '10', section: 'B', teacher: 'Ayşe Çelik' }
  settings.groups = true
  const now = '2026-10-01T10:00:00.000Z'
  return {
    id: '7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01',
    title: 'Biyoloji · 10. sınıf · 1. dönem 1. yazılı',
    settings,
    questions: sampleQuestions(),
    sourceQuizId: null,
    sourceText: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}
