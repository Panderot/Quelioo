import { ExamApiError, generateExamSection, planExamFacts, verifyExamKeys } from '../../api/exam'
import type { ExamFact, ExamPlanRequest, ExamSectionRequest, ExamVerifyRequest, ExamVerifyResult } from '../../api/exam'
import { distributePoints } from './points'
import { SOFT_RULES, checkExamQuality, correctAnswerText, factSimilarity, pairKey, questionsToRewrite, repeatedTerms, trueFalseRange, uncertainPairs } from './quality'
import type { ExamQualityIssue } from './quality'
import { EXAM_QUESTION_TYPES } from './types'
import type { ExamDifficulty, ExamQuestion, ExamQuestionType, ExamSettings } from './types'

/** Questions asked of the model in one request: small enough to answer well inside the function limit. */
export const EXAM_CHUNK_SIZE = 6
const CONCURRENCY = 3
const VERIFY_ITEMS = 12
const VERIFY_PAIRS = 10
/** Facts planned per question asked for: the surplus is what a rewritten question draws its new fact from. */
export const PLAN_SURPLUS = 1.5
export const MAX_PLAN_FACTS = 60
/** Targeted rewrite rounds; a question still broken after them stops the exam. */
export const MAX_REPAIR_ROUNDS = 3

export interface ExamSection {
  key: string
  type: ExamQuestionType
  count: number
  difficulty: Record<ExamDifficulty, number>
  partIndex: number
  partCount: number
}

/** The source holds fewer distinct testable facts than the exam has questions. */
export class ExamShortSourceError extends Error {
  /** How many different questions the source can carry. */
  max: number

  constructor(max: number) {
    super('short_source')
    this.max = max
  }
}

/** One difficulty per question, spread evenly over the sequence so any slice of it follows the mix. */
function difficultySequence(total: number, mix: Record<ExamDifficulty, number>): ExamDifficulty[] {
  const keys: ExamDifficulty[] = ['medium', 'easy', 'hard']
  const weight = keys.reduce((sum, key) => sum + Math.max(0, mix[key]), 0) || 1
  const given: Record<ExamDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
  const sequence: ExamDifficulty[] = []
  for (let index = 0; index < total; index += 1) {
    let best = keys[0]
    let bestDeficit = -Infinity
    for (const key of keys) {
      const deficit = (Math.max(0, mix[key]) / weight) * (index + 1) - given[key]
      if (deficit > bestDeficit) {
        best = key
        bestDeficit = deficit
      }
    }
    given[best] += 1
    sequence.push(best)
  }
  return sequence
}

export function examQuestionTotal(settings: ExamSettings): number {
  return EXAM_QUESTION_TYPES.reduce((sum, type) => sum + settings.counts[type], 0)
}

/** The requests an exam needs: every type with a count, cut into chunks; the whole exam follows the difficulty mix. */
export function planExamSections(settings: ExamSettings): ExamSection[] {
  const total = examQuestionTotal(settings)
  const sequence = difficultySequence(total, settings.difficultyMix)
  const sections: ExamSection[] = []
  let cursor = 0
  for (const type of EXAM_QUESTION_TYPES) {
    const count = settings.counts[type]
    if (count <= 0) continue
    const chunks = Math.ceil(count / EXAM_CHUNK_SIZE)
    for (let index = 0; index < chunks; index += 1) {
      const size = Math.floor(count / chunks) + (index < count % chunks ? 1 : 0)
      const difficulty: Record<ExamDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
      for (const level of sequence.slice(cursor, cursor + size)) difficulty[level] += 1
      cursor += size
      sections.push({ key: `${type}-${index}`, type, count: size, difficulty, partIndex: index, partCount: chunks })
    }
  }
  return sections
}

/** Cuts the question counts down (largest types first) until they add up to `max`. */
export function reduceCounts(counts: Record<ExamQuestionType, number>, max: number): Record<ExamQuestionType, number> {
  const result = { ...counts }
  let total = EXAM_QUESTION_TYPES.reduce((sum, type) => sum + result[type], 0)
  while (total > max && total > 1) {
    const largest = EXAM_QUESTION_TYPES.reduce((best, type) => (result[type] > result[best] ? type : best), EXAM_QUESTION_TYPES[0])
    result[largest] -= 1
    total -= 1
  }
  return result
}

