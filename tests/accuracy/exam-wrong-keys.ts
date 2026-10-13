import { handleGenerateRequest } from '../../api/_lib/generate'
import { runWithRequestContext } from '../../api/_lib/request-context'
import type { RequestContext } from '../../api/_lib/request-context'
import { examVerifyPayload, parseVerifyResult } from '../../src/api/exam'
import type { ExamVerifyRequest, ExamVerifyResult } from '../../src/api/exam'
import { judgeKeys } from '../../src/lib/exam/generate'
import { EDEBIYAT_SHORT, KIMYA_MCQ, MATEMATIK_SHORT } from '../fixtures/exam-wrong-keys'
import type { WrongKeyCase } from '../fixtures/exam-wrong-keys'

// Real-AI check: the three wrong keys of the 13 Oct 2026 audit, each through the blind key check once.
// Run: npx tsx --env-file=.env.local tests/accuracy/exam-wrong-keys.ts   (costs are real; stops above the budget)

const BUDGET_USD = 0.15

const cases: [string, WrongKeyCase][] = [
  ['Kimya 11 S19 (mcq)', KIMYA_MCQ],
  ['Matematik 11 S6 (short answer, \\frac key)', MATEMATIK_SHORT],
  ['Edebiyat 10 S7 (short answer, words)', EDEBIYAT_SHORT],
]

const events: RequestContext['events'] = []
const context: RequestContext = { userId: 'accuracy', feature: 'generate', events }
const spent = () => events.reduce((sum, event) => sum + event.costUsd, 0)

const callVerify = async (request: ExamVerifyRequest): Promise<ExamVerifyResult> => {
  if (spent() > BUDGET_USD) throw new Error('budget exceeded')
  const { status, body } = await handleGenerateRequest(examVerifyPayload(request))
  if (status !== 200 || 'error' in body) throw new Error(`judge failed (${status})`)
  return parseVerifyResult(body as unknown as Record<string, unknown>)
}

await runWithRequestContext(context, async () => {
  for (const [label, wrong] of cases) {
    const result = await judgeKeys([wrong.question], wrong.source, callVerify)
    const fixed = result.questions[0]
    const caught = result.rewrite.includes(wrong.question.id) || (wrong.question.type === 'mcq' && fixed.answerIndex !== wrong.question.answerIndex)
    console.log(`${caught ? 'CAUGHT' : 'MISSED'} | ${label} | ${result.rewrite.length > 0 ? 'rewrite' : fixed.answerIndex !== wrong.question.answerIndex ? `key corrected to option ${String.fromCharCode(65 + (fixed.answerIndex ?? 0))}` : 'unchanged'}`)
  }
})
console.log(`cost: $${spent().toFixed(4)}`)
