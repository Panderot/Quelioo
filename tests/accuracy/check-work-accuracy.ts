// Accuracy set for "Check my solution" (/api/check-work): handwritten-style photos of student work,
// each with its expected verdict and wrong step. Every case runs the real two-phase flow: read the
// photo, confirm the reading unchanged (as a student pressing "Yes, check it"), then grade.
//
//   npx tsx tests/accuracy/check-work-accuracy.ts                    in-process handler, keys from .env.local
//   npx tsx tests/accuracy/check-work-accuracy.ts --url=https://…    a deployed preview / production URL
//   … --only=e-sign-p1,c-alt-p2                                       rerun some cases (readings are cached)
//
// Required: no correct solution marked as a mistake, and the right wrong step found in every
// one-error case ("check this step again" on the right step is accepted but reported).
// Never prints keys, only verdicts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

type Expected = 'correct' | 'has_error' | 'different_problem' | 'unreadable'

interface Problem {
  question: string
  steps: string[]
  answer: string
  language: string
}

interface Case {
  id: string
  note: string
  problem: Problem
  lines: string[]
  expected: Expected
  /** 1-based wrong step for has_error. */
  wrongStep?: number
  unreadable?: boolean
}

const P1: Problem = {
  question: 'Solve for $x$: $3x + 7 = 2x + 15$',
  steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
  answer: '$x = 8$',
  language: 'en',
}
const P2: Problem = {
  question: 'Ayşe 3 defter ve 2 kalem için toplam 60 TL ödedi. Bir kalem, bir defterden 5 TL daha pahalıdır. Bir defter kaç TL?',
  steps: ['Defter $x$ TL olsun; kalem $x + 5$ TL olur.', '$3x + 2(x + 5) = 60$', '$5x + 10 = 60$', '$5x = 50$', '$x = 10$'],
  answer: '10 TL',
  language: 'tr',
}
const P3: Problem = {
  question: 'A right triangle has legs of length $6$ cm and $8$ cm. Find the length of the hypotenuse.',
  steps: ['By the Pythagorean theorem: $c^2 = 6^2 + 8^2$', '$c^2 = 36 + 64 = 100$', '$c = 10$'],
  answer: '$10$ cm',
  language: 'en',
}
const P4: Problem = {
  question: 'Solve for $x$: $2(x - 3) = 4x + 2$',
  steps: ['Expand: $2x - 6 = 4x + 2$', 'Subtract $2x$ and $2$: $-8 = 2x$', '$x = -4$'],
  answer: '$x = -4$',
  language: 'en',
}
const P5: Problem = {
  question: 'Solve $x^2 - 5x + 6 = 0$',
  steps: ['Factor: $(x - 2)(x - 3) = 0$', '$x = 2$ or $x = 3$'],
  answer: '$x = 2$ or $x = 3$',
  language: 'en',
}

