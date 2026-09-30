/**
 * Unit-style checks for the deterministic hint accuracy guard (src/lib/hints.ts) — no browser
 * page needed, just plain function calls against known cases. Run as part of the normal Playwright
 * suite (`npm run test:e2e`), not a separate test framework.
 */
import { test, expect } from '@playwright/test'

import { countLetters, findHintLeak, firstLetterAndCount } from '../../src/lib/hints'
import type { McqQuestion, MatchingQuestion, TrueFalseQuestion } from '../../src/lib/quiz'

const MCQ: McqQuestion = {
  id: 'q1',
  type: 'mcq',
  question: 'Which gas do plants absorb during photosynthesis?',
  explanation: '',
  options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'],
  answerIndex: 1,
}

const TRUE_FALSE: TrueFalseQuestion = {
  id: 'q2',
  type: 'true-false',
  question: 'The Great Wall of China is visible from space with the naked eye.',
  explanation: '',
  answerBool: false,
}

const MATCHING_4: MatchingQuestion = {
  id: 'q3',
  type: 'matching',
  question: 'Match each planet to its position from the sun.',
  explanation: '',
  pairs: [
    { left: 'Mercury', right: 'First from the sun' },
    { left: 'Venus', right: 'Second from the sun' },
    { left: 'Earth', right: 'Third from the sun' },
    { left: 'Mars', right: 'Fourth from the sun' },
  ],
  rightOrder: [1, 2, 3, 0],
}

const MATCHING_3: MatchingQuestion = { ...MATCHING_4, pairs: MATCHING_4.pairs.slice(0, 3), rightOrder: [1, 2, 0] }

test.describe('findHintLeak', () => {
  test('clean progressive hints pass', () => {
    const leak = findHintLeak(MCQ, ['Think about what plants take in from the air.', 'Oxygen is released afterward, not taken in.'], 'en')
    expect(leak).toBeNull()
  })

  test('rejects a hint containing the correct answer outright', () => {
    const leak = findHintLeak(MCQ, ['Carbon dioxide is what plants absorb.', 'Hint 2'], 'en')
    expect(leak?.reason).toBe('answer')
  })

  test('rejects a hint whose words match the correct option in order without an exact substring (60%+ words in order)', () => {
    // "carbon" and "dioxide" both appear, in order, but "rich" breaks the exact-substring match —
    // this specifically exercises the word-order fallback, not the plain containment check.
    const leak = findHintLeak(MCQ, ['Hint 1', 'Plants absorb carbon rich dioxide gas from the air'], 'en')
    expect(leak?.reason).toBe('answer')
  })

  test('never flags a hint that only rules out a wrong option', () => {
    const leak = findHintLeak(MCQ, ['Think about what plants take in.', 'Oxygen is what plants release, not take in.'], 'en')
    expect(leak).toBeNull()
  })

  test('rejects an English verdict word for a true/false question', () => {
    const leak = findHintLeak(TRUE_FALSE, ['This statement is false.', 'Check the second hint.'], 'en')
    expect(leak?.reason).toBe('verdict')
  })

  test('rejects a Turkish verdict word regardless of case and Turkish dotted/dotless I', () => {
    const leak = findHintLeak(TRUE_FALSE, ['Bu YANLIŞ bir ifade.', 'İkinci ipucu.'], 'tr')
    expect(leak?.reason).toBe('verdict')
  })

  test('accepts a true/false hint that never states the verdict', () => {
    const leak = findHintLeak(TRUE_FALSE, ['Check what can be seen with the naked eye from orbit.', 'Think about the wall’s width.'], 'en')
    expect(leak).toBeNull()
  })

  test('matching: confirming more than one pair is rejected when there are 4+ pairs', () => {
    const leak = findHintLeak(
      MATCHING_4,
      ['Mercury is first from the sun.', 'Venus is second from the sun.'],
      'en',
    )
    expect(leak?.reason).toBe('pairs')
  })

  test('matching: confirming exactly one pair is allowed when there are 4+ pairs', () => {
    const leak = findHintLeak(MATCHING_4, ['Start with which planet orbits closest to the sun.', 'Mercury is first from the sun.'], 'en')
    expect(leak).toBeNull()
  })

  test('matching: confirming any pair is rejected when there are fewer than 4 pairs', () => {
    const leak = findHintLeak(MATCHING_3, ['Start with which planet orbits closest to the sun.', 'Mercury is first from the sun.'], 'en')
    expect(leak?.reason).toBe('pairs')
  })

  test('rejects a missing hint (count) in generation mode', () => {
    expect(findHintLeak(MCQ, ['Only one hint'], 'en')?.reason).toBe('count')
    expect(findHintLeak(MCQ, [], 'en')?.reason).toBe('count')
  })

  test('rejects an empty hint in generation mode', () => {
    expect(findHintLeak(MCQ, ['Think about what plants take in.', ''], 'en')?.reason).toBe('empty')
  })

  test('rejects duplicate hints', () => {
    const leak = findHintLeak(MCQ, ['Think about the gas plants take in.', 'Think about the gas plants take in.'], 'en')
    expect(leak?.reason).toBe('duplicate')
  })

  test('edit-form mode (requireComplete: false) allows a single provided hint', () => {
    const leak = findHintLeak(MCQ, ['Think about what plants take in.', ''], 'en', { requireComplete: false })
    expect(leak).toBeNull()
  })

  test('edit-form mode still blocks a leaking hint even when incomplete', () => {
    const leak = findHintLeak(MCQ, ['The answer is carbon dioxide.', ''], 'en', { requireComplete: false })
    expect(leak?.reason).toBe('answer')
  })
})

test.describe('firstLetterAndCount / countLetters — Turkish letters count as one each', () => {
  test('ağız (mouth): first letter "a", 4 letters', () => {
    expect(firstLetterAndCount('ağız')).toEqual({ letter: 'a', count: 4 })
  })

  test('çiğneme (chewing): first letter "ç", 7 letters', () => {
    expect(firstLetterAndCount('çiğneme')).toEqual({ letter: 'ç', count: 7 })
  })

  test('İnce (thin, capital dotted I): first letter "İ", 4 letters', () => {
    expect(firstLetterAndCount('İnce')).toEqual({ letter: 'İ', count: 4 })
  })

  test('countLetters ignores spaces and punctuation', () => {
    expect(countLetters('Su, buhar!')).toBe(7)
  })

  test('an answer with no letters (e.g. a bare number) returns null', () => {
    expect(firstLetterAndCount('100')).toBeNull()
  })
})
