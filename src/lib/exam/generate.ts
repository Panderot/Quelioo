import { ExamApiError, generateExamSection, planExamFacts, verifyExamKeys } from '../../api/exam'
import type { ExamFact, ExamPlanRequest, ExamReview, ExamSectionRequest, ExamVerifyRequest, ExamVerifyResult } from '../../api/exam'
import { balanceMcqLetters } from './balance'
import { bloomMixOk, bloomTargetCounts, clampBloom, fitDifficulty, planSlots } from './bloom'
import type { BloomPlan } from './bloom'
import { chooseFacts, withRelated } from './planning'
import { distributePoints } from './points'
import { IGNORED_RULES, MAX_QUESTIONS_PER_CONCEPT, SOFT_RULES, checkExamQuality, conceptCapacity, conceptKey, correctAnswerText, factSimilarity, pairKey, questionsToRewrite, repeatedTerms, trueFalseRange, uncertainPairs } from './quality'
import type { ExamQualityIssue } from './quality'
import { examPaperLang } from './paperLabels'
import { matchingOrder, rightItems } from './paperText'
import { normalize } from './text'
import { EXAM_QUESTION_TYPES } from './types'
import type { BloomLevel, ExamDifficulty, ExamQuestion, ExamQuestionType, ExamSettings } from './types'
import { scenarioVariety } from './variety'

/** Questions asked of the model in one request: small enough to answer well inside the function limit. */
export const EXAM_CHUNK_SIZE = 6
const CONCURRENCY = 3
const VERIFY_ITEMS = 12
const VERIFY_PAIRS = 10
/** Facts planned per question asked for: the surplus is what a rewritten question draws its new fact from. */
export const PLAN_SURPLUS = 2
export const MAX_PLAN_FACTS = 60
/** Targeted rewrite rounds; a question still broken after them stops the exam. */
export const MAX_REPAIR_ROUNDS = 3
/** Extra rounds, only while questions are still missing and unused facts are left: a missing question is worth another try, a polish is not. */
export const MAX_FILL_ROUNDS = 3
/** Extra plan calls for more distinct facts when the spare ones run out (twice in all). */
const MAX_PLAN_EXTENSIONS = 2
/** A fact whose question failed and sits on no question is handed out again at most this many times. */
const MAX_FACT_RETRIES = 2
/** A fact from an extra plan call this alike to one already planned is the same fact. */
const EXTENSION_DUPLICATE = 0.6
/** A relabelled level that is further away than this from the planned one is a different question: it is written again. */
const BLOOM_REWRITE_GAP = 2
/** A calculation the judge solved differently by more than this share is flagged. */
const NUMERIC_TOLERANCE = 0.01

export interface ExamSlot {
  type: ExamQuestionType
  bloom: BloomLevel
  difficulty: ExamDifficulty
}

export interface ExamSection {
  key: string
  type: ExamQuestionType
  count: number
  difficulty: Record<ExamDifficulty, number>
  /** Cognitive level and difficulty of each question of the section, in order. */
  slots: ExamSlot[]
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

/** A row of the teacher's own topic distribution that the source has too little content for. */
export class ExamDistributionError extends Error {
  rows: { row: number; text: string; wanted: number; found: number }[]

