import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { handleGenerateRequest } from '../../api/_lib/generate'
import { runWithRequestContext } from '../../api/_lib/request-context'
import type { RequestContext } from '../../api/_lib/request-context'
import { ExamApiError, examVerifyPayload, parseVerifyResult } from '../../src/api/exam'
import type { ExamFact, ExamPlanRequest, ExamSectionRequest, ExamVerifyRequest, ExamVerifyResult } from '../../src/api/exam'
import { ExamShortSourceError, generateExamQuestions } from '../../src/lib/exam/generate'
import { checkExamQuality } from '../../src/lib/exam/quality'
import { LONG_SOURCES, MATH_FORTY } from '../fixtures/exam-sources'
import { newExamId } from '../../src/lib/exam/factory'
import { EXAM_QUESTION_TYPES, defaultExamSettings } from '../../src/lib/exam/types'
import type { ExamQuestion, WrittenExam } from '../../src/lib/exam/types'

// Real-AI check of the written-exam generator: three exams, cost per exam.
// Run: npx tsx tests/accuracy/exam-quality.ts [outDir] [history|math|science]  (keys from the shell environment; costs are real).

const SHORT_SOURCES: Record<string, { text: string; course: string; grade: string; level: '9' | '10' | '8'; topics: string[] }> = {
  history: {
    course: 'Tarih',
    grade: '9',
    level: '9',
    topics: ['Orta Asya Türk devletleri', 'Göktürk yazıtları', 'Türklerde devlet teşkilatı'],
    text: `İlk Türk devletleri Orta Asya'da kurulmuştur. Bilinen en eski Türk devletlerinden biri Asya Hun Devleti'dir. Teoman'ın oğlu Mete Han, M.Ö. 209 yılında tahta çıkmış, orduyu onlu sisteme göre düzenlemiş ve devleti en geniş sınırlarına ulaştırmıştır. Ülke, doğu ve batı olmak üzere iki ana bölüme ayrılmıştı; bu bölümler hükümdarın yakın akrabaları tarafından yönetiliyordu. Hun ordusunda her on askerin başında bir kumandan bulunur, bu sistem yüzlük, binlik ve onbinlik birliklere kadar uzanırdı.

Göktürkler 552 yılında Bumin Kağan önderliğinde Avar egemenliğine son vererek devletlerini kurdular. Devlet, Bumin ile kardeşi İstemi Yabgu arasında doğu ve batı olarak paylaşılmıştır. Göktürkler, Türk adını bir devletin adı olarak kullanan ilk Türk topluluğudur. Orhun Yazıtları olarak bilinen Bilge Kağan, Kül Tigin ve Tonyukuk yazıtları 8. yüzyılda dikilmiş, Türkçenin bilinen en eski yazılı belgeleridir. Yazıtlarda Türk milletinin bağımsızlık mücadelesi, devletin zayıflama nedenleri ve halka öğütler anlatılır. Göktürk alfabesi, yazıtların bulunduğu Orhun Vadisi'nin adıyla anılan Orhun alfabesidir.

Türklerde devlet yönetiminde kağan, töre denilen kurallara bağlıydı. Kağanın yetkileri danışma meclisi olan kurultay ile sınırlandırılmıştı. Kurultay; devlet işlerinin, savaş ve barış kararlarının ve kağan seçiminin görüşüldüğü meclisti. Hükümdarın halka karşı sorumluluğu, devlet anlayışında önemli bir yer tutardı. Hükümdarlık "kut" anlayışına dayanır; Türklere göre yönetme yetkisi Tanrı tarafından kağana verilmiştir.

Uygurlar ise 744 yılında Göktürklerin yıkılmasından sonra Ötüken bölgesinde devlet kurdu. Uygurlar yerleşik hayata geçen ilk Türk topluluklarından biridir; tarım, ticaret ve el sanatlarıyla uğraştılar. Maniheizm ve Budizm'i kabul ettiler, Uygur alfabesini kullandılar ve kağıt, matbaa gibi alanlarda kültürel katkılar yaptılar. Başkentleri Ordubalık'tı.`,
  },
  math: {
    course: 'Matematik',
    grade: '10',
    level: '10',
    topics: ['İkinci dereceden denklemler', 'Diskriminant', 'Kökler toplamı ve çarpımı'],
    text: `İkinci dereceden bir bilinmeyenli denklem, a ≠ 0 olmak üzere ax² + bx + c = 0 biçiminde yazılır. Burada a, b ve c gerçek sayılardır. Denklemin köklerini bulmak için diskriminant kullanılır. Diskriminant Δ = b² − 4ac ifadesiyle hesaplanır. Δ > 0 ise denklemin birbirinden farklı iki gerçek kökü vardır; Δ = 0 ise denklemin eşit iki gerçek kökü (çift katlı kök) bulunur; Δ < 0 ise denklemin gerçek kökü yoktur.

Kökler, x₁,₂ = (−b ± √Δ) / (2a) formülüyle bulunur. Örneğin x² − 5x + 6 = 0 denkleminde a = 1, b = −5, c = 6 olduğundan Δ = 25 − 24 = 1 olur ve kökler x₁ = (5 + 1)/2 = 3 ile x₂ = (5 − 1)/2 = 2 şeklindedir.

Kökler toplamı ve çarpımı katsayılardan doğrudan bulunabilir. Köklerin toplamı x₁ + x₂ = −b/a, çarpımı ise x₁ · x₂ = c/a değerine eşittir. Yukarıdaki örnekte x₁ + x₂ = 5 ve x₁ · x₂ = 6 olarak doğrulanır. Kökleri x₁ ve x₂ olan ikinci dereceden denklem x² − (x₁ + x₂)x + x₁x₂ = 0 biçiminde yazılabilir. Örneğin kökleri 2 ve −3 olan denklem x² + x − 6 = 0 olur.

Bir ikinci dereceden fonksiyonun grafiği paraboldür. y = ax² + bx + c fonksiyonunda a > 0 ise parabolün kolları yukarı, a < 0 ise aşağı doğrudur. Parabolün tepe noktasının apsisi x = −b/(2a) değerindedir. Parabol x eksenini Δ > 0 ise iki noktada keser, Δ = 0 ise tek noktada teğet olur, Δ < 0 ise x eksenini kesmez. Eksenleri kestiği nokta olarak y eksenini (0, c) noktasında keser.`,
  },
  science: {
    course: 'Science',
    grade: '8',
    level: '8',
    topics: ['States of matter', 'Density', 'Changes of state'],
    text: `Matter is anything that has mass and takes up space. It is usually found in three common states: solid, liquid and gas. In a solid, the particles are packed closely together in a fixed pattern and can only vibrate in place, so a solid keeps its own shape and volume. In a liquid, the particles are close together but can slide past one another. A liquid has a fixed volume but takes the shape of its container. In a gas, the particles are far apart and move quickly in all directions, so a gas has no fixed shape or volume and fills any container.

A change of state happens when matter is heated or cooled. Melting is the change from solid to liquid, and freezing is the reverse. Water melts and freezes at 0 degrees Celsius. Boiling, or evaporation at the surface, is the change from liquid to gas, and condensation is the change from gas back to liquid. Water boils at 100 degrees Celsius at sea level. Sublimation is a change directly from solid to gas without becoming a liquid; dry ice, which is solid carbon dioxide, shows sublimation. During a change of state the temperature stays constant even though heat is still being added, because the energy is used to separate the particles rather than to make them move faster.

Density describes how much mass a substance has in a given volume. It is calculated with the formula density = mass divided by volume. For example, a block with a mass of 200 grams and a volume of 50 cubic centimetres has a density of 4 grams per cubic centimetre. Objects with a density lower than water, which is 1 gram per cubic centimetre, float, while denser objects sink. Ice floats on liquid water because water expands when it freezes, which makes ice less dense than liquid water. This property is unusual, since most substances are denser as solids than as liquids.`,
  },
}