const CASES: Case[] = [
  // Correct — standard method
  { id: 'c-std-p1', note: 'correct, standard', problem: P1, lines: ['3x + 7 = 2x + 15', '3x - 2x = 15 - 7', 'x = 8'], expected: 'correct' },
  { id: 'c-std-p2', note: 'correct, TL word problem', problem: P2, lines: ['defter = x, kalem = x + 5', '3x + 2(x + 5) = 60', '3x + 2x + 10 = 60', '5x = 50', 'x = 10 TL'], expected: 'correct' },
  { id: 'c-std-p3', note: 'correct, 6-8 triangle', problem: P3, lines: ['c² = 6² + 8²', 'c² = 36 + 64', 'c² = 100', 'c = 10 cm'], expected: 'correct' },
  { id: 'c-std-p4', note: 'correct, brackets', problem: P4, lines: ['2x - 6 = 4x + 2', '-6 - 2 = 4x - 2x', '-8 = 2x', 'x = -4'], expected: 'correct' },
  { id: 'c-std-p5', note: 'correct, quadratic', problem: P5, lines: ['(x - 2)(x - 3) = 0', 'x - 2 = 0 or x - 3 = 0', 'x = 2 or x = 3'], expected: 'correct' },
  // Correct — different valid methods
  { id: 'c-alt-p1', note: 'correct, other order', problem: P1, lines: ['3x + 7 = 2x + 15', '3x = 2x + 8', 'x = 8'], expected: 'correct' },
  { id: 'c-alt2-p1', note: 'correct, move constants first', problem: P1, lines: ['3x + 7 - 15 = 2x', '3x - 8 = 2x', '3x - 2x = 8', 'x = 8'], expected: 'correct' },
  { id: 'c-alt-p2', note: 'correct, pen as unknown', problem: P2, lines: ['kalem = p, defter = p - 5', '3(p - 5) + 2p = 60', '5p - 15 = 60', '5p = 75', 'p = 15', 'defter = 15 - 5 = 10 TL'], expected: 'correct' },
  { id: 'c-alt-p3', note: 'correct, 3-4-5 triple', problem: P3, lines: ['6 = 2·3 and 8 = 2·4', '3-4-5 triangle doubled', 'c = 2·5 = 10 cm'], expected: 'correct' },
  { id: 'c-alt-p4', note: 'correct, divide first', problem: P4, lines: ['2(x - 3) = 4x + 2', 'x - 3 = 2x + 1', '-4 = x', 'x = -4'], expected: 'correct' },
  // One error of each type
  { id: 'e-arith-p1', note: 'arithmetic', problem: P1, lines: ['3x - 2x = 15 - 7', 'x = 9'], expected: 'has_error', wrongStep: 2 },
  { id: 'e-sign-p1', note: 'sign', problem: P1, lines: ['3x + 7 = 2x + 15', '3x + 2x = 15 - 7', '5x = 8', 'x = 8/5'], expected: 'has_error', wrongStep: 2 },
  { id: 'e-concept-p3', note: 'rule / concept', problem: P3, lines: ['c = 6 + 8', 'c = 14 cm'], expected: 'has_error', wrongStep: 1 },
  { id: 'e-concept-p2', note: 'rule (distribution), TL', problem: P2, lines: ['3x + 2(x + 5) = 60', '3x + 2x + 5 = 60', '5x = 55', 'x = 11 TL'], expected: 'has_error', wrongStep: 2 },
  { id: 'e-copy-p1', note: 'copied the problem wrong', problem: P1, lines: ['3x + 7 = 2x + 51', '3x - 2x = 51 - 7', 'x = 44'], expected: 'has_error', wrongStep: 1 },
  { id: 'e-missing-p1', note: 'missing step', problem: P1, lines: ['3x + 7 = 2x + 15', 'x = 15'], expected: 'has_error', wrongStep: 2 },
  { id: 'e-sign-p4', note: 'sign, moving terms', problem: P4, lines: ['2x - 6 = 4x + 2', '2x - 4x = 2 - 6', '-2x = -4', 'x = 2'], expected: 'has_error', wrongStep: 2 },
  { id: 'e-arith-p3', note: 'arithmetic, triangle', problem: P3, lines: ['c² = 6² + 8²', 'c² = 36 + 64', 'c² = 110', 'c = √110 cm'], expected: 'has_error', wrongStep: 3 },
  { id: 'e-arith-p2', note: 'arithmetic, TL', problem: P2, lines: ['3x + 2(x + 5) = 60', '5x + 10 = 60', '5x = 70', 'x = 14 TL'], expected: 'has_error', wrongStep: 3 },
  // Error only in the last step; right final answer with a wrong middle step
  { id: 'e-last-p4', note: 'error in the last step only', problem: P4, lines: ['2x - 6 = 4x + 2', '-6 - 2 = 4x - 2x', '-8 = 2x', 'x = 4'], expected: 'has_error', wrongStep: 4 },
  { id: 'e-middle-p1', note: 'right final answer, wrong middle step', problem: P1, lines: ['3x - 2x = 15 - 7', 'x = 7', 'x = 8'], expected: 'has_error', wrongStep: 2 },
  // Other problem, unreadable photo
  { id: 'x-different', note: 'work for a different problem', problem: P1, lines: ['5x - 4 = 11', '5x = 15', 'x = 3'], expected: 'different_problem' },
  { id: 'x-unreadable', note: 'unreadable photo', problem: P1, lines: ['3x + 7 = 2x + 15', '3x - 2x = 15 - 7', 'x = 8'], expected: 'unreadable', unreadable: true },
]