  constructor(rows: { row: number; text: string; wanted: number; found: number }[]) {
    super('short_distribution')
    this.rows = rows
  }
}

export function examQuestionTotal(settings: ExamSettings): number {
  return EXAM_QUESTION_TYPES.reduce((sum, type) => sum + settings.counts[type], 0)
}

/** Every question slot of the exam with its Bloom level and difficulty (E3 mix by grade, E2 limits per type). */
export function examSlots(settings: ExamSettings): { slots: ExamSlot[]; plan: BloomPlan; targets: number[] } {
  const total = examQuestionTotal(settings)
  const targets = bloomTargetCounts(settings.bloom, settings.level, total)
  const { slots, plan } = planSlots(settings.counts, targets, settings.difficultyMix)
  return { slots, plan, targets }
}

/** The requests an exam needs: every type with a count, cut into chunks; the whole exam follows the Bloom mix and the difficulty mix. */
export function planExamSections(settings: ExamSettings): ExamSection[] {
  const { slots } = examSlots(settings)
  const sections: ExamSection[] = []
  let cursor = 0
  for (const type of EXAM_QUESTION_TYPES) {
    const count = settings.counts[type]
    if (count <= 0) continue
    const chunks = Math.ceil(count / EXAM_CHUNK_SIZE)
    for (let index = 0; index < chunks; index += 1) {
      const size = Math.floor(count / chunks) + (index < count % chunks ? 1 : 0)
      const sectionSlots = slots.slice(cursor, cursor + size)
      cursor += size
      const difficulty: Record<ExamDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
      for (const slot of sectionSlots) difficulty[slot.difficulty] += 1
      sections.push({ key: `${type}-${index}`, type, count: size, difficulty, slots: sectionSlots, partIndex: index, partCount: chunks })
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

function requestFor(settings: ExamSettings, text: string, section: ExamSection, facts: ExamFact[], avoidStems: string[], variety: string[]): ExamSectionRequest {
  // The teacher's own rows are the topics the questions are written for.
  const rows = settings.distribution.filter((row) => row.text.trim() && row.count > 0).map((row) => row.text.trim())
  return {
    text,
    type: section.type,
    count: section.count,
    difficulty: section.difficulty,
    level: settings.level,
    outputLanguage: settings.outputLanguage,
    contextBased: settings.contextBased,
    optionsCount: settings.optionsCount,
    topics: rows.length > 0 ? rows : settings.topics,
    avoidStems: avoidStems.slice(0, 40),
    partIndex: section.partIndex,
    partCount: section.partCount,
    facts,
    course: settings.header.course,
    variety,
    slots: section.slots.slice(0, facts.length).map((slot) => ({ bloom: slot.bloom, difficulty: slot.difficulty })),
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

/** Facts of the plan get ids f1, f2, ... in order (a fact that has one keeps it). */
function withIds(facts: ExamFact[], offset: number): ExamFact[] {
  return facts.map((entry, index) => (entry.id ? entry : { ...entry, id: `f${offset + index + 1}` }))
}

/** Plan facts nobody used yet whose concept still has room for a question. */
function spareFacts(plan: ExamFact[], usedFacts: Set<string>, kept: ExamQuestion[]): number {
  const perConcept = new Map<string, number>()
  for (const question of kept) {
    const key = conceptKey(question.concept)
    if (key) perConcept.set(key, (perConcept.get(key) ?? 0) + 1)
  }
  return plan.filter((entry) => !usedFacts.has(entry.fact) && (!conceptKey(entry.concept) || (perConcept.get(conceptKey(entry.concept)) ?? 0) < MAX_QUESTIONS_PER_CONCEPT)).length
}

/** A reply is accepted question by question: it must be about a fact assigned to this request (by id), each fact is answered once, and never one that is already on the exam. */
function acceptAnswered(request: ExamSectionRequest, questions: ExamQuestion[], taken: Set<string>): ExamQuestion[] {
  const assigned = new Set((request.facts ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id)))
  const seen = new Set<string>()
  return questions.filter((question) => {
    if (!question.factId) return true
    if (!assigned.has(question.factId) || taken.has(question.factId) || seen.has(question.factId)) return false
    seen.add(question.factId)
    return true
  })
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
  /** What the plan was made from; a different source, topic list, level or language starts over. */
  planKey?: string
  /** Facts already given to a question, passed or failed: never handed out twice. */
  usedFacts?: Set<string>
  /** Verdicts of the judge and the second reading of keys, kept so nothing is judged twice. */
  judge?: JudgeState
  /** The questions as they stand (written, rewritten, or the ones that passed): a retry resumes from here. */
  current?: ExamQuestion[]
  /** The last result left questions out: the next run asks only for the missing ones. */
  partial?: boolean
  /** How many extra plan calls were made for more facts. */
  extensions?: number
  /** How often a fact was handed out again after every unused fact was gone (a fact whose question failed and sits on no question now). */
  retried?: Map<string, number>
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
  /** Facts earlier exams from the same source tested, with the form each had: they come last in the plan (V1). */
  earlier?: { fact: string; form: string }[]
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

export interface ExamGenerationResult {
  /** The questions that passed every check, points spread to exactly 100. */
  questions: ExamQuestion[]
  /** How many questions were asked for. */
  requested: number
  /** How many of them could not be written without breaking a rule (0 for a complete exam). */
  missing: number
}

/** The Bloom plan every check works against. */
interface Targets {
  /** Level counts the exam should reach (after the type limits). */
  achieved: number[]
  /** Planned slots of every type, in order, for rewrites. */
  slots: ExamSlot[]
}

/** Plans the facts, writes one question per fact (3 sections at a time), checks the whole exam and rewrites what breaks a rule
 * with unused facts (at most 3 rounds). Questions that still fail are left out: the result then holds the rest and says how many
 * are missing. A technical failure throws the first API error; the plan, the finished sections and the questions that passed
 * stay in `state`, so trying again repeats nothing that is done. */
/** A reply the server filtered down to nothing (or could not read) is not an outage: the questions are asked again. */
function isEmptyReply(error: unknown): boolean {
  return error instanceof ExamApiError && (error.code === 'parse' || error.code === 'empty_section')
}

export async function generateExamQuestions({ settings, text, state, signal, onProgress, acceptFewer = false, earlier, callSection = generateExamSection, callVerify = verifyExamKeys, callPlan = planExamFacts, onIssues }: GenerateExamOptions): Promise<ExamGenerationResult> {
  const total = examQuestionTotal(settings)
  const sections = planExamSections(settings)
  const { slots, plan: bloomPlan } = examSlots(settings)
  const targets: Targets = { achieved: bloomPlan.achieved, slots }
  const report = () => onProgress?.(sections.filter((section) => state.done.has(section.key)).length, sections.length, 'write')
  const rows = settings.distribution.filter((row) => row.text.trim() && row.count > 0)
  const lang = examPaperLang({ settings, questions: [] })

  // A plan belongs to one source, topic list, level and language; a changed source starts over.
  const planKey = JSON.stringify([text, settings.topics, settings.level, settings.outputLanguage, rows])
  if (state.planKey !== planKey) {
    state.planKey = planKey
    state.plan = undefined
    state.assigned = undefined
    state.current = undefined
    state.usedFacts = undefined
    state.extensions = 0
    state.retried = undefined
    state.judge = undefined
    state.partial = false
    state.done.clear()
  }
  if (!state.plan) {
    onProgress?.(0, sections.length, 'plan')
    // Facts earlier exams from this source tested are still planned: with a bigger plan a new exam finds facts they did not use.
    const wanted = Math.min(MAX_PLAN_FACTS, Math.ceil(total * PLAN_SURPLUS) + Math.min(20, new Set((earlier ?? []).map((old) => old.fact)).size))
    const topics = rows.length > 0 ? rows.map((row) => row.text.trim()) : settings.topics
    state.plan = withIds(await callPlan({ text, level: settings.level, outputLanguage: settings.outputLanguage, topics, count: wanted, ...(rows.length > 0 ? { strictTopics: true } : {}) }, signal), 0)
  }
  const plan = state.plan
  // Worked applications of one formula count as one concept, and a concept carries two questions at most.
  const capacity = conceptCapacity(plan)
  if (capacity < total && !acceptFewer) throw new ExamShortSourceError(capacity)

  const usedFacts = (state.usedFacts ??= new Set<string>())
  const extend = async (needed: number, kept: ExamQuestion[]): Promise<void> => {
    if (needed <= 0 || (state.extensions ?? 0) >= MAX_PLAN_EXTENSIONS) return
    if (spareFacts(plan, usedFacts, kept) >= needed) return
    state.extensions = (state.extensions ?? 0) + 1
    // The parts of the source with the fewest questions come first.
    const counts = new Map<string, number>()
    for (const entry of plan) counts.set(entry.topic, 0)
    for (const question of kept) counts.set(question.topic, (counts.get(question.topic) ?? 0) + 1)
    const focusTopics = [...counts.entries()].filter(([topic]) => topic).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([topic]) => topic)
    try {
      const more = await callPlan({ text, level: settings.level, outputLanguage: settings.outputLanguage, topics: rows.length > 0 ? rows.map((row) => row.text.trim()) : settings.topics, count: Math.min(12, Math.max(6, needed * 2)), existing: plan.map((entry) => entry.fact), focusTopics, ...(rows.length > 0 ? { strictTopics: true } : {}) }, signal)
      const fresh = more.filter((entry) => !plan.some((old) => factSimilarity(old.fact, entry.fact) >= EXTENSION_DUPLICATE))
      plan.push(...withIds(fresh, plan.length))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      // No more facts to be had: the exam then ends with the questions that passed.
    }
  }
  const judge = (state.judge ??= { verified: new Set(), judged: new Map(), reviews: new Map() })
  const calls: Calls = { section: callSection, verify: callVerify }
  state.partial = false

  let current = state.current
  if (!current) {
    // One fact for every question slot: topics follow the source (or the teacher's rows), one question per concept where the source allows, earlier exams' facts last.
    if (!state.assigned) {
      const choice = chooseFacts(plan, slots, { distribution: rows, earlier })
      if (choice.rowShortfall.length > 0 && !acceptFewer) throw new ExamDistributionError(choice.rowShortfall)
      state.assigned = new Map()
      let cursor = 0
      // Questions of level 4-6 get related facts of their topic to combine with their own.
      const facts = withRelated(choice.facts, plan, slots)
      for (const section of sections) {
        state.assigned.set(section.key, facts.slice(cursor, cursor + section.count))
        cursor += section.count
      }
      for (const entry of choice.facts) usedFacts.add(entry.fact)
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
          const request = requestFor(settings, text, section, state.assigned?.get(section.key) ?? [], [], scenarioVariety(lang, Math.min(3, section.count)))
          if (section.type === 'true-false') request.trueFalseAnswers = trueFalsePattern(settings.counts['true-false']).slice(trueFalseOffset(sections, section), trueFalseOffset(sections, section) + section.count)
          const questions = acceptAnswered(request, await callSection(request, signal), new Set())
          state.done.set(section.key, questions)
          report()
        } catch (error) {
          // A reply the server filtered down to nothing is not an outage: the questions are asked again below (and again on a retry).
          if (isEmptyReply(error)) skipped.add(section.key)
          else failure ??= error
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
    if (failure !== null) throw failure

    // Canonical order: by type, chunks in order.
    current = []
    for (const type of EXAM_QUESTION_TYPES) {
      const wanted = settings.counts[type]
      if (wanted <= 0) continue
      current.push(...sections.filter((section) => section.type === type && !skipped.has(section.key)).flatMap((section) => state.done.get(section.key) ?? []).slice(0, wanted))
    }
    state.current = current
  }

  onProgress?.(sections.length, sections.length, 'check')
  // Whole-exam quality check. Keys of true-false and multiple-choice questions are read a second time against the source (a
  // wrong key is corrected from that reading), every question is classified (level, difficulty, giveaway), uncertain pairs are put to a judge, and whatever still breaks a rule is rewritten.
  let issues = await issuesOf(current, settings, text, judge, calls, targets, signal)
  onIssues?.(0, issues)
  // A round starts only for a missing question or a hard-rule break (correct key, no blind key, no repeat, no giveaway, a short answer that is short);
  // Bloom, variety and polish never open one. A complete exam comes first.
  for (let round = 0; round < MAX_REPAIR_ROUNDS + MAX_FILL_ROUNDS && issues.length > 0; round += 1) {
    if (!issues.some((issue) => issue.rule === 'count' || !SOFT_RULES.includes(issue.rule))) break
    const drop = questionsToRewrite(issues)
    const before = current
    // A regenerated slot always gets a NEW unused fact; when the spare ones run out, one small plan call looks for more.
    await extend(drop.size + 1, current.filter((question) => !drop.has(question.id)))
    current = await rewriteQuestions({
      settings,
      text,
      plan,
      usedFacts,
      avoidTerms: repeatedTerms(current, settings.topics),
      kept: current.filter((question) => !drop.has(question.id)),
      dropped: current.filter((question) => drop.has(question.id)),
      planned: slots,
      lang,
      retried: (state.retried ??= new Map<string, number>()),
      signal,
      callSection,
    })
    // A question that only broke a polish rule stays when no better one could be written.
    current = keepPolishOnly(current, before, issues, settings)
    state.current = current
    onProgress?.(sections.length, sections.length, 'check')
    issues = await issuesOf(current, settings, text, judge, calls, targets, signal)
    onIssues?.(round + 1, issues)
  }
  // Whatever still disagrees with the judge after the rounds is labelled as the judge reads it: a true label matters more than the planned mix.
  // (A label that would make a question break a hard rule it did not break before stays as it was.)
  const hardIds = (list: ExamQuestion[]) => new Set(checkExamQuality(list, settings.counts, { topics: settings.topics, judged: judge.judged, copyable: copyableOf(judge) }).filter((issue) => !IGNORED_RULES.includes(issue.rule) && !SOFT_RULES.includes(issue.rule)).map((issue) => issue.id))
  const hardBefore = hardIds(current)
  const snapshot = [...current]
  relabelToJudge(current, judge.reviews)
  const hardAfter = hardIds(current)
  for (const [index, question] of current.entries()) if (hardAfter.has(question.id) && !hardBefore.has(question.id)) current[index] = snapshot[index]
  const blocking = issues.filter((issue) => !SOFT_RULES.includes(issue.rule))
  const failing = new Set(blocking.map((issue) => issue.id).filter((id): id is string => id !== null))
  let kept = current.filter((question) => !failing.has(question.id))
  if (blocking.length > 0 && kept.length === 0) throw new ExamApiError('quality', blocking.map((issue) => `${issue.rule}${issue.type ? `:${issue.type}` : ''}`))
  // With the teacher's own rows, each question carries the exact text of its row, so the tables list the rows as written.
  const labelled = (list: ExamQuestion[]): ExamQuestion[] => (rows.length === 0 ? list : list.map((question) => ({ ...question, topic: plan.find((entry) => entry.fact === question.fact)?.topic || question.topic })))
  if (blocking.length === 0) {
    const scored = distributePoints(sortByType(labelled(balanceMcqLetters(kept))), 100)
    // The same rules as every round (the points rule is repaired by `distributePoints`, a repeated subject word is a topic).
    const final = checkExamQuality(scored, settings.counts, { topics: settings.topics, judged: judge.judged, copyable: copyableOf(judge) }).filter((issue) => !IGNORED_RULES.includes(issue.rule) && !SOFT_RULES.includes(issue.rule))
    if (final.length === 0) {
      state.current = scored
      return { questions: scored, requested: total, missing: 0 }
    }
    // The pair order of the sorted exam can flag another question than the rounds did: those are left out like any question that still fails, never the whole exam.
    onIssues?.(99, final)
    const flagged = new Set(final.map((issue) => issue.id).filter((id): id is string => id !== null))
    kept = kept.filter((question) => !flagged.has(question.id))
    if (kept.length === 0) throw new ExamApiError('quality', final.map((issue) => issue.rule))
  }
  // Some questions still fail after the last round: they are left out, the ones that passed are kept for the teacher (and for a retry of just the missing ones).
  state.current = kept
  state.partial = true
  return { questions: distributePoints(sortByType(labelled(balanceMcqLetters(kept))), 100), requested: total, missing: total - kept.length }
}

export interface JudgeState {
  /** Ids of the questions the judge has read (keys of true-false and multiple choice, level, difficulty, giveaway). */
  verified: Set<string>
  /** Verdicts on uncertain pairs (`pairKey` → both test the same fact). */
  judged: Map<string, boolean>
  /** The judge's blind reading of each question. */
  reviews: Map<string, ExamReview>
  /** Ids of the scenario questions whose correct option was checked for being given away. */
  copyChecked?: Set<string>
}

function copyableOf(judge: JudgeState): Map<string, boolean> {
  return new Map([...judge.reviews].map(([id, review]) => [id, review.copy]))
}

function sortByType(questions: ExamQuestion[]): ExamQuestion[] {
  const order = new Map(EXAM_QUESTION_TYPES.map((type, index) => [type, index]))
  return [...questions].sort((a, b) => (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0))
}

/** Questions dropped only for a polish rule come back when the rewrite left a type short. */
function keepPolishOnly(current: ExamQuestion[], before: ExamQuestion[], issues: ExamQualityIssue[], settings: ExamSettings): ExamQuestion[] {
  const hard = new Set(issues.filter((issue) => !SOFT_RULES.includes(issue.rule)).map((issue) => issue.id))
  const result = [...current]
  const present = new Set(result.map((question) => question.id))
  for (const question of before) {
    if (present.has(question.id) || hard.has(question.id)) continue
    if (result.filter((other) => other.type === question.type).length < settings.counts[question.type]) result.push(question)
  }
  return sortByType(result)
}

/** What a judge needs to compare two questions. */
function pairText(question: ExamQuestion): string {
  const context = question.context ? `${question.context} ` : ''
  return `${context}${question.stem} => ${correctAnswerText(question)}`.slice(0, 600)
}

/** A matching question whose saved pairs disagree with the judge's reading of the source: the pairs, the answer and the grading criteria follow
 * the reading; the right column keeps the same texts in the same places on the paper. */
function rematch(question: ExamQuestion, matches: string[]): ExamQuestion {
  const pairs = question.pairs ?? []
  const items = rightItems(question)
  if (matches.length !== pairs.length || new Set(matches).size !== matches.length || matches.some((match) => !items.includes(match))) return question
  if (pairs.every((pair, index) => pair.right === matches[index])) return question
  const shown = matchingOrder(question).map((index) => items[index])
  const extras = items.filter((item) => !matches.includes(item))
  const next = [...matches, ...extras]
  return {
    ...question,
    pairs: pairs.map((pair, index) => ({ left: pair.left, right: matches[index] })),
    extras,
    rightOrder: shown.map((text) => next.indexOf(text)),
    answer: pairs.map((pair, index) => `${pair.left} = ${matches[index]}`).join('; '),
    rubric: pairs.map((pair, index) => ({ text: `${pair.left} = ${matches[index]}`, points: question.rubric[index]?.points ?? 1 })),
  }
}

/** Corrects a key from the second reading of the source. */
export function applyFix(question: ExamQuestion, result: ExamVerifyResult): ExamQuestion {
  const fix = result.fixes.find((entry) => entry.id === question.id)
  if (!fix) return question
  if (question.type === 'true-false' && fix.answerBool !== undefined) return { ...question, answerBool: fix.answerBool, answer: String(fix.answerBool) }
  if (question.type === 'matching' && fix.matches) return rematch(question, fix.matches)
  if (question.type === 'mcq' && fix.answerIndex !== undefined && question.options && fix.answerIndex < question.options.length) return { ...question, answerIndex: fix.answerIndex, answer: question.options[fix.answerIndex] }
  return question
}

/** Reads every unread question and judges the open pairs (the same call carries both); a call that cannot be made leaves them open. */
async function consult(list: ExamQuestion[], settings: ExamSettings, text: string, judge: JudgeState, calls: Calls, signal?: AbortSignal): Promise<ExamQuestion[]> {
  const open = list.filter((question) => !judge.verified.has(question.id))
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
        for (const review of result.reviews) judge.reviews.set(review.id, review)
        slice.forEach((pair, position) => judge.judged.set(pair.key, result.same.includes(`p${position}`)))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
      }
    }),
  )
  void settings
  const checked = list.map((question) => corrected.get(question.id) ?? question)
  await checkGiveaways(checked, text, judge, calls, signal)
  return checked
}

/** A scenario question with options: the judge sees the correct option and says whether the scenario or the stem gives it away (the key check stays blind, so this is a separate call). */
async function checkGiveaways(list: ExamQuestion[], text: string, judge: JudgeState, calls: Calls, signal?: AbortSignal): Promise<void> {
  const done = (judge.copyChecked ??= new Set<string>())
  const open = list.filter((question) => question.type === 'mcq' && question.context && !done.has(question.id))
  for (let at = 0; at < open.length; at += VERIFY_ITEMS) {
    const questions = open.slice(at, at + VERIFY_ITEMS)
    try {
      const result = await calls.verify({ text, questions, copyOnly: true }, signal)
      for (const question of questions) done.add(question.id)
      for (const review of result.reviews) {
        const before = judge.reviews.get(review.id)
        judge.reviews.set(review.id, before ? { ...before, copy: before.copy || review.copy } : review)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
    }
  }
}

function relabelToJudge(list: ExamQuestion[], reviews: Map<string, ExamReview>): void {
  for (const [index, question] of list.entries()) {
    const review = reviews.get(question.id)
    if (!review || question.bloomLevel === undefined) continue
    const bloomLevel = clampBloom(question.type, review.level)
    const difficulty = fitDifficulty(question.type, bloomLevel, question.difficulty)
    if (bloomLevel !== question.bloomLevel || difficulty !== question.difficulty) list[index] = { ...question, bloomLevel, difficulty }
  }
}

function firstNumber(text: string): number | null {
  const match = /[-−+]?\d+(?:[.,]\d+)?/.exec(text.replace(/\s/g, ''))
  if (!match) return null
  const value = Number(match[0].replace('−', '-').replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

/** The judge's own result of a calculation against the key: a different number means the key (or the question) is wrong. */
function solveMismatch(question: ExamQuestion, review: ExamReview | undefined): boolean {
  if (!review?.solved) return false
  const key = firstNumber(question.answer)
  const solved = firstNumber(review.solved)
  if (key === null || solved === null) return false
  return Math.abs(key - solved) > NUMERIC_TOLERANCE * Math.max(1, Math.abs(key), Math.abs(solved))
}

/** The judge's level and difficulty against the planned ones: a small difference is relabelled when the Bloom mix still holds (a far one, or a mix that would break, is written again). Returns the ids to write again. */
function reconcileLevels(list: ExamQuestion[], reviews: Map<string, ExamReview>, achieved: number[]): string[] {
  const levels = new Map<string, BloomLevel | undefined>(list.map((question) => [question.id, question.bloomLevel]))
  const differing = list
    .filter((question) => {
      const review = reviews.get(question.id)
      return review !== undefined && question.bloomLevel !== undefined && clampBloom(question.type, review.level) !== question.bloomLevel
    })
    .sort((a, b) => Math.abs(clampBloom(a.type, reviews.get(a.id)!.level) - (a.bloomLevel as number)) - Math.abs(clampBloom(b.type, reviews.get(b.id)!.level) - (b.bloomLevel as number)))
  const rewrite: string[] = []
  for (const question of differing) {
    const next = clampBloom(question.type, reviews.get(question.id)!.level)
    const trial = new Map(levels)
    trial.set(question.id, next)
    if (bloomMixOk([...trial.values()], achieved)) levels.set(question.id, next)
    // A question the judge reads below its slot's level is written again; a higher reading only when it is far off.
    else if (next < (question.bloomLevel as number) || Math.abs(next - (question.bloomLevel as number)) >= BLOOM_REWRITE_GAP) rewrite.push(question.id)
  }
  for (const [index, question] of list.entries()) {
    const level = levels.get(question.id)
    const review = reviews.get(question.id)
    const bloomLevel = level ?? question.bloomLevel
    if (bloomLevel === undefined && !review) continue
    // The judge corrects a clearly wrong difficulty label (easy against hard); a neighbouring label is judge noise and the planned one stays. The label always fits the level and the type.
    const order: ExamDifficulty[] = ['easy', 'medium', 'hard']
    // "Hard" has to be confirmed by the judge: a question the judge reads as easier is not labelled hard.
    const far = review !== undefined && (Math.abs(order.indexOf(review.difficulty) - order.indexOf(question.difficulty)) >= 2 || (question.difficulty === 'hard' && review.difficulty !== 'hard'))
    const difficulty = fitDifficulty(question.type, bloomLevel, far ? (review as ExamReview).difficulty : question.difficulty)
    if (bloomLevel !== question.bloomLevel || difficulty !== question.difficulty) list[index] = { ...question, ...(bloomLevel !== undefined ? { bloomLevel } : {}), difficulty }
  }
  return rewrite
}

/** Every rule break that needs the model (the points rule is repaired by `distributePoints`). */
async function issuesOf(list: ExamQuestion[], settings: ExamSettings, text: string, judge: JudgeState, calls: Calls, targets: Targets, signal?: AbortSignal): Promise<ExamQualityIssue[]> {
  const checked = await consult(list, settings, text, judge, calls, signal)
  // The caller keeps working on `list`; corrected keys are written back into the same objects' places by id.
  for (const [index, question] of list.entries()) list[index] = checked[index] ?? question
  // Where the correct multiple-choice option sits is repaired by moving options, never by a rewrite.
  const balanced = balanceMcqLetters(list)
  for (const [index, question] of balanced.entries()) list[index] = question
  // A level the judge reads differently is relabelled where the mix allows; it never starts a rewrite (the paper shows the judge's real levels).
  reconcileLevels(list, judge.reviews, targets.achieved)
  const found = checkExamQuality(list, settings.counts, { topics: settings.topics, judged: judge.judged, copyable: copyableOf(judge) }).filter((issue) => !IGNORED_RULES.includes(issue.rule))
  for (const question of list) if (solveMismatch(question, judge.reviews.get(question.id))) found.push({ rule: 'key-check', id: question.id })
  return found
}

interface RewriteOptions {
  settings: ExamSettings
  text: string
  plan: ExamFact[]
  usedFacts: Set<string>
  kept: ExamQuestion[]
  dropped: ExamQuestion[]
  avoidTerms: string[]
  planned: ExamSlot[]
  lang: ReturnType<typeof examPaperLang>
  /** Facts already handed out a second time: never a third. */
  retried: Map<string, number>
  signal?: AbortSignal
  callSection: SectionCaller
}

/** Asks for exactly the questions the exam is short of (per type, true-false split by answer), each on a fact not used yet. */
async function rewriteQuestions({ settings, text, plan, usedFacts, kept, dropped, avoidTerms, planned, lang, retried, signal, callSection }: RewriteOptions): Promise<ExamQuestion[]> {
  const avoidStems = kept.map((question) => question.stem)
  // A fact handed out again must not come back as the question that just failed.
  const failedStems = dropped.map((question) => question.stem)
  const avoidAnswers = kept.map(correctAnswerText).filter(Boolean)
  // The facts of the questions being rewritten are spent for good: a slot never gets one of them again.
  const reserve = plan.filter((entry) => !usedFacts.has(entry.fact))
  // The new fact is the one least like any fact already on the exam, from the topic the exam has the fewest questions on, so a rewrite does not land next to the question it replaces.
  const onExam = kept.map((question) => question.fact).filter((fact): fact is string => Boolean(fact))
  const likeness = (entry: ExamFact) => onExam.reduce((most, fact) => Math.max(most, factSimilarity(entry.fact, fact)), 0)
  const topicCounts = new Map<string, number>()
  for (const question of kept) topicCounts.set(normalize(question.topic), (topicCounts.get(normalize(question.topic)) ?? 0) + 1)
  const topicLoad = (entry: ExamFact) => topicCounts.get(normalize(entry.topic)) ?? 0
  // A concept carries two questions at most: facts of a full concept stay in the reserve.
  const perConcept = new Map<string, number>()
  for (const question of kept) {
    const key = conceptKey(question.concept)
    if (key) perConcept.set(key, (perConcept.get(key) ?? 0) + 1)
  }
  const roomFor = (entry: ExamFact) => {
    const key = conceptKey(entry.concept)
    return !key || (perConcept.get(key) ?? 0) < MAX_QUESTIONS_PER_CONCEPT
  }
  const takeFact = (): ExamFact | undefined => {
    const open = reserve.filter(roomFor).sort((a, b) => topicLoad(a) - topicLoad(b) || likeness(a) - likeness(b))
    const fresh = open[0]
    if (fresh) {
      reserve.splice(reserve.indexOf(fresh), 1)
      usedFacts.add(fresh.fact)
      onExam.push(fresh.fact)
      const key = conceptKey(fresh.concept)
      if (key) perConcept.set(key, (perConcept.get(key) ?? 0) + 1)
      topicCounts.set(normalize(fresh.topic), topicLoad(fresh) + 1)
      return fresh
    }
    // Every unused fact is gone and the source has no more: a fact whose question failed and now sits on no question gets one more try (never a fact a kept question tests).
    const onKept = new Set(kept.map((question) => question.fact))
    const orphan = plan.filter((entry) => usedFacts.has(entry.fact) && !onKept.has(entry.fact) && (retried.get(entry.fact) ?? 0) < MAX_FACT_RETRIES && roomFor(entry)).sort((a, b) => topicLoad(a) - topicLoad(b) || likeness(a) - likeness(b))[0]
    if (!orphan) return undefined
    retried.set(orphan.fact, (retried.get(orphan.fact) ?? 0) + 1)
    onExam.push(orphan.fact)
    const key = conceptKey(orphan.concept)
    if (key) perConcept.set(key, (perConcept.get(key) ?? 0) + 1)
    topicCounts.set(normalize(orphan.topic), topicLoad(orphan) + 1)
    return orphan
  }
  // What the new questions must stay away from: the facts and concepts already on the exam or spent on a failed question.
  const avoidConcepts = [
    ...plan.filter((entry) => entry.id && usedFacts.has(entry.fact)).map((entry) => entry.id as string),
    ...new Set([...kept, ...dropped].map((question) => question.concept).filter((concept): concept is string => Boolean(concept))),
  ].slice(0, 60)
  const requests: { type: ExamQuestionType; request: ExamSectionRequest }[] = []
  for (const type of EXAM_QUESTION_TYPES) {
    const keptOfType = kept.filter((question) => question.type === type)
    const needed = settings.counts[type] - keptOfType.length
    if (needed <= 0) continue
    const droppedOfType = dropped.filter((question) => question.type === type)
    const plannedOfType = planned.filter((slot) => slot.type === type)
    // The new questions take the slots of the ones they replace (level and difficulty), else the next planned ones.
    const slotFor = (position: number): ExamSlot => {
      const old = droppedOfType[position]
      if (old) return { type, bloom: old.bloomLevel ?? plannedOfType[position]?.bloom ?? 2, difficulty: old.difficulty }
      return plannedOfType[keptOfType.length + position] ?? { type, bloom: 2, difficulty: 'medium' }
    }
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
      const sectionSlots = Array.from({ length: count }, (_, i) => slotFor(done + i))
      const difficulty: Record<ExamDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
      for (const slot of sectionSlots) difficulty[slot.difficulty] += 1
      const taken = Array.from({ length: count }, () => takeFact()).filter((entry): entry is ExamFact => entry !== undefined)
      // Levels 4-6 get related unused facts of their topic to combine with their own.
      const facts = withRelated(taken, plan.filter((entry) => !usedFacts.has(entry.fact) || taken.includes(entry)), sectionSlots)
      // No fact left to give: the call would only repeat what the exam already has.
      if (facts.length < count) continue
      const base = requestFor(settings, text, { key: `fix-${type}`, type, count, difficulty, slots: sectionSlots, partIndex: 0, partCount: 1 }, facts, facts.some((fact) => (retried.get(fact.fact) ?? 0) > 0) ? [...avoidStems, ...failedStems] : avoidStems, scenarioVariety(lang, Math.min(3, count)))
      // A fact that failed once is written without a scenario: the scenario is what usually gave the first try away.
      const again = facts.some((fact) => (retried.get(fact.fact) ?? 0) > 0)
      // A rewrite is written without a scenario unless its slot is level 4-6 (where the case is the point): the scenario is what most often breaks a rule.
      const needsCase = sectionSlots.some((slot) => slot.bloom >= 4)
      requests.push({ type, request: { ...base, ...(again || !needsCase ? { contextBased: false } : {}), avoidAnswers: avoidAnswers.slice(-40), avoidTerms: avoidTerms.slice(0, 10), avoidConcepts, ...(type === 'true-false' ? { trueFalseAnswers: answers.slice(done, done + count) } : {}) } })
    }
  }
  const fresh: ExamQuestion[][] = new Array(requests.length).fill(null).map(() => [])
  const keptIds = new Set(kept.map((question) => question.factId).filter((id): id is string => Boolean(id)))
  let next = 0
  let failure: unknown = null
  const worker = async () => {
    while (failure === null && next < requests.length) {
      const index = next++
      try {
        fresh[index] = acceptAnswered(requests[index].request, await callSection(requests[index].request, signal), keptIds)
      } catch (error) {
        // A reply the server filtered down to nothing is not an outage: the next round (or the final check) decides.
        if (!isEmptyReply(error)) failure ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, requests.length) }, worker))
  if (failure !== null) throw failure
  // A reply that drifted to another fact left its slot empty: the slot is asked again once, on yet another unused fact.
  const again: { index: number; request: ExamSectionRequest }[] = []
  for (const [index, entry] of requests.entries()) {
    const missing = entry.request.count - fresh[index].length
    if (missing <= 0) continue
    const facts = Array.from({ length: missing }, () => takeFact()).filter((fact): fact is ExamFact => fact !== undefined)
    if (facts.length === 0) continue
    const slots = (entry.request.slots ?? []).slice(-facts.length)
    const difficulty: Record<ExamDifficulty, number> = { easy: 0, medium: 0, hard: 0 }
    for (const slot of slots) difficulty[slot.difficulty] += 1
    const answers = entry.request.trueFalseAnswers?.slice(-facts.length)
    const spentIds = (entry.request.facts ?? []).map((fact) => fact.id).filter((id): id is string => Boolean(id))
    again.push({ index, request: { ...entry.request, count: facts.length, facts, slots, difficulty, contextBased: false, ...(answers ? { trueFalseAnswers: answers } : {}), avoidConcepts: [...(entry.request.avoidConcepts ?? []), ...spentIds].slice(0, 60) } })
  }
  await Promise.all(
    again.map(async ({ index, request }) => {
      try {
        const taken = new Set([...keptIds, ...fresh.flat().map((question) => question.factId).filter((id): id is string => Boolean(id))])
        fresh[index] = [...fresh[index], ...acceptAnswered(request, await callSection(request, signal), taken)]
      } catch (error) {
        if (!isEmptyReply(error)) throw error
      }
    }),
  )
  const result = [...kept]
  for (const [index, questions] of fresh.entries()) {
    const type = requests[index].type
    for (const question of questions) if (result.filter((other) => other.type === type).length < settings.counts[type]) result.push(question)
  }
  return sortByType(result)
}

export { pairKey }