// The default runs use sources of about 700 words (a textbook section); `short` uses the 250-word texts of the first quality check.
const SOURCES: Record<string, { text: string; course: string; grade: string; level: '9' | '10' | '8'; topics: string[] }> = {
  ...LONG_SOURCES,
  'math-40': MATH_FORTY,
  'history-short': SHORT_SOURCES.history,
  'math-short': SHORT_SOURCES.math,
  'science-short': SHORT_SOURCES.science,
}

function line(label: string, value: unknown) {
  console.log(`${label}: ${value}`)
}

interface RunResult {
  key: string
  run: number
  ok: boolean
  failure: string
  seconds: number
  costUsd: number
  requested: Record<string, number>
  produced: Record<string, number>
  calls: number
  issues: string[]
  exam?: WrittenExam
}

function logRound(key: string, run: number, round: number, rules: string[]) {
  if (!process.env.EXAM_LOG) return
  const counts: Record<string, number> = {}
  for (const rule of rules) counts[rule] = (counts[rule] ?? 0) + 1
  console.log(`  [${key} #${run}] round ${round}: ${JSON.stringify(counts)}`)
}

/** One exam with the default settings, through the same generator the browser runs; only the HTTP calls are replaced by the server code. */
async function generate(key: string, run: number): Promise<RunResult> {
  const src = SOURCES[key]
  const settings = defaultExamSettings(new Date('2026-10-10'))
  settings.header = { school: 'Atatürk Anadolu Lisesi', academicYear: '2026-2027', term: 1, examNo: 1, course: src.course, grade: src.grade, section: 'A', teacher: 'Deneme Öğretmen' }
  settings.level = src.level
  settings.topics = src.topics
  settings.groups = true
  if (process.env.EXAM_FORTY) settings.counts = { ...settings.counts, 'open-ended': 10, 'short-answer': 10, 'true-false': 10, mcq: 10 }

  const events: RequestContext['events'] = []
  const context: RequestContext = { userId: 'accuracy', feature: 'generate', events }
  let calls = 0
  const timed = async <T>(label: string, work: () => Promise<T>): Promise<T> => {
    const began = Date.now()
    try {
      return await work()
    } finally {
      if (process.env.EXAM_FORTY) console.log(`  TIMING ${label} ${Math.round((Date.now() - began) / 100) / 10}s`)
    }
  }
  const callSection = async (request: ExamSectionRequest): Promise<ExamQuestion[]> => {
    calls += 1
    const { status, body } = await timed(`section ${request.type} x${request.count}`, () => handleGenerateRequest({ mode: 'exam_section', ...request }))
    if (process.env.EXAM_LOG) console.log(`  [${key} #${run}] section ${request.type} x${request.count}${request.trueFalseAnswer === undefined ? '' : ` tf=${request.trueFalseAnswer}`} facts=${request.facts?.length ?? 0} -> ${'questions' in body ? body.questions.length : 'error:' + ('error' in body ? body.error : status)}`)
    if (status !== 200 || !('questions' in body)) throw new ExamApiError('error' in body && body.error === 'parse' ? 'parse' : 'upstream')
    return body.questions as ExamQuestion[]
  }
  const callVerify = async (request: ExamVerifyRequest): Promise<ExamVerifyResult> => {
    calls += 1
    const { status, body } = await timed(`verify items=${request.questions.length} pairs=${request.pairs?.length ?? 0}`, () => handleGenerateRequest(examVerifyPayload(request)))
    if (status !== 200 || 'error' in body) throw new ExamApiError('upstream')
    const parsed = parseVerifyResult(body as unknown as Record<string, unknown>)
    if (process.env.EXAM_LOG) {
      console.log(`  [${key} #${run}] verify items=${request.questions.length} pairs=${request.pairs?.length ?? 0} wrong=${parsed.wrong.length} same=${parsed.same.join(',')}`)
      for (const pair of request.pairs ?? []) console.log(`     ${pair.id} ${parsed.same.includes(pair.id) ? 'SAME' : 'diff'} | ${pair.a.slice(0, 90)} || ${pair.b.slice(0, 90)}`)
    }
    return parsed
  }
  const callPlan = async (request: ExamPlanRequest): Promise<ExamFact[]> => {
    calls += 1
    const { status, body } = await timed(`plan count=${request.count}`, () => handleGenerateRequest({ mode: 'exam_plan', ...request }))
    if (status !== 200 || !('facts' in body)) throw new ExamApiError('upstream')
    return body.facts
  }
  const started = Date.now()
  let questions: ExamQuestion[] = []
  let failure = ''
  await runWithRequestContext(context, async () => {
    try {
      questions = await generateExamQuestions({ settings, text: src.text, state: { done: new Map() }, callSection, callVerify, callPlan, onIssues: (round, found) => logRound(key, run, round, found.map((issue) => issue.rule)) })
    } catch (error) {
      failure = error instanceof ExamApiError ? `${error.code}: ${error.rules.join(' | ')}` : error instanceof ExamShortSourceError ? `short_source(${error.max})` : String(error)
    }
  })
  const produced: Record<string, number> = {}
  for (const question of questions) produced[question.type] = (produced[question.type] ?? 0) + 1
  const result: RunResult = {
    key,
    run,
    ok: failure === '',
    failure,
    seconds: Math.round((Date.now() - started) / 1000),
    costUsd: events.reduce((sum, event) => sum + event.costUsd, 0),
    requested: Object.fromEntries(EXAM_QUESTION_TYPES.filter((type) => settings.counts[type] > 0).map((type) => [type, settings.counts[type]])),
    produced,
    calls,
    issues: failure ? [] : [...new Set(checkExamQuality(questions, settings.counts, { topics: settings.topics, uncertainIsDuplicate: false }).map((issue) => issue.rule))],
  }
  if (!failure) {
    result.exam = {
      id: newExamId(),
      title: `${src.course} ${src.grade}. sınıf 1. dönem 1. yazılı`,
      settings,
      questions,
      sourceQuizId: null,
      sourceText: src.text,
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z',
    }
  }
  return result
}