const FONTS = ["'Segoe Print'", "'Ink Free'", "'Comic Sans MS'", "'Segoe Script'"]

function caseHtml(testCase: Case, index: number): string {
  const font = FONTS[index % FONTS.length]
  const slant = [-7, 4, -2, 8, -4][index % 5]
  const blur = testCase.unreadable ? 7 : [0, 0.4, 0.8, 0.3][index % 4]
  const ink = testCase.unreadable ? '#9aa3c0' : ['#1b2a8a', '#202020', '#123c7a'][index % 3]
  const rows = testCase.lines
    .map((line, row) => `<div style="transform: rotate(${row % 2 ? -1.1 : 0.7}deg) skewX(${slant}deg); margin-left:${18 + ((row * 7 + index) % 23)}px">${line}</div>`)
    .join('')
  return `<body style="margin:0;background:repeating-linear-gradient(#fdfcf6 0 58px,#a9c4e8 58px 60px)"><div style="font-family:${font};font-size:36px;color:${ink};line-height:60px;padding:30px 40px;filter:blur(${blur}px)">${rows}</div></body>`
}

// ---------- transport ----------

const args = new Map(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=') as [string, string]))
const baseUrl = args.get('url')?.replace(/\/$/, '')
const only = args.get('only')?.split(',').filter(Boolean)

type Body = Record<string, unknown>

type Handler = (payload: unknown, ip: string) => Promise<{ status: number; body: unknown }>
let localHandler: Handler | null = null

async function call(payload: Body, ip: string): Promise<{ status: number; body: Body }> {
  if (baseUrl) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    if (bypass) headers['x-vercel-protection-bypass'] = bypass
    const response = await fetch(`${baseUrl}/api/check-work`, { method: 'POST', headers, body: JSON.stringify(payload) })
    const text = await response.text()
    try {
      return { status: response.status, body: JSON.parse(text) as Body }
    } catch {
      return { status: response.status, body: { error: `non-json (${text.slice(0, 60).replace(/\s+/g, ' ')})` } }
    }
  }
  if (!localHandler) {
    const envPath = resolve(process.cwd(), '.env.local')
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
        const key = trimmed.slice(0, trimmed.indexOf('=')).trim()
        let value = trimmed.slice(trimmed.indexOf('=') + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
        if (key && value && !value.includes('[SENSITIVE]') && process.env[key] === undefined) process.env[key] = value
      }
    }
    localHandler = (await import('../../api/_lib/check-work.js')).handleCheckWorkRequest as Handler
  }
  const { status, body } = await localHandler(payload, ip)
  return { status, body: body as Body }
}

// ---------- run ----------

const cacheDir = resolve(process.cwd(), 'test-results')
const cachePath = resolve(cacheDir, 'check-work-accuracy-readings.json')
const cache: Record<string, Body> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}

interface Row {
  id: string
  note: string
  expected: string
  got: string
  pass: boolean
  soft: boolean
  detail: string
}

