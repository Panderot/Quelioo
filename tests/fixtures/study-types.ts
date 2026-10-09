import type { QuizQuestion } from '../../src/lib/quiz'

/**
 * One seeded question per type and edge case for the Study Mode audit (tests only, no AI call).
 * Every id names what the question exercises.
 */
const LONG = 'Fotosentez sırasında bitkiler güneş ışığını, suyu ve karbondioksiti kullanarak şeker ve oksijen üretir; bu süreç kloroplastların içindeki klorofil pigmentleri sayesinde gerçekleşir ve canlıların neredeyse tamamı için enerji zincirinin başlangıcıdır'

export const TYPE_QUESTIONS: Record<string, QuizQuestion> = {
  mcq2: {
    id: 'mcq2',
    type: 'mcq',
    question: 'Is the Sun a star?',
    explanation: 'The Sun is the star at the centre of our solar system.',
    options: ['Yes, it is a star', 'No, it is a planet'],
    answerIndex: 0,
    hints: ['Think about what produces its own light.', 'It is not a planet.'],
  },
  mcq3: {
    id: 'mcq3',
    type: 'mcq',
    question: 'Which of these is a primary colour of light?',
    explanation: 'Red, green and blue are the primary colours of light.',
    options: ['Yellow', 'Green', 'Purple'],
    answerIndex: 1,
    hints: ['Think about the pixels of a screen.', 'It is the colour of grass.'],
  },
  mcq4: {
    id: 'mcq4',
    type: 'mcq',
    question: `Ğüşöçİ: ${LONG}. Bu cümleye göre bitkiler neyi üretir?`,
    explanation: 'Şeker ve oksijen üretilir.',
    options: ['Yalnızca su', 'Şeker ve oksijen', 'Karbondioksit ve azot', `${LONG}.`],
    answerIndex: 1,
    hints: ['Cümlenin ortasına bak.', 'Bir enerji kaynağı ve bir gaz.'],
  },
  mcq5: {
    id: 'mcq5',
    type: 'mcq',
    question: 'What is $\\frac{1}{2} + \\frac{1}{4}$?',
    explanation: '$\\frac{2}{4} + \\frac{1}{4} = \\frac{3}{4}$',
    options: ['$\\frac{1}{4}$', '$\\frac{2}{4}$', '$\\frac{3}{4}$', '$\\frac{3}{4}$ ', '$1$'],
    answerIndex: 2,
    hints: ['Use a common denominator.', 'Both fractions in quarters.'],
  },
  mcqPlain: {
    id: 'mcqPlain',
    type: 'mcq',
    question: 'Pick the odd one out.',
    explanation: '',
    options: ['Cat', 'Dog', 'Table', 'Horse'],
    answerIndex: 2,
  },
  tf: {
    id: 'tf',
    type: 'true-false',
    question: 'Water boils at 100 degrees Celsius at sea level.',
    explanation: 'This is the standard boiling point.',
    answerBool: true,
  },
  tfNoExplanation: {
    id: 'tfNoExplanation',
    type: 'true-false',
    question: 'The Moon is bigger than the Earth.',
    explanation: '',
    answerBool: false,
  },
  fillTr: {
    id: 'fillTr',
    type: 'fill-blanks',
    question: 'Türkiye\'nin en kalabalık şehri ___ şehridir.',
    explanation: 'İstanbul, Türkiye\'nin en kalabalık şehridir.',
    answer: 'İstanbul',
    acceptableAnswers: ['İstanbul', 'İstanbul\'un'],
    hints: ['Boğaz bu şehirden geçer.', 'İ ile başlar.'],
  },
  fillDotless: {
    id: 'fillDotless',
    type: 'fill-blanks',
    question: 'Güneşten gelen ___ enerjisi bitkiler için gereklidir.',
    explanation: 'Işık enerjisi.',
    answer: 'ışık',
    acceptableAnswers: ['ışık'],
    hints: ['Gözümüzle görürüz.', 'I ile başlar.'],
  },
  fillNumber: {
    id: 'fillNumber',
    type: 'fill-blanks',
    question: 'A century has ___ years.',
    explanation: 'A century is one hundred years.',
    answer: '100',
    acceptableAnswers: ['one hundred', 'hundred'],
    hints: ['It is a round number.', 'Ten times ten.'],
  },
  short: {
    id: 'short',
    type: 'short-answer',
    question: 'Name the largest planet in our solar system.',
    explanation: 'Jupiter is the largest planet.',
    answer: 'Jupiter',
    acceptableAnswers: ['The planet Jupiter'],
    evidence: 'Jupiter is the largest planet in the solar system.',
    hints: ['A gas giant.', 'Fifth from the Sun.'],
  },
  matching: {
    id: 'matching',
    type: 'matching',
    question: 'Match each capital to its country.',
    explanation: 'Ankara is the capital of Türkiye, Paris of France, Berlin of Germany and Rome of Italy.',
    pairs: [
      { left: 'Ankara', right: 'Türkiye' },
      { left: 'Paris', right: 'France' },
      { left: 'Berlin', right: 'Germany' },
      { left: 'Rome', right: 'Italy' },
    ],
    // Position A..D shows pairs 1,2,3,0 → answer key per row: Ankara D, Paris A, Berlin B, Rome C.
    rightOrder: [1, 2, 3, 0],
    hints: ['Start with the one you know best.', 'Ankara is in Türkiye.'],
  },
  open: {
    id: 'open',
    type: 'open-ended',
    question: 'Explain why the sky appears blue during the day.',
    explanation: 'Rayleigh scattering of shorter wavelengths.',
    answer: 'Sunlight is scattered by the atmosphere, and blue light scatters more because of its shorter wavelength.',
    keyPoints: ['Sunlight is scattered by the atmosphere', 'Blue light scatters more because of its shorter wavelength'],
    evidence: 'Blue light has a shorter wavelength and scatters more.',
    hints: ['Two ideas: sunlight and blue light.', 'Think about wavelength.'],
  },
}

/** The right way to answer each type (used by the audit specs). */
export const RIGHT_ANSWERS: Record<string, string | number | boolean | string[]> = {
  mcq2: 0,
  mcq3: 1,
  mcq4: 1,
  mcq5: 2,
  mcqPlain: 2,
  tf: true,
  tfNoExplanation: false,
  fillTr: 'istanbul',
  fillDotless: 'ISIK',
  fillNumber: 'one hundred',
  short: 'jupiter',
  matching: ['D', 'A', 'B', 'C'],
  open: 'Sunlight scatters in the atmosphere and blue light scatters more because of its short wavelength.',
}