// Usage: npx tsx --env-file=.env.local tests/accuracy/exam-quality.ts [outDir] [history|math|science|all] [runsPerSource]
const outDir = process.argv[2] ?? '../QUELIO-TEST-EXAM/exams'
mkdirSync(outDir, { recursive: true })
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3] : null
const runs = Number(process.argv[4] ?? 1)
const keys = only === 'short' ? ['history-short', 'math-short', 'science-short'] : only ? [only] : ['history', 'math', 'science']
// One exam after the other (never side by side). Every result is appended to test-results/exam-measure.jsonl the moment it is
// finished, so a killed process loses nothing; running the script again continues where it stopped.
const logFile = process.env.EXAM_FORTY ? 'test-results/exam-measure-40.jsonl' : 'test-results/exam-measure.jsonl'
mkdirSync('test-results', { recursive: true })
const doneBefore = new Set<string>()
const results: RunResult[] = []
if (existsSync(logFile)) {
  for (const row of readFileSync(logFile, 'utf8').split('\n').filter(Boolean)) {
    const parsed = JSON.parse(row) as RunResult
    if (!keys.includes(parsed.key) || parsed.run > runs) continue
    doneBefore.add(`${parsed.key}#${parsed.run}`)
    results.push(parsed)
  }
}
for (let run = 1; run <= runs; run += 1) {
  for (const key of keys) {
    if (doneBefore.has(`${key}#${run}`)) continue
    const result = await generate(key, run)
    results.push(result)
    const { exam, ...row } = result
    appendFileSync(logFile, JSON.stringify(row) + '\n')
    line(`${result.key} #${run}`, `${result.ok ? 'OK' : 'FAIL ' + result.failure} | ${result.seconds}s | $${result.costUsd.toFixed(4)} | calls ${result.calls} | ${JSON.stringify(result.produced)} | issues ${JSON.stringify(result.issues)}`)
    if (exam) writeFileSync(`${outDir}/${result.key}.json`, JSON.stringify(exam, null, 2))
  }
}
const summary = {
  runs: results.length,
  ok: results.filter((result) => result.ok).length,
  successRate: results.length ? results.filter((result) => result.ok).length / results.length : 0,
  meanSeconds: results.reduce((sum, result) => sum + result.seconds, 0) / Math.max(1, results.length),
  maxSeconds: Math.max(0, ...results.map((result) => result.seconds)),
  meanCostUsd: results.reduce((sum, result) => sum + result.costUsd, 0) / Math.max(1, results.length),
  totalCostUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
  failures: results.filter((result) => !result.ok).map((result) => `${result.key}#${result.run}: ${result.failure}`),
  remainingIssues: results.flatMap((result) => result.issues),
  countMismatches: results.filter((result) => result.ok && EXAM_QUESTION_TYPES.some((type) => (result.requested[type] ?? 0) !== (result.produced[type] ?? 0))).map((result) => `${result.key}#${result.run}`),
}
console.log('SUMMARY ' + JSON.stringify(summary))