/** The answer of every true-false statement, spread evenly: about half true, never outside the allowed share. */
export function trueFalsePattern(total: number): boolean[] {
  if (total <= 0) return []
  const [min, max] = trueFalseRange(total)
  const trues = Math.min(max, Math.max(min, Math.round(total / 2)))
  return Array.from({ length: total }, (_, index) => Math.floor(((index + 1) * trues) / total) - Math.floor((index * trues) / total) === 1)
}

function requestFor(settings: ExamSettings, text: string, section: ExamSection, facts: ExamFact[], avoidStems: string[]): ExamSectionRequest {
  return {
    text,
    type: section.type,
    count: section.count,
    difficulty: section.difficulty,
    level: settings.level,
    outputLanguage: settings.outputLanguage,
    contextBased: settings.contextBased,
    optionsCount: settings.optionsCount,
    topics: settings.topics,
    avoidStems: avoidStems.slice(0, 40),
    partIndex: section.partIndex,
    partCount: section.partCount,
    facts,
  }
}

/** Where a section's true-false statements sit in the exam's true-false list. */
function trueFalseOffset(sections: ExamSection[], section: ExamSection): number {
  let offset = 0
  for (const other of sections) {
    if (other.key === section.key) break
    if (other.type === 'true-false') offset += other.count
  }
  return offset
}

type SectionCaller = (request: ExamSectionRequest, signal?: AbortSignal) => Promise<ExamQuestion[]>
type VerifyCaller = (request: ExamVerifyRequest, signal?: AbortSignal) => Promise<ExamVerifyResult>
type PlanCaller = (request: ExamPlanRequest, signal?: AbortSignal) => Promise<ExamFact[]>

export interface ExamGenerationState {
  /** Finished sections by key; kept between attempts so "try again" only repeats what failed. */
  done: Map<string, ExamQuestion[]>
  /** The distinct facts of the source (the plan), asked for once. */
  plan?: ExamFact[]
  /** Facts handed to each section, so a retry asks for the same ones. */
  assigned?: Map<string, ExamFact[]>
}

export interface GenerateExamOptions {
  settings: ExamSettings
  text: string
  state: ExamGenerationState
  signal?: AbortSignal
  /** `plan`: the facts are being looked for; `write`: sections are being written (done / total); `check`: the whole exam is being checked and rewritten where needed. */
  onProgress?: (done: number, total: number, phase: 'plan' | 'write' | 'check') => void
  /** The teacher accepted fewer questions: do not stop when the plan holds fewer facts than the exam has questions. */
  acceptFewer?: boolean
  /** Replace the /api/generate calls (the accuracy script runs the server code directly). */
  callSection?: SectionCaller
  callVerify?: VerifyCaller
  callPlan?: PlanCaller
  /** Reports what the check found in each round (the accuracy script prints it). */
  onIssues?: (round: number, issues: ExamQualityIssue[]) => void
}

interface Calls {
  section: SectionCaller
  verify: VerifyCaller
}

/** Plans the facts, writes one question per fact (3 sections at a time), checks the whole exam and rewrites what breaks a rule
 * with unused facts (at most 3 rounds). Throws the first API error after the running sections have finished; finished
 * sections and the plan stay in `state`. */
