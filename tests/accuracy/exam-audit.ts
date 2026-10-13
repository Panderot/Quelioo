import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { handleGenerateRequest } from '../../api/_lib/generate'
import { runWithRequestContext } from '../../api/_lib/request-context'
import type { RequestContext } from '../../api/_lib/request-context'
import { ExamApiError, examVerifyPayload, parseVerifyResult } from '../../src/api/exam'
import type { ExamFact, ExamPlanRequest, ExamSectionRequest, ExamVerifyRequest, ExamVerifyResult } from '../../src/api/exam'
import { bloomTargetCounts, countsForBloom, planBloom } from '../../src/lib/exam/bloom'
import { BLOOM_CAP } from '../../src/lib/exam/bloomConfig'
import { correctIsLongest, shortAnswerProblems, stemPattern } from '../../src/lib/exam/contentRules'
import { newExamId, settingsWithHeader } from '../../src/lib/exam/factory'
import { ExamDistributionError, ExamShortSourceError, generateExamQuestions } from '../../src/lib/exam/generate'
import type { ExamGenerationState } from '../../src/lib/exam/generate'
import { paperLabels } from '../../src/lib/exam/paperLabels'
import { chooseFacts, clusterTopics } from '../../src/lib/exam/planning'
import { SOFT_RULES, checkExamQuality, correctAnswerText, factSimilarity } from '../../src/lib/exam/quality'
import { buildMemory, earlierFromMemories, memoriesForSource } from '../../src/lib/exam/sourceMemory'
import type { StoredMemory } from '../../src/lib/exam/sourceMemory'
import { distributionRows, specRows } from '../../src/lib/exam/tables'
import { EXAM_QUESTION_TYPES, EXAM_WORDS_PER_QUESTION, defaultExamSettings, maxQuestionsForWords } from '../../src/lib/exam/types'
import type { BloomSetting, ExamQuestion, ExamSettings, WrittenExam } from '../../src/lib/exam/types'
import * as sources from '../fixtures/exam-audit-sources'
import type { AuditSource } from '../fixtures/exam-audit-sources'

// Real-AI audit of the written exam, one subject at a time. Costs are real (budget guard below).
// Usage: npx tsx --env-file=.env.local tests/accuracy/exam-audit.ts <case> [<case> ...]
// Cases: turkce-4 matematik-7 fen-6 sosyal-7 ingilizce-8 edebiyat-10 matematik-11 fizik-10 kimya-11 biyoloji-9 tarih-10 cografya-9 felsefe-10 din-9 universite
//        biyoloji-9:higher biyoloji-9:recall tarih-10:meb v5:1 v5:2 v5:3

const BUDGET_USD = 3.65
const OUT = '../QUELIO-TEST-EXAM'
const COST_FILE = '../QUELIO-PROMPTS/quelio-exam-duzeltme-1-cost.jsonl'
const STATE_FILE = '../QUELIO-PROMPTS/quelio-exam-duzeltme-1-durum.md'
/** One exam costing more than this stops the run: something loops. */
const MAX_EXAM_USD = 0.1
// Every rejection the server and the generator make is recorded next to the exam, so a short exam can be explained without another AI call.
process.env.EXAM_TRACE = '1'
const stopOnMissing = process.env.EXAM_STOP_ON_MISSING === '1'

const BASE: Record<string, AuditSource> = {
  'turkce-4': sources.TURKCE_4,
  'matematik-7': sources.MATEMATIK_7,
  'fen-6': sources.FEN_6,
  'sosyal-7': sources.SOSYAL_7,
  'ingilizce-8': sources.INGILIZCE_8,
  'edebiyat-10': sources.EDEBIYAT_10,
  'matematik-11': sources.MATEMATIK_11,
  'fizik-10': sources.FIZIK_10,
  'kimya-11': sources.KIMYA_11,
  'biyoloji-9': sources.BIYOLOJI_9,
  'tarih-10': sources.TARIH_10,
  'cografya-9': sources.COGRAFYA_9,
  'felsefe-10': sources.FELSEFE_10,
  'din-9': sources.DIN_9,
  universite: sources.ECONOMICS_UNI,
  v5: sources.BIYOLOJI_600,
  'kisa-150': sources.SHORT_150,
}

