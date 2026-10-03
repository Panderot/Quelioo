// Output-budget audit of every LLM endpoint against the real providers (keys from .env.local, never
// printed). Each endpoint runs through its real HTTP handler; every provider call is recorded:
// output limit, output and reasoning tokens, truncation (stopped at the limit), latency and cost.
//
//   npx tsx tests/accuracy/llm-budget-audit.ts                       current code, 3 runs per endpoint
//   … --root=<checkout of an older commit>                          the same against older code (before/after)
//   … --only=generate,grade --runs=5 --order=openai
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

import { TEXT_B, TEXT_MD } from './quiz-texts'
import { usageCostUsd } from '../../src/lib/lesson'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.join('=') || 'true']
  }),
)
const ROOT = resolve(String(args.root ?? process.cwd()))
const RUNS = Number(args.runs ?? 3)
const ONLY = args.only ? String(args.only).split(',') : null
process.env.LLM_PROVIDER_ORDER = String(args.order ?? 'openai')
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const index = line.indexOf('=')
    if (index <= 0 || line.trim().startsWith('#')) continue
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    const key = line.slice(0, index).trim()
    if (value && process.env[key] === undefined) process.env[key] = value
  }
}

// ---------- provider-call recorder ----------

interface CallRecord {
  endpoint: string
  model: string
  limit: number
  output: number
  reasoning: number
  truncated: boolean
  ms: number
  cost: number
}
const records: CallRecord[] = []
const current = new AsyncLocalStorage<string>()
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  const target = String(url)
  const isLlm = target.includes('api.openai.com/v1/responses') || target.includes('api.anthropic.com/v1/messages')
  const start = Date.now()
  const response = await realFetch(url as string, init)
  if (!isLlm) return response
  try {
    const request = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    const json = (await response.clone().json()) as Record<string, unknown>
    const usage = (json.usage ?? {}) as Record<string, unknown>
    const outputDetails = (usage.output_tokens_details ?? {}) as Record<string, unknown>
    const model = String(request.model ?? '')
    const output = Number(usage.output_tokens ?? 0)
    const input = Number(usage.input_tokens ?? 0)
    records.push({
      endpoint: current.getStore() ?? 'unknown',
      model,
      limit: Number(request.max_output_tokens ?? request.max_tokens ?? 0),
      output,
      reasoning: Number(outputDetails.reasoning_tokens ?? 0),
      truncated: json.status === 'incomplete' || json.stop_reason === 'max_tokens',
      ms: Date.now() - start,
      cost: usageCostUsd({ model, inputTokens: input, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: output }),
    })
  } catch {
    // Non-JSON error body: the handler reports the failure itself.
  }
  return response
}) as typeof fetch

// ---------- handler plumbing ----------

type Http = (req: IncomingMessage, res: ServerResponse) => Promise<void>
let ipCounter = 0
async function callHttp(handler: Http, body: unknown, url = '/', headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage
  Object.assign(req, {
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  })
  return new Promise((resolveResult) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(text?: string) {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(text ?? '{}')
        } catch {
          parsed = { error: 'non-json' }
        }
        resolveResult({ status: res.statusCode, body: parsed })
      },
    }
    void handler(req, res as unknown as ServerResponse)
  })
}

const load = async <T>(path: string, name: string): Promise<T> => ((await import(pathToFileURL(resolve(ROOT, path)).href)) as Record<string, T>)[name]

async function renderJpeg(html: string): Promise<string> {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 420 } })
  await page.setContent(`<body style="margin:40px;font-size:40px;background:#fff">${html}</body>`)
  const buffer = await page.screenshot({ type: 'jpeg', quality: 85 })
  await browser.close()
  return buffer.toString('base64')
}

// ---------- endpoints ----------

const PROBLEM = {
  question: 'Solve for $x$: $3x + 7 = 2x + 15$',
  steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
  answer: '$x = 8$',
  language: 'en',
}
const TYPES = ['mcq', 'true-false', 'fill-blanks', 'short-answer', 'matching', 'open-ended', 'mixed']

interface Endpoint {
  name: string
  runs: number
  run: (index: number) => Promise<{ status: number; body: Record<string, unknown> }>
}