export async function generateExamQuestions({ settings, text, state, signal, onProgress, acceptFewer = false, callSection = generateExamSection, callVerify = verifyExamKeys, callPlan = planExamFacts, onIssues }: GenerateExamOptions): Promise<ExamQuestion[]> {
  const total = examQuestionTotal(settings)
  const sections = planExamSections(settings)
  const report = () => onProgress?.(sections.filter((section) => state.done.has(section.key)).length, sections.length, 'write')
  if (!state.plan) {
    onProgress?.(0, sections.length, 'plan')
    const wanted = Math.min(MAX_PLAN_FACTS, Math.ceil(total * PLAN_SURPLUS))
    state.plan = await callPlan({ text, level: settings.level, outputLanguage: settings.outputLanguage, topics: settings.topics, count: wanted }, signal)
  }
  const plan = state.plan
  if (plan.length < total && !acceptFewer) throw new ExamShortSourceError(plan.length)

  // One distinct fact for every question slot, in plan order; the rest of the plan is the reserve for rewrites.
  const usedFacts = new Set<string>()
  state.assigned ??= new Map()
  let cursor = 0
  for (const section of sections) {
    let facts = state.assigned.get(section.key)
    if (!facts) {
      facts = plan.slice(cursor, cursor + section.count)
      state.assigned.set(section.key, facts)
    }
    cursor += section.count
    for (const entry of facts) usedFacts.add(entry.fact)
  }

  report()
  const pending = sections.filter((section) => !state.done.has(section.key))
  const skipped = new Set<string>()
  let failure: unknown = null
  let next = 0
  const worker = async () => {
    while (failure === null && next < pending.length) {
      const section = pending[next++]
      try {
        const request = requestFor(settings, text, section, state.assigned?.get(section.key) ?? [], [])
        if (section.type === 'true-false') request.trueFalseAnswers = trueFalsePattern(settings.counts['true-false']).slice(trueFalseOffset(sections, section), trueFalseOffset(sections, section) + section.count)
        const questions = await callSection(request, signal)
        state.done.set(section.key, questions)
        report()
      } catch (error) {
        // A reply the server filtered down to nothing is not an outage: the questions are asked again below (and again on a retry).
        if (error instanceof ExamApiError && error.code === 'parse') skipped.add(section.key)
        else failure ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
  if (failure !== null) throw failure

  // Canonical order: by type, chunks in order.
  const merged: ExamQuestion[] = []
  for (const type of EXAM_QUESTION_TYPES) {
    const wanted = settings.counts[type]
    if (wanted <= 0) continue
    merged.push(...sections.filter((section) => section.type === type && !skipped.has(section.key)).flatMap((section) => state.done.get(section.key) ?? []).slice(0, wanted))
  }

  onProgress?.(sections.length, sections.length, 'check')
  // Whole-exam quality check. Keys of true-false and multiple-choice questions are read a second time against the source (a
  // wrong key is corrected from that reading), uncertain pairs are put to a judge, and whatever still breaks a rule is rewritten.
  const calls: Calls = { section: callSection, verify: callVerify }
  const judge: JudgeState = { verified: new Set(), judged: new Map() }
  let current = merged
  let issues = await issuesOf(current, settings, text, judge, calls, signal)
  onIssues?.(0, issues)
  for (let round = 0; round < MAX_REPAIR_ROUNDS && issues.length > 0; round += 1) {
    // A subject word used a little too often is worth one rewrite, not more.
    if (round >= 1 && issues.every((issue) => SOFT_RULES.includes(issue.rule))) break
    const drop = questionsToRewrite(issues)
    current = await rewriteQuestions({
      settings,
      text,
      plan,
      usedFacts,
      avoidTerms: repeatedTerms(current, settings.topics),
      kept: current.filter((question) => !drop.has(question.id)),
      dropped: current.filter((question) => drop.has(question.id)),
      signal,
      callSection,
    })
    onProgress?.(sections.length, sections.length, 'check')
    issues = await issuesOf(current, settings, text, judge, calls, signal)
    onIssues?.(round + 1, issues)
  }
  const blocking = issues.filter((issue) => !SOFT_RULES.includes(issue.rule))
  if (blocking.length > 0) throw new ExamApiError('quality', blocking.map((issue) => `${issue.rule}${issue.type ? `:${issue.type}` : ''}${issue.with ? ` (${issue.with.how} with: ${current.find((question) => question.id === issue.with?.id)?.stem.slice(0, 70) ?? ''})` : ''} ${current.find((question) => question.id === issue.id)?.stem.slice(0, 90) ?? ''}`))

  const scored = distributePoints(sortByType(current), 100)
  if (checkExamQuality(scored, settings.counts, { topics: settings.topics, judged: judge.judged }).some((issue) => !SOFT_RULES.includes(issue.rule))) throw new ExamApiError('quality')
  return scored
}

interface JudgeState {
  /** Ids of the questions whose key has been read a second time. */
  verified: Set<string>
  /** Verdicts on uncertain pairs (`pairKey` → both test the same fact). */
  judged: Map<string, boolean>
}

function sortByType(questions: ExamQuestion[]): ExamQuestion[] {
  const order = new Map(EXAM_QUESTION_TYPES.map((type, index) => [type, index]))
  return [...questions].sort((a, b) => (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0))
}

/** What a judge needs to compare two questions. */
function pairText(question: ExamQuestion): string {
  const context = question.context ? `${question.context} ` : ''
  return `${context}${question.stem} => ${correctAnswerText(question)}`.slice(0, 600)
}

/** Corrects a key from the second reading of the source. */
function applyFix(question: ExamQuestion, result: ExamVerifyResult): ExamQuestion {
  const fix = result.fixes.find((entry) => entry.id === question.id)
  if (!fix) return question
  if (question.type === 'true-false' && fix.answerBool !== undefined) return { ...question, answerBool: fix.answerBool, answer: String(fix.answerBool) }
  if (question.type === 'mcq' && fix.answerIndex !== undefined && question.options && fix.answerIndex < question.options.length) return { ...question, answerIndex: fix.answerIndex, answer: question.options[fix.answerIndex] }
  return question
}

/** Reads the open keys and judges the open pairs (the same call carries both); a call that cannot be made leaves them open. */
async function consult(list: ExamQuestion[], settings: ExamSettings, text: string, judge: JudgeState, calls: Calls, signal?: AbortSignal): Promise<ExamQuestion[]> {
  const open = list.filter((question) => (question.type === 'true-false' || question.type === 'mcq') && !judge.verified.has(question.id))
  const pairs = uncertainPairs(list).filter((pair) => !judge.judged.has(pair.key))
  const batches = Math.max(Math.ceil(open.length / VERIFY_ITEMS), Math.ceil(pairs.length / VERIFY_PAIRS))
  if (batches === 0) return list
  const corrected = new Map<string, ExamQuestion>()
  await Promise.all(
    Array.from({ length: batches }, async (_, index) => {
      const questions = open.slice(index * VERIFY_ITEMS, (index + 1) * VERIFY_ITEMS)
      const slice = pairs.slice(index * VERIFY_PAIRS, (index + 1) * VERIFY_PAIRS)
      try {
        const result = await calls.verify({ text, questions, pairs: slice.map((pair, position) => ({ id: `p${position}`, a: pairText(pair.first), b: pairText(pair.second) })) }, signal)
        for (const question of questions) {
          corrected.set(question.id, applyFix(question, result))
          judge.verified.add(question.id)
        }
        slice.forEach((pair, position) => judge.judged.set(pair.key, result.same.includes(`p${position}`)))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
      }
    }),
  )
  void settings
  return list.map((question) => corrected.get(question.id) ?? question)
}

/** Every rule break that needs the model (the points rule is repaired by `distributePoints`). */
async function issuesOf(list: ExamQuestion[], settings: ExamSettings, text: string, judge: JudgeState, calls: Calls, signal?: AbortSignal): Promise<ExamQualityIssue[]> {
  const checked = await consult(list, settings, text, judge, calls, signal)
  // The caller keeps working on `list`; corrected keys are written back into the same objects' places by id.
  for (const [index, question] of list.entries()) list[index] = checked[index] ?? question
  // The plan gives every question its own fact; a word used often is a topic, not a repeat: only hard rules trigger a rewrite.
  return checkExamQuality(list, settings.counts, { topics: settings.topics, judged: judge.judged }).filter((issue) => issue.rule !== 'points' && !SOFT_RULES.includes(issue.rule))
}

interface RewriteOptions {
  settings: ExamSettings
  text: string
  plan: ExamFact[]
  usedFacts: Set<string>
  kept: ExamQuestion[]
  dropped: ExamQuestion[]
  avoidTerms: string[]
  signal?: AbortSignal
  callSection: SectionCaller
}

/** Asks for exactly the questions the exam is short of (per type, true-false split by answer), each on a fact not used yet. */
async function rewriteQuestions({ settings, text, plan, usedFacts, kept, dropped, avoidTerms, signal, callSection }: RewriteOptions): Promise<ExamQuestion[]> {
  const avoidStems = kept.map((question) => question.stem)
  const avoidAnswers = kept.map(correctAnswerText).filter(Boolean)
  // The facts of the questions being rewritten are spent; if the reserve is empty the oldest of them is tried again.
  const spent = dropped.map((question) => question.fact).filter((fact): fact is string => Boolean(fact))
  const reserve = plan.filter((entry) => !usedFacts.has(entry.fact))
  // The new fact is the one least like any fact already on the exam, so a rewrite does not land next to the question it replaces.
  const onExam = kept.map((question) => question.fact).filter((fact): fact is string => Boolean(fact))
  const likeness = (entry: ExamFact) => onExam.reduce((most, fact) => Math.max(most, factSimilarity(entry.fact, fact)), 0)
  const takeFact = (): ExamFact | undefined => {
    reserve.sort((a, b) => likeness(a) - likeness(b))
    const fresh = reserve.shift()
    if (fresh) {
      usedFacts.add(fresh.fact)
      onExam.push(fresh.fact)
      return fresh
    }
    const again = spent.shift()
    return again ? plan.find((entry) => entry.fact === again) : undefined
  }
  const requests: { type: ExamQuestionType; request: ExamSectionRequest }[] = []
  for (const type of EXAM_QUESTION_TYPES) {
    const keptOfType = kept.filter((question) => question.type === type)
    const needed = settings.counts[type] - keptOfType.length
    if (needed <= 0) continue
    const levels = dropped.filter((question) => question.type === type).map((question) => question.difficulty)
    // True-false: the answers still missing to keep about half true, listed one per new statement.
    let answers: boolean[] = []
    if (type === 'true-false') {
      const [min, max] = trueFalseRange(settings.counts[type])
      const keptTrue = keptOfType.filter((question) => question.answerBool === true).length
      const wantTrue = Math.min(max, Math.max(min, Math.round(settings.counts[type] / 2)))
      const needTrue = Math.min(needed, Math.max(0, wantTrue - keptTrue))
      answers = [...Array.from({ length: needTrue }, () => true), ...Array.from({ length: needed - needTrue }, () => false)]
    }
    for (let done = 0; done < needed; done += EXAM_CHUNK_SIZE) {
      const count = Math.min(EXAM_CHUNK_SIZE, needed - done)
      const difficulty: Record<ExamDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
      for (let i = 0; i < count; i += 1) difficulty[levels[done + i] ?? 'medium'] += 1
      const facts = Array.from({ length: count }, takeFact).filter((entry): entry is ExamFact => entry !== undefined)
      // No fact left to give: the call would only repeat what the exam already has.
      if (facts.length < count) continue
      const base = requestFor(settings, text, { key: `fix-${type}`, type, count, difficulty, partIndex: 0, partCount: 1 }, facts, avoidStems)
      requests.push({ type, request: { ...base, avoidAnswers: avoidAnswers.slice(-40), avoidTerms: avoidTerms.slice(0, 10), ...(type === 'true-false' ? { trueFalseAnswers: answers.slice(done, done + count) } : {}) } })
    }
  }
  const fresh: ExamQuestion[][] = new Array(requests.length).fill(null).map(() => [])
  let next = 0
  let failure: unknown = null
  const worker = async () => {
    while (failure === null && next < requests.length) {
      const index = next++
      try {
        fresh[index] = await callSection(requests[index].request, signal)
      } catch (error) {
        // A reply the server filtered down to nothing is not an outage: the next round (or the final check) decides.
        if (!(error instanceof ExamApiError && error.code === 'parse')) failure ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, requests.length) }, worker))
  if (failure !== null) throw failure
  const result = [...kept]
  for (const [index, questions] of fresh.entries()) {
    const type = requests[index].type
    for (const question of questions) if (result.filter((other) => other.type === type).length < settings.counts[type]) result.push(question)
  }
  return sortByType(result)
}

export { pairKey }