interface Variant {
  key: string
  source: AuditSource
  suffix: string
  /** `#n` cases: an independent run, made as if no earlier exam of the teacher existed (reliability runs). */
  fresh?: boolean
  /** The setup screen's "adjust question types" button was pressed. */
  adjustTypes?: boolean
  bloom?: BloomSetting
  meb?: boolean
  distribution?: { text: string; count: number }[]
}

function variantOf(spec: string): Variant {
  const [plain, run] = spec.split('#')
  if (run) return { ...variantOf(plain), key: spec, suffix: `${variantOf(plain).suffix}-${run}`, fresh: true }
  const [base, extra = ''] = spec.split(':')
  const source = BASE[base]
  if (!source) throw new Error(`unknown case ${spec}`)
  if (base === 'v5') return { key: spec, source, suffix: `run${extra || '1'}` }
  if (extra === 'higher') return { key: spec, source, suffix: 'higher', bloom: 'higher' }
  if (extra === 'higher-adj') return { key: spec, source, suffix: 'higher-adj', bloom: 'higher', adjustTypes: true }
  if (extra === 'apply') return { key: spec, source, suffix: 'apply', bloom: '3' }
  if (extra === 'recall') return { key: spec, source, suffix: 'recall', bloom: '1' }
  if (extra === 'meb') {
    return {
      key: spec,
      source,
      suffix: 'meb',
      meb: true,
      distribution: [
        { text: 'Belgrad ve Rodos fetihleri ile Orta Avrupa seferleri', count: 2 },
        { text: 'Mohaç Meydan Muharebesi ve Viyana kuşatması', count: 3 },
        { text: 'Preveze Deniz Savaşı ve denizlerdeki üstünlük', count: 3 },
        { text: 'Kanuni dönemi hukuk, mimari ve kültür', count: 5 },
      ],
    }
  }
  return { key: spec, source, suffix: 'default' }
}

function spent(): number {
  if (!existsSync(COST_FILE)) return 0
  return readFileSync(COST_FILE, 'utf8').split('\n').filter(Boolean).reduce((sum, row) => sum + (JSON.parse(row) as { costUsd: number }).costUsd, 0)
}

const memories: StoredMemory[] = []

