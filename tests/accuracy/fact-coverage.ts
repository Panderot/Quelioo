// Full-coverage accuracy run for /api/generate against the real providers (keys from .env.local, never
// printed). Text A (74-word photosynthesis) in Auto for every type, texts B (~300 words) and C (~1,500
// words) in Auto, manual counts 3 and 5 on text A followed by "Add questions for missing facts", and the
// remaining-facts quiz when the maximum count is exceeded. Prints one compact table; every quiz with its
// facts plan is written to --out for the strict-teacher read-through.
//
//   npx tsx tests/accuracy/fact-coverage.ts                      all cells (cost guard --max-usd=3)
//   … --only=A-fill,C-                                           rerun some cells (prefix match)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { TEXT_B, TEXT_C, TEXT_COVERAGE_A } from './quiz-texts'
import type { GenerateMetrics } from '../../api/_lib/generate'
import type { QuizQuestion } from '../../src/lib/quiz'
import { answerSummary } from '../../src/lib/quiz'
import { WORDS_PER_FACT, computeCoverage, isListFact, missingEntries } from '../../src/lib/factCoverage'
import type { CoverageFact, QuizCoverage } from '../../src/lib/factCoverage'
import { findLeaks, qualityLanguageFor } from '../../src/lib/quizQuality'
import { countWords } from '../../src/lib/textStats'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.join('=') || 'true']
  }),
)
const MAX_USD = Number(args['max-usd'] ?? 3)
// Outside test-results/: Playwright clears that folder on every run.
const OUT = resolve(process.cwd(), args.out ?? resolve(tmpdir(), 'quelio-fact-coverage'))
const ONLY = args.only ? String(args.only).split(',') : null
const CONCURRENCY = Number(args.concurrency ?? 4)

process.env.LLM_PROVIDER_ORDER = args.order ?? 'anthropic,openai'
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const key = trimmed.slice(0, trimmed.indexOf('=')).trim()
    let value = trimmed.slice(trimmed.indexOf('=') + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (key && value && process.env[key] === undefined) process.env[key] = value
  }
}

type Body = Record<string, unknown>
type Handler = (payload: unknown, hooks?: { onMetrics?: (metrics: GenerateMetrics) => void }) => Promise<{ status: number; body: Body }>
const { handleGenerateRequest } = (await import('../../api/_lib/generate.js')) as unknown as { handleGenerateRequest: Handler }

const TEXTS: Record<string, string> = { A: TEXT_COVERAGE_A, B: TEXT_B, C: TEXT_C }

interface Cell {
  id: string
  text: string
  questionType: string
  count: string
  /** Manual counts: run "Add questions for missing facts" afterwards. */
  addMissing?: boolean
  /** Run the remaining-facts quiz when facts are left out by the maximum count. */
  followUp?: boolean
}

const TYPES = ['fill-blanks', 'mcq', 'true-false', 'matching', 'short-answer', 'open-ended', 'mixed']
const cells: Cell[] = [
  ...TYPES.map((type) => ({ id: `A-${type}`, text: 'A', questionType: type, count: 'auto' })),
  ...['mcq', 'fill-blanks', 'mixed'].map((type) => ({ id: `B-${type}`, text: 'B', questionType: type, count: 'auto' })),
  ...['mcq', 'mixed'].map((type) => ({ id: `C-${type}`, text: 'C', questionType: type, count: 'auto', followUp: true })),
  ...['3', '5'].map((count) => ({ id: `A-manual-${count}`, text: 'A', questionType: 'fill-blanks', count, addMissing: true })),
].filter((cell) => !ONLY || ONLY.some((prefix) => cell.id.startsWith(prefix)))

let spent = 0
const rows: string[] = []
mkdirSync(OUT, { recursive: true })

function base(cell: Cell) {
  return {
    text: TEXTS[cell.text],
    questionType: cell.questionType,
    difficulty: 'medium',
    optionsCount: cell.questionType === 'mcq' || cell.questionType === 'mixed' ? '4' : undefined,
    outputLanguage: 'auto',
    includeExplanations: true,
    includeHints: false,
  }
}

async function call(payload: Body): Promise<{ body: Body; metrics: GenerateMetrics | null; seconds: number }> {
  let metrics: GenerateMetrics | null = null
  const start = Date.now()
  const { body } = await handleGenerateRequest(payload, { onMetrics: (value) => (metrics = value) })
  const m = metrics as GenerateMetrics | null
  spent += m?.costUsd ?? 0
  return { body, metrics: m, seconds: (Date.now() - start) / 1000 }
}

function coverageOf(facts: CoverageFact[], questions: QuizQuestion[]) {
  return computeCoverage({ version: 1, facts }, questions)
}

function describeMissing(facts: CoverageFact[], questions: QuizQuestion[]): string {
  const summary = coverageOf(facts, questions)
  return summary.rows
    .filter((row) => row.status !== 'covered')
    .map((row) => `${row.fact.label}${row.status === 'partial' ? ` (no: ${row.missingItems.map((item) => row.fact.items![item]).join('/')})` : ''}`)
    .join('; ')
}

