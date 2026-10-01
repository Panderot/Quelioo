import { test, expect } from '@playwright/test'
import { gradeStudentWork } from '../../api/_lib/check-work'
import type { LlmJsonCaller } from '../../api/_lib/check-work'

// Grading rules of /api/check-work with a scripted model (no network): the math engine runs for real.

const LINEAR = { problem: 'Solve for $x$: $3x + 7 = 2x + 15$', referenceSteps: ['$x + 7 = 15$', '$x = 8$'], referenceAnswer: '$x = 8$', language: 'en' }
const TRIANGLE = {
  problem: 'A right triangle has legs of length $6$ cm and $8$ cm. Find the length of the hypotenuse.',
  referenceSteps: ['$c^2 = 6^2 + 8^2 = 100$', '$c = 10$'],
  referenceAnswer: '$10$ cm',
  language: 'en',
}

interface Script {
  grade: Record<string, unknown>
  second?: boolean | 'error'
  explain?: Record<string, unknown>
}

function scripted(script: Script) {
  const calls: { kind: string; preferProvider?: string }[] = []
  const llm = async (params: Parameters<LlmJsonCaller>[0]) => {
    const kind = params.system.includes('independently double-check')
      ? 'second'
      : params.system.includes('A math engine proved')
        ? 'explain'
        : params.system.includes('grading a student')
          ? 'grade'
          : 'other'
    calls.push({ kind, preferProvider: params.preferProvider })
    if (kind === 'second' && script.second === 'error') return { ok: false as const, error: 'upstream' as const }
    const raw = kind === 'second' ? { isError: script.second } : kind === 'explain' ? script.explain : kind === 'grade' ? script.grade : null
    const value = params.validate(raw)
    return value === null ? { ok: false as const, error: 'parse' as const } : { ok: true as const, value, provider: 'openai' as const, fallbackUsed: false }
  }
  return { llm: llm as unknown as LlmJsonCaller, calls }
}

const grade = (mistakes: unknown[], extra: Record<string, unknown> = {}) => ({ problemMatch: 'same', finished: true, studentFinalAnswer: '', mistakes, ...extra })
const flag = (step: number, errorType = 'concept') => ({ step, errorType, explanation: 'Explained.', correctedStep: '$c^2 = 6^2 + 8^2$', hint: 'Which rule links the three sides?' })

test.describe('check-work grading rules', () => {
  test('an engine-valid step is never marked wrong, whatever the AI says', async () => {
    const { llm, calls } = scripted({ grade: grade([flag(1, 'sign')]) })
    const graded = await gradeStudentWork({ ...LINEAR, studentSteps: ['$3x - 2x = 15 - 7$', '$x = 8$'] }, llm)
    expect(graded.ok).toBe(true)
    if (!graded.ok) return
    expect(graded.result.engineChecks).toEqual(['valid', 'valid'])
    expect(graded.result).toMatchObject({ verdict: 'correct', firstWrongStep: null, unsureStep: null, stepStates: ['ok', 'ok'], finalAnswerCorrect: true })
    expect(calls.map((call) => call.kind)).toEqual(['grade'])
  })

  test('an engine-invalid step is the mistake even when the AI misses it; the AI only explains it', async () => {
    const { llm, calls } = scripted({ grade: grade([]), explain: { errorType: 'sign', explanation: 'The $2x$ changes sign.', correctedStep: '$3x - 2x = 15 - 7$' } })
    const graded = await gradeStudentWork({ ...LINEAR, studentSteps: ['$3x + 2x = 15 - 7$', '$5x = 8$', '$x = 1.6$'] }, llm)
    if (!graded.ok) throw new Error(graded.error)
    expect(graded.result).toMatchObject({
      verdict: 'has_error',
      firstWrongStep: 0,
      errorType: 'sign',
      correctedStep: '$3x - 2x = 15 - 7$',
      stepStates: ['mistake', 'unchecked', 'unchecked'],
      finalAnswerCorrect: false,
    })
    expect(calls.map((call) => call.kind)).toEqual(['grade', 'explain'])
  })

  test('a step only the AI doubts becomes a mistake only when an independent second check (other provider) agrees', async () => {
    const { llm, calls } = scripted({ grade: grade([flag(1)]), second: true })
    const graded = await gradeStudentWork({ ...TRIANGLE, studentSteps: ['$c = 6 + 8$', '$c = 14$ cm'] }, llm)
    if (!graded.ok) throw new Error(graded.error)
    expect(graded.result).toMatchObject({ verdict: 'has_error', firstWrongStep: 0, errorType: 'concept', stepStates: ['mistake', 'unchecked'] })
    expect(calls.find((call) => call.kind === 'second')?.preferProvider).toBe('anthropic')
  })

  for (const second of [false, 'error'] as const) {
    test(`when the second check ${second === false ? 'disagrees' : 'fails'} the step is shown softly, never as a mistake`, async () => {
      const { llm } = scripted({ grade: grade([flag(1)]), second })
      const graded = await gradeStudentWork({ ...TRIANGLE, studentSteps: ['$c = 6 + 8$', '$c = 14$ cm'] }, llm)
      if (!graded.ok) throw new Error(graded.error)
      expect(graded.result).toMatchObject({ verdict: 'unsure', firstWrongStep: null, unsureStep: 0, unsureHint: 'Which rule links the three sides?' })
      expect(graded.result.stepStates).not.toContain('mistake')
    })
  }

  test('a right final answer with no verified mistake is correct, keeping a soft "check again" mark', async () => {
    const { llm } = scripted({ grade: grade([flag(1)]), second: false })
    const graded = await gradeStudentWork({ ...TRIANGLE, studentSteps: ['$6$-$8$-$10$ is a doubled $3$-$4$-$5$ triangle', '$c = 10$ cm'] }, llm)
    if (!graded.ok) throw new Error(graded.error)
    expect(graded.result).toMatchObject({ verdict: 'correct', firstWrongStep: null, unsureStep: 0, finalAnswerCorrect: true })
  })

  test('not sure the work matches the problem: says so instead of inventing an error', async () => {
    const unsureMatch = scripted({ grade: grade([flag(2)], { problemMatch: 'unsure' }), second: true })
    const graded = await gradeStudentWork({ ...TRIANGLE, studentSteps: ['$a + b = 12$', '$a = 7$'] }, unsureMatch.llm)
    if (!graded.ok) throw new Error(graded.error)
    expect(graded.result.firstWrongStep).toBeNull()
    expect(graded.result.stepStates).not.toContain('mistake')

    const nothingFound = scripted({ grade: grade([], { problemMatch: 'unsure' }) })
    const uncertain = await gradeStudentWork({ ...TRIANGLE, studentSteps: ['$a + b = 12$', '$a = 7$'] }, nothingFound.llm)
    if (!uncertain.ok) throw new Error(uncertain.error)
    expect(uncertain.result.verdict).toBe('uncertain')

    const different = scripted({ grade: grade([], { problemMatch: 'different' }) })
    const other = await gradeStudentWork({ ...LINEAR, studentSteps: ['$5x - 4 = 11$', '$5x = 15$', '$x = 3$'] }, different.llm)
    if (!other.ok) throw new Error(other.error)
    expect(other.result.verdict).toBe('different_problem')
  })
})