async function audit(variant: Variant): Promise<void> {
  if (spent() >= BUDGET_USD - 0.05) {
    console.log(`BUDGET REACHED: $${spent().toFixed(4)} of $${BUDGET_USD}. Stop and ask.`)
    process.exit(2)
  }
  const { source } = variant
  let settings: ExamSettings = defaultExamSettings(new Date('2026-10-10'))
  settings = settingsWithHeader(settings, { school: 'Atatürk Anadolu Lisesi', academicYear: '2026-2027', term: 1, examNo: 1, course: source.course, grade: source.grade, section: 'A', teacher: 'Deneme Öğretmen' })
  settings.outputLanguage = source.outputLanguage
  settings.groups = true
  if (variant.bloom) settings.bloom = variant.bloom
  if (variant.adjustTypes) settings.counts = countsForBloom(settings.counts, bloomTargetCounts(settings.bloom, settings.level, EXAM_QUESTION_TYPES.reduce((sum, type) => sum + settings.counts[type], 0)))
  if (variant.meb) {
    settings.format = 'meb'
    settings.counts = { ...settings.counts, 'true-false': 0, mcq: 0, 'fill-blanks': 0, matching: 0, 'open-ended': 10, 'short-answer': 10 }
    settings.answerKey = true
  }
  if (variant.distribution) settings.distribution = variant.distribution
  const total = EXAM_QUESTION_TYPES.reduce((sum, type) => sum + settings.counts[type], 0)

  const words = source.text.trim().split(/\s+/).length
  const events: RequestContext['events'] = []
  const context: RequestContext = { userId: 'audit', feature: 'generate', events }
  let calls = 0
  let sectionCalls = 0
  let plan: ExamFact[] = []
  const trace: unknown[] = []
  const realLog = console.log
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ')
    if (line.startsWith('  TRACE')) trace.push(line.trim())
    realLog(...args)
  }
  const callSection = async (request: ExamSectionRequest) => {
    calls += 1
    sectionCalls += 1
    const { status, body } = await handleGenerateRequest({ mode: 'exam_section', ...request })
    if (status !== 200 || !('questions' in body)) {
      trace.push({ section: request.type, count: request.count, error: 'error' in body ? body.error : status })
      throw new ExamApiError('error' in body && (body.error === 'parse' || body.error === 'empty_section') ? body.error : 'upstream')
    }
    const got = body.questions as ExamQuestion[]
    trace.push({ section: request.type, count: request.count, asked: (request.facts ?? []).map((fact) => fact.id), returned: got.map((q) => ({ factId: q.factId, stem: q.stem.slice(0, 90) })) })
    return got
  }
  const callVerify = async (request: ExamVerifyRequest): Promise<ExamVerifyResult> => {
    calls += 1
    const { status, body } = await handleGenerateRequest(examVerifyPayload(request))
    if (status !== 200 || 'error' in body) throw new ExamApiError('upstream')
    return parseVerifyResult(body as unknown as Record<string, unknown>)
  }
  const callPlan = async (request: ExamPlanRequest): Promise<ExamFact[]> => {
    calls += 1
    const { status, body } = await handleGenerateRequest({ mode: 'exam_plan', ...request })
    if (status !== 200 || !('facts' in body)) throw new ExamApiError('upstream')
    if (!request.existing || request.existing.length === 0) plan = body.facts
    trace.push({ plan: request.count, existing: request.existing?.length ?? 0, got: body.facts.length })
    return body.facts
  }

  // A later V5 exam in a new process remembers the earlier ones from their saved files.
  const runNumber = /^run(\d+)$/.exec(variant.suffix)?.[1]
  if (runNumber) {
    for (let earlierRun = 1; earlierRun < Number(runNumber); earlierRun += 1) {
      const file = `${OUT}/${source.folder}/run${earlierRun}.json`
      if (!existsSync(file) || memories.some((entry) => entry.id === `saved-${earlierRun}`)) continue
      const saved = JSON.parse(readFileSync(file, 'utf8')) as WrittenExam
      if (saved.settings.sourceMemory) memories.push({ id: `saved-${earlierRun}`, createdAt: saved.createdAt, memory: saved.settings.sourceMemory as NonNullable<ExamSettings['sourceMemory']> })
    }
  }
  const same = variant.fresh ? [] : memoriesForSource(source.text, memories)
  const earlier = earlierFromMemories(same)
  const state: ExamGenerationState = { done: new Map() }
  const started = Date.now()
  let questions: ExamQuestion[] = []
  let missing = 0
  let failure = ''
  const roundIssues: string[] = []
  await runWithRequestContext(context, async () => {
    try {
      const result = await generateExamQuestions({ settings, text: source.text, state, callSection, callVerify, callPlan, earlier, acceptFewer: words / total < EXAM_WORDS_PER_QUESTION, onIssues: (round, issues) => {
        roundIssues.push(`round ${round}: ${issues.map((issue) => issue.rule).join(',') || 'none'}`)
        if (process.env.EXAM_TRACE) {
          for (const issue of issues) {
            const found = state.current?.find((candidate) => candidate.id === issue.id)
            const review = issue.id ? state.judge?.reviews.get(issue.id) : undefined
            console.log(`  TRACE r${round} ${issue.rule} [${found?.type}] ${found?.stem.slice(0, 70) ?? ''} => ${(found?.answer ?? '').slice(0, 40)} | judge copy=${review?.copy} level=${review?.level}`)
          }
        }
      } })
      questions = result.questions
      missing = result.missing
    } catch (error) {
      failure = error instanceof ExamApiError ? `${error.code}: ${error.rules.join(' | ')}` : error instanceof ExamShortSourceError ? `short_source(${error.max})` : error instanceof ExamDistributionError ? `distribution(${error.rows.map((row) => `${row.text} ${row.found}/${row.wanted}`).join('; ')})` : String(error)
    }
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  const costUsd = events.reduce((sum, event) => sum + event.costUsd, 0)
  console.log = realLog
  appendFileSync(COST_FILE, JSON.stringify({ case: variant.key, costUsd, calls, seconds }) + '\n')
  appendFileSync(STATE_FILE, `- ${new Date().toISOString().slice(0, 16)} ${variant.key}: $${costUsd.toFixed(4)}, ${calls} calls, ${seconds}s, ${failure ? 'FAIL ' + failure.slice(0, 80) : missing > 0 ? `eksik ${missing}` : 'tam'} (toplam $${spent().toFixed(4)})\n`)

  const folder = `${OUT}/${source.folder}`
  mkdirSync(folder, { recursive: true })
  writeFileSync(`${folder}/${variant.suffix}.trace.json`, JSON.stringify(trace, null, 1))
  if (costUsd > MAX_EXAM_USD) {
    console.log(`COST LIMIT: ${variant.key} cost $${costUsd.toFixed(4)} (> $${MAX_EXAM_USD}). Stopped to find out why.`)
    process.exitCode = 4
  }
  if (failure) {
    if (stopOnMissing) process.exitCode = 3
    console.log(`${variant.key}: FAIL ${failure} | ${seconds}s | $${costUsd.toFixed(4)} | calls ${calls} | ${roundIssues.join(' ; ')}`)
    return
  }

  const exam: WrittenExam = {
    id: newExamId(),
    title: `${source.course} ${source.grade}`,
    settings: { ...settings, sourceMemory: buildMemory(source.text, questions) },
    questions,
    sourceQuizId: null,
    sourceText: source.text,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  if (!variant.fresh) memories.push({ id: exam.id, createdAt: exam.createdAt, memory: exam.settings.sourceMemory as NonNullable<ExamSettings['sourceMemory']> })

  // --- the automatic rule report -------------------------------------------------------------------------
  const judge = state.judge
  const copyable = new Map([...(judge?.reviews ?? [])].map(([id, review]) => [id, review.copy]))
  const rules = checkExamQuality(questions, settings.counts, { topics: settings.topics, judged: judge?.judged, copyable }).filter((issue) => issue.rule !== 'points')
  const counts: Record<string, number> = {}
  for (const q of questions) counts[q.type] = (counts[q.type] ?? 0) + 1
  const targets = bloomTargetCounts(settings.bloom, settings.level, total)
  const wanted = planBloom(settings.counts, targets).achieved
  const gotBloom = [1, 2, 3, 4, 5, 6].map((level) => questions.filter((q) => q.bloomLevel === level).length)
  const mcq = questions.filter((q) => q.type === 'mcq')
  const letters = [0, 1, 2, 3, 4].map((index) => mcq.filter((q) => q.answerIndex === index).length)
  const tf = questions.filter((q) => q.type === 'true-false')
  const shorts = questions.filter((q) => q.type === 'short-answer')
  const patterns = new Map<string, number>()
  for (const q of mcq) patterns.set(stemPattern(q.stem), (patterns.get(stemPattern(q.stem)) ?? 0) + 1)
  const clusters = clusterTopics(plan)
  const planShare = new Map<number, number>()
  for (const c of clusters) planShare.set(c, (planShare.get(c) ?? 0) + 1)
  const dist = distributionRows(questions.map((q, i) => ({ ...q, number: i + 1 })))
  const report = {
    case: variant.key,
    ok: rules.filter((issue) => !SOFT_RULES.includes(issue.rule)).length === 0 && missing === 0,
    softLeft: rules.filter((issue) => SOFT_RULES.includes(issue.rule) && issue.rule !== 'term-repeat').map((issue) => `${issue.rule}:${issue.id}`),
    seconds,
    costUsd: Number(costUsd.toFixed(4)),
    calls,
    sectionCalls,
    missing,
    wordsPerQuestionAvailable: Number((words / total).toFixed(1)),
    maxQuestionsForWords: maxQuestionsForWords(words),
    rounds: roundIssues,
    remainingRules: rules.filter((issue) => !SOFT_RULES.includes(issue.rule)).map((issue) => `${issue.rule}:${issue.id}`),
    counts,
    bloomWanted: wanted,
    // Per type: the levels the plan gave its slots against the levels the exam ended with (the judge's reading); equal where the type can reach the level.
    levelsByType: Object.fromEntries(EXAM_QUESTION_TYPES.filter((type) => settings.counts[type] > 0).map((type) => [type, { planned: planBloom(settings.counts, targets).perType[type], got: questions.filter((q) => q.type === type).map((q) => q.bloomLevel ?? 0).sort((a, b) => a - b) }])),
    bloomGot: gotBloom,
    difficulty: { easy: questions.filter((q) => q.difficulty === 'easy').length, medium: questions.filter((q) => q.difficulty === 'medium').length, hard: questions.filter((q) => q.difficulty === 'hard').length },
    typeLimitViolations: questions.filter((q) => q.bloomLevel !== undefined && q.bloomLevel > BLOOM_CAP[q.type]).map((q) => q.id),
    mcq: { letters, correctIsLongest: mcq.filter(correctIsLongest).length, of: mcq.length, stemPatterns: Object.fromEntries(patterns) },
    trueFalse: { true: tf.filter((q) => q.answerBool).length, of: tf.length },
    shortAnswer: shorts.map((q) => ({ id: q.id, answer: q.answer, problems: shortAnswerProblems(q) })).filter((entry) => entry.problems.length > 0),
    topics: dist.map((row) => `${row.topic}: ${row.count} soru / ${row.points} puan`),
    planTopics: [...planShare.values()],
    earlierExams: same.length,
  }

  // --- readable exam for reading every question --------------------------------------------------------
  const labels = paperLabels('tr')
  const lines: string[] = [`# ${variant.key} (${source.course} ${source.grade}) — ${seconds}s, $${costUsd.toFixed(4)}`, '', '```json', JSON.stringify(report, null, 1), '```', '']
  questions.forEach((q, index) => {
    lines.push(`## ${index + 1}. [${q.type}] ${q.points} puan — ${labels.difficulty[q.difficulty]} / Bloom ${q.bloomLevel ?? '-'} / konu: ${q.topic} / kavram: ${q.concept ?? '-'}`)
    if (q.context) lines.push(`> ${q.context}`)
    lines.push(q.stem)
    if (q.options) q.options.forEach((option, i) => lines.push(`   ${String.fromCharCode(65 + i)}) ${option}${i === q.answerIndex ? '  ✔' : ''}`))
    if (q.pairs) {
      q.pairs.forEach((pair) => lines.push(`   ${pair.left}  =  ${pair.right}`))
      if (q.extras?.length) lines.push(`   (fazla: ${q.extras.join(' / ')})`)
    }
    if (q.type === 'true-false') lines.push(`   cevap: ${q.answerBool ? 'Doğru' : 'Yanlış'}`)
    if (q.type !== 'mcq' && q.type !== 'true-false' && q.type !== 'matching') lines.push(`   cevap: ${q.answer}${q.acceptableAnswers?.length ? ` (kabul: ${q.acceptableAnswers.join(' / ')})` : ''}`)
    if (q.rubric.length > 0 && (q.type === 'open-ended' || q.type === 'short-answer')) for (const item of q.rubric) lines.push(`   - ${item.text} (${item.points})`)
    lines.push(`   fact: ${q.fact ?? '-'}`, '')
  })
  lines.push('## Konu-soru dağılımı', ...specRows(questions.map((q, i) => ({ ...q, number: i + 1 }))).map((row) => `- ${row.topic}: ${row.cells.map((cell, level) => (cell.length ? `B${level + 1}=${cell.join(',')}` : '')).filter(Boolean).join(' ')}`))
  writeFileSync(`${folder}/${variant.suffix}.json`, JSON.stringify(exam, null, 2))
  writeFileSync(`${folder}/${variant.suffix}.md`, lines.join('\n'))
  void chooseFacts
  void correctAnswerText
  void factSimilarity
  if (stopOnMissing && missing > 0) process.exitCode = 3
  console.log(`${variant.key}: ${report.ok ? 'RULES OK' : 'RULES ' + JSON.stringify(report.remainingRules)} | ${seconds}s | $${costUsd.toFixed(4)} | calls ${calls} | ${JSON.stringify(counts)} | missing ${missing} | bloom ${gotBloom.join('/')} (wanted ${wanted.join('/')}) | total spent $${spent().toFixed(4)}`)
}

mkdirSync('../QUELIO-PROMPTS', { recursive: true })
for (const spec of process.argv.slice(2)) {
  // The memory of earlier V5 exams from the same text is what makes the next one different (V1).
  await audit(variantOf(spec))
  // A cost overrun, or (with EXAM_STOP_ON_MISSING=1) an exam that came out short, stops the sequence.
  if (process.exitCode) break
}