const generate = await load<Http>('api/_lib/generate.ts', 'generateRequestHandler')
const endpoints: Endpoint[] = [
  {
    name: 'generate',
    runs: RUNS * TYPES.length,
    run: (index) =>
      callHttp(generate, {
        mode: 'generate',
        text: TEXT_MD,
        questionType: TYPES[index % TYPES.length],
        questionCount: '3',
        difficulty: 'hard',
        optionsCount: '2',
        outputLanguage: 'auto',
        includeExplanations: true,
        shuffleOptions: true,
        includeHints: true,
      }),
  },
  {
    name: 'regenerate-one',
    runs: RUNS * (TYPES.length - 1),
    run: (index) =>
      callHttp(generate, {
        mode: 'regenerate_one',
        text: TEXT_MD,
        questionType: TYPES[index % (TYPES.length - 1)],
        difficulty: 'hard',
        optionsCount: '2',
        outputLanguage: 'auto',
        includeHints: true,
        avoidQuestions: ['Klorofil hangi ışığı yansıtır?'],
        otherQuestions: [{ question: 'Klorofil hangi ışığı yansıtır?', answer: 'yeşil', type: 'short-answer' }],
      }),
  },
  {
    name: 'grade',
    runs: RUNS * 2,
    run: async (index) =>
      callHttp(await load<Http>('api/_lib/grade.ts', 'gradeRequestHandler'), {
        type: index % 2 === 0 ? 'short-answer' : 'open-ended',
        question: index % 2 === 0 ? 'Bitkiler neden yeşil görünür?' : 'Fotosentezde ışık, su ve karbondioksidin rolünü açıklayın.',
        modelAnswer: index % 2 === 0 ? 'Klorofil yeşil ışığı yansıttığı için.' : 'Işık enerji sağlar, su parçalanır ve oksijen açığa çıkar, karbondioksit glikoza çevrilir.',
        keyPoints: index % 2 === 0 ? [] : ['ışık enerji kaynağıdır', 'su parçalanır, oksijen çıkar', 'karbondioksit glikoza dönüşür'],
        evidence: 'Klorofil en çok kırmızı ve mavi ışığı soğurur, yeşil ışığı ise yansıtır.',
        studentAnswer: index % 2 === 0 ? 'Çünkü klorofil yeşili yansıtıyor.' : 'Işık enerji verir, karbondioksit şekere dönüşür ama suyu bilmiyorum.',
        language: 'tr',
      }),
  },
  {
    name: 'solve',
    runs: RUNS,
    run: async () =>
      callHttp(await load<Http>('api/_lib/solve.ts', 'solveRequestHandler'), {
        imageBase64: await renderJpeg('Solve for x:<br><br>3x + 7 = 2x + 15'),
        mimeType: 'image/jpeg',
        language: 'en',
        note: '',
      }),
  },
  ...['similar', 'another-way', 'explain-step'].map((action) => ({
    name: action,
    runs: RUNS,
    run: async () =>
      callHttp(
        await load<Http>('api/_lib/solve-tools.ts', 'solveToolsRequestHandler'),
        action === 'similar' ? { ...PROBLEM, topic: 'linear equations', avoid: [] } : action === 'explain-step' ? { ...PROBLEM, stepIndex: 0, level: 'simple' } : PROBLEM,
        `/api/solve-tools?action=${action}`,
      ),
  })),
  {
    name: 'check-work',
    runs: RUNS,
    run: async () => {
      const handler = await load<Http>('api/_lib/solve-tools.ts', 'solveToolsRequestHandler')
      const image = await renderJpeg('<i style="font-family:cursive">3x + 7 = 2x + 15<br>x + 7 = 15<br>x = 9</i>')
      const read = await callHttp(handler, { ...PROBLEM, mode: 'read', imageBase64: image, mimeType: 'image/jpeg' }, '/api/solve-tools?action=check-work')
      const lines = Array.isArray(read.body.lines) ? (read.body.lines as { text?: string }[]).map((line) => String(line.text ?? line)) : ['x + 7 = 15', 'x = 9']
      return callHttp(handler, { ...PROBLEM, mode: 'grade', studentSteps: lines }, '/api/solve-tools?action=check-work')
    },
  },
  ...(['text', 'topic', 'solution'] as const).map((mode) => ({
    name: `cards-${mode}`,
    runs: RUNS,
    run: async () => {
      const handle = await load<(payload: unknown, ip: string) => Promise<{ status: number; body: Record<string, unknown> }>>('api/_lib/cards.ts', 'handleCardsRequest')
      return handle(
        mode === 'text'
          ? { mode, text: TEXT_B, count: 10, style: 'term', language: 'tr', avoid: [] }
          : mode === 'topic'
            ? { mode, topic: 'Hücre organelleri', level: 'general', count: 10, style: 'qa', language: 'tr', avoid: [] }
            : { mode, text: `${PROBLEM.question}\n${PROBLEM.steps.join('\n')}\nAnswer: ${PROBLEM.answer}`, language: 'en', avoid: [] },
        `10.8.0.${++ipCounter % 250}`,
      )
    },
  })),
  {
    name: 'song-lyrics',
    runs: RUNS,
    run: async () =>
      callHttp(await load<Http>('api/_lib/song-lyrics.ts', 'songLyricsRequestHandler'), {
        mode: 'write',
        quizTitle: 'Fotosentez',
        keyFacts: ['Klorofil ışığı soğurur', 'Karbondioksit glikoza çevrilir', 'Oksijen açığa çıkar'],
        sourceExcerpt: TEXT_MD.slice(0, 600),
        style: 'pop',
        tone: 'normal',
        language: 'tr',
      }),
  },
  {
    name: 'lesson',
    runs: 1,
    run: async () => {
      const handle = await load<(payload: unknown, context: { ip: string }) => Promise<{ status: number; body: Record<string, unknown> }>>('api/_lib/lesson.ts', 'handleLessonRequest')
      const ip = `10.7.0.${++ipCounter % 250}`
      const plan = await handle({ action: 'plan', text: TEXT_B, level: 'general', language: 'tr' }, { ip })
      if (plan.status !== 200) return plan
      return handle({ action: 'script', text: TEXT_B, keyPoints: plan.body.keyPoints, episodes: plan.body.episodes, part: 1, style: 'two_hosts', level: 'general', tone: 'normal', language: 'tr' }, { ip })
    },
  },
]

