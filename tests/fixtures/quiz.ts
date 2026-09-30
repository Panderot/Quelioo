/**
 * A small sample quiz covering every question type, used only by tests (mocked API responses /
 * seeded Archive entries). Never imported by application code — the app has no mock data.
 */
export const SAMPLE_QUIZ = {
  title: 'Sample Quiz',
  demo: false,
  provider: 'openai' as const,
  fallbackUsed: false,
  requestedCount: 6,
  incomplete: false,
  questions: [
    {
      id: 'q-mcq',
      type: 'mcq' as const,
      question: 'Which gas do plants absorb during photosynthesis?',
      explanation: 'Plants absorb carbon dioxide and release oxygen.',
      options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'],
      answerIndex: 1,
    },
    {
      id: 'q-tf',
      type: 'true-false' as const,
      question: 'The Great Wall of China is visible from space with the naked eye.',
      explanation: 'This is a common myth; it is not visible without aid.',
      answerBool: false,
    },
    {
      id: 'q-fill',
      type: 'fill-blanks' as const,
      question: 'Water boils at ______ degrees Celsius at sea level.',
      explanation: 'Standard atmospheric pressure boiling point of water.',
      answer: '100',
      acceptableAnswers: ['one hundred'],
    },
    {
      id: 'q-short',
      type: 'short-answer' as const,
      question: 'Name the largest planet in our solar system.',
      explanation: 'Jupiter is the largest planet by mass and volume.',
      answer: 'Jupiter',
      acceptableAnswers: ['The planet Jupiter'],
      evidence: 'Jupiter is the largest planet in the solar system by mass and volume.',
    },
    {
      id: 'q-matching',
      type: 'matching' as const,
      question: 'Match each planet to its position from the sun.',
      explanation: 'Planet order from the sun: Mercury, Venus, Earth, Mars.',
      pairs: [
        { left: 'Mercury', right: 'First from the sun' },
        { left: 'Venus', right: 'Second from the sun' },
        { left: 'Earth', right: 'Third from the sun' },
        { left: 'Mars', right: 'Fourth from the sun' },
      ],
      // Deliberately a non-identity derangement: position i never shows pair i's own right value.
      rightOrder: [1, 2, 3, 0],
    },
    {
      id: 'q-open',
      type: 'open-ended' as const,
      question: 'Explain why the sky appears blue during the day.',
      explanation: 'A good answer should mention Rayleigh scattering of shorter wavelengths.',
      answer: 'Sunlight is scattered by the atmosphere, and blue light scatters more than other colors because of its shorter wavelength.',
      keyPoints: ['Sunlight is scattered by the atmosphere', 'Blue light scatters more because of its shorter wavelength'],
      evidence: 'Blue light has a shorter wavelength than other visible colors and scatters more in the atmosphere.',
    },
  ],
}

export type SampleQuiz = typeof SAMPLE_QUIZ