async function runCell(cell: Cell): Promise<void> {
  if (spent > MAX_USD) {
    rows.push(`| ${cell.id} | skipped (cost guard) |`)
    return
  }
  const first = await call({ mode: 'generate', ...base(cell), questionCount: cell.count })
  if (!Array.isArray(first.body.questions)) {
    rows.push(`| ${cell.id} | error ${String(first.body.error)} |`)
    return
  }
  const coverage = first.body.coverage as QuizCoverage | undefined
  let questions = first.body.questions as QuizQuestion[]
  const facts = coverage?.facts ?? []
  const m = first.metrics!
  let cost = m.costUsd
  let seconds = first.seconds
  let after = coverageOf(facts, questions).covered
  let note = ''

  if (cell.addMissing && coverage) {
    const missing = missingEntries(coverage, questions)
    const before = coverageOf(facts, questions).covered
    note += `manual before add: ${before}/${facts.length}; `
    if (missing.length > 0) {
      const added = await call({
        mode: 'cover_missing',
        ...base(cell),
        avoidQuestions: questions.map((question) => question.question),
        otherQuestions: questions.map((question) => ({ id: question.id, question: question.question, answer: answerSummary(question), type: question.type, factIds: question.factIds, factItems: question.factItems })),
        existingCount: questions.length,
        plan: facts,
        missing: missing.map((entry) => (entry.items ? { id: entry.fact.id, items: entry.items } : { id: entry.fact.id })),
      })
      cost += added.metrics?.costUsd ?? 0
      seconds += added.seconds
      if (Array.isArray(added.body.questions)) {
        const replaced = new Map(((added.body.replaced as QuizQuestion[] | undefined) ?? []).map((question) => [question.id, question]))
        note += `reworded ${replaced.size}; `
        questions = [...questions.map((question) => replaced.get(question.id) ?? question), ...(added.body.questions as QuizQuestion[])]
      }
      else note += `add error ${String(added.body.error)}; `
      after = coverageOf(facts, questions).covered
    }
  }

  if (cell.followUp && coverage) {
    const remaining = missingEntries(coverage, questions)
    if (remaining.length > 0 && questions.length >= 30) {
      const second = await call({ mode: 'generate', ...base(cell), questionCount: 'auto', plan: facts, onlyFactIds: remaining.map((entry) => entry.fact.id) })
      cost += second.metrics?.costUsd ?? 0
      const secondQuestions = (second.body.questions as QuizQuestion[] | undefined) ?? []
      const secondFacts = (second.body.coverage as QuizCoverage | undefined)?.facts ?? []
      const secondCovered = coverageOf(secondFacts, secondQuestions).covered
      note += `quiz 2: ${secondQuestions.length} q, ${secondCovered}/${secondFacts.length} facts, ${second.seconds.toFixed(0)} s, $${(second.metrics?.costUsd ?? 0).toFixed(3)}; `
      writeFileSync(resolve(OUT, `${cell.id}-2.json`), JSON.stringify({ facts: secondFacts, questions: secondQuestions }, null, 2))
    }
  }

  const language = qualityLanguageFor('auto', TEXTS[cell.text])
  const leaks = findLeaks(questions, language).length
  const lists = facts.filter(isListFact).map((fact) => {
    const row = coverageOf(facts, questions).rows.find((entry) => entry.fact.id === fact.id)!
    return `${fact.label}:${row.status}`
  })
  const wordsPerFact = facts.length > 0 ? (countWords(TEXTS[cell.text]) / facts.length).toFixed(1) : '-'
  rows.push(
    `| ${cell.id} | ${facts.length} (${wordsPerFact} w/f) | ${questions.length} | ${m.coveredBefore}/${facts.length} → ${after}/${facts.length} | ${describeMissing(facts, questions) || '-'} | leaks ${leaks}; lists ${lists.join(', ') || '-'}; ${note}| $${cost.toFixed(3)} (cov $${m.coverageCostUsd.toFixed(3)}) | ${seconds.toFixed(0)} s (plan ${(m.planMs / 1000).toFixed(0)}, cov ${(m.coverageMs / 1000).toFixed(0)}) |`,
  )
  writeFileSync(resolve(OUT, `${cell.id}.json`), JSON.stringify({ facts, metrics: m, questions }, null, 2))
}

const queue = [...cells]
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) await runCell(queue.shift()!)
  }),
)
console.log(`WORDS_PER_FACT now ${WORDS_PER_FACT}`)
console.log('| cell | facts | questions | coverage before → after | missed | checks | cost | seconds |')
console.log('|---|---|---|---|---|---|---|---|')
for (const row of rows.sort()) console.log(row)
console.log(`total $${spent.toFixed(3)} — quizzes in ${OUT}`)