async function runCase(testCase: Case, jpeg: Buffer, index: number): Promise<Row> {
  const { problem } = testCase
  const base = { question: problem.question, steps: problem.steps, answer: problem.answer, language: problem.language }
  const ip = `10.42.0.${index + 1}`
  const expectedText = testCase.expected === 'has_error' ? `mistake @${testCase.wrongStep}` : testCase.expected
  const row = (got: string, pass: boolean, detail = '', soft = false): Row => ({ id: testCase.id, note: testCase.note, expected: expectedText, got, pass, soft, detail })

  let read = cache[testCase.id]
  if (!read) {
    const response = await call({ mode: 'read', ...base, imageBase64: `data:image/jpeg;base64,${jpeg.toString('base64')}`, mimeType: 'image/jpeg' }, ip)
    if ('error' in response.body) return row(`error ${String(response.body.error)}`, false)
    read = response.body
    if (read.kind === 'reading') cache[testCase.id] = read
  }

  let result: Body
  let lines: string[] = []
  if (read.kind === 'reading') {
    lines = (read.lines as { text: string }[]).map((line) => line.text)
    const graded = await call({ mode: 'grade', ...base, studentSteps: lines }, ip)
    if ('error' in graded.body) return row(`error ${String(graded.body.error)}`, false, `read=${JSON.stringify(lines)}`)
    result = graded.body
  } else {
    result = read
  }

  const verdict = String(result.verdict)
  const states = (result.stepStates as string[] | undefined) ?? []
  const engine = ((result.engineChecks as string[] | undefined) ?? []).map((value) => value[0]).join('')
  const wrong = typeof result.firstWrongStep === 'number' ? result.firstWrongStep + 1 : null
  const unsure = typeof result.unsureStep === 'number' ? result.unsureStep + 1 : null
  const got = `${verdict}${wrong ? ` mistake @${wrong}` : ''}${unsure ? ` unsure @${unsure}` : ''}`
  const detail = `engine=${engine || '-'} read=${JSON.stringify(lines)}`

  switch (testCase.expected) {
    case 'correct': {
      const markedWrong = states.includes('mistake') || verdict === 'has_error' || verdict === 'different_problem'
      return row(got, !markedWrong, detail, !markedWrong && verdict !== 'correct')
    }
    case 'has_error':
      if (wrong === testCase.wrongStep) return row(got, true, detail)
      if (wrong === null && unsure === testCase.wrongStep) return row(got, true, detail, true)
      return row(got, false, detail)
    case 'different_problem':
    case 'unreadable':
      if (verdict === testCase.expected) return row(got, true, detail)
      return row(got, verdict === 'uncertain', detail, true)
  }
}

const selected = CASES.map((testCase, index) => ({ testCase, index })).filter(({ testCase }) => !only || only.includes(testCase.id))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 760, height: 520 } })
const images: Buffer[] = []
for (const { testCase, index } of selected) {
  await page.setContent(caseHtml(testCase, index))
  images.push(await page.screenshot({ type: 'jpeg', quality: 82, fullPage: true }))
}
await browser.close()

// A few cases at a time: real calls, but not a burst.
const rows: Row[] = new Array(selected.length)
const queue = selected.map((entry, position) => ({ ...entry, position }))
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      rows[next.position] = await runCase(next.testCase, images[next.position], next.index)
    }
  }),
)

mkdirSync(cacheDir, { recursive: true })
writeFileSync(cachePath, JSON.stringify(cache))

const pad = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width))
console.log(`${pad('case', 14)} ${pad('expected', 18)} ${pad('got', 34)} result`)
for (const row of rows) console.log(`${pad(row.id, 14)} ${pad(row.expected, 18)} ${pad(row.got, 34)} ${row.pass ? (row.soft ? 'PASS (soft)' : 'PASS') : 'FAIL'}`)
const failed = rows.filter((row) => !row.pass)
const correctCases = rows.filter((row) => row.expected === 'correct')
console.log(
  `\ntotal ${rows.length} · pass ${rows.length - failed.length} · fail ${failed.length} · soft ${rows.filter((row) => row.soft).length} · correct solutions marked wrong ${correctCases.filter((row) => !row.pass).length}`,
)
for (const row of rows.filter((entry) => !entry.pass || entry.soft)) console.log(`  ${row.id}: ${row.detail}`)
if (failed.length > 0) {
  console.log(`\nrerun: --only=${failed.map((row) => row.id).join(',')}`)
  process.exitCode = 1
}