// ---------- run ----------

const selected = endpoints.filter((endpoint) => !ONLY || ONLY.some((name) => endpoint.name.startsWith(name)))
const failures = new Map<string, string[]>()
const timings = new Map<string, number[]>()
await Promise.all(
  selected.map(async (endpoint) => {
    for (let index = 0; index < endpoint.runs; index++) {
      const start = Date.now()
      const result = await current.run(endpoint.name, () => endpoint.run(index)).catch((error: Error) => ({ status: 0, body: { error: error.message } }))
      timings.set(endpoint.name, [...(timings.get(endpoint.name) ?? []), Date.now() - start])
      if (result.status !== 200) failures.set(endpoint.name, [...(failures.get(endpoint.name) ?? []), `${result.status} ${String(result.body.error ?? '')}`])
    }
  }),
)

console.log(`root=${ROOT === process.cwd() ? 'current' : ROOT} order=${process.env.LLM_PROVIDER_ORDER} runs=${RUNS}`)
console.log('endpoint            req  fail  calls trunc  reason%  out/limit(max)      avg s   $/req')
for (const endpoint of selected) {
  const calls = records.filter((record) => record.endpoint === endpoint.name)
  const output = calls.reduce((sum, call) => sum + call.output, 0)
  const reasoning = calls.reduce((sum, call) => sum + call.reasoning, 0)
  const tightest = calls.reduce((max, call) => Math.max(max, call.limit ? call.output / call.limit : 0), 0)
  const times = timings.get(endpoint.name) ?? []
  const cost = calls.reduce((sum, call) => sum + call.cost, 0)
  const fails = failures.get(endpoint.name) ?? []
  console.log(
    `${endpoint.name.padEnd(19)} ${String(endpoint.runs).padStart(3)} ${String(fails.length).padStart(5)} ${String(calls.length).padStart(6)} ${String(calls.filter((call) => call.truncated).length).padStart(5)} ${(output ? (100 * reasoning) / output : 0).toFixed(0).padStart(7)}%  ${(100 * tightest).toFixed(0).padStart(4)}% of limit       ${(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length) / 1000).toFixed(1).padStart(5)}  ${(cost / Math.max(1, endpoint.runs)).toFixed(4)}${fails.length ? `  ${[...new Set(fails)].join('; ')}` : ''}`,
  )
}
const models = [...new Set(records.map((record) => record.model))].join(', ')
console.log(`models: ${models} | total $${records.reduce((sum, call) => sum + call.cost, 0).toFixed(3)}`)
