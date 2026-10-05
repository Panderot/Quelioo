import { createHourlyIpLimit } from './hourly-ip-limit.js'
import { callLlmJson, cleanString, isRecord, isStringArray, jsonPostHandler } from './llm-json.js'
import type { LlmProvider } from './llm.js'
import { ALL_ANGLES, batchAngles, generatorSystem, judgeSystem, judgeUser, languageRule, LEVEL_NAMES, REWRITE_SYSTEM, rewriteUser, SAME_FACT_SYSTEM } from './cards-prompts.js'
import type { CardsMode } from './cards-prompts.js'
import { extractFactsPlan } from './quiz-quality.js'
import { getOutputLanguageEnglishName, OUTPUT_LANGUAGE_CODES } from '../../src/data/outputLanguages.js'
import { detectTextLanguage, normalizeUiLanguage, resolveCardLanguage, resolveTranslationTarget, translationLanguageConflict } from '../../src/lib/cardLanguage.js'
import { cardViolation, dropNearDuplicates, shuffled } from '../../src/lib/cardRules.js'
import type { CardViolation, RuleContext } from '../../src/lib/cardRules.js'
import { LESSON_MODELS } from '../../src/lib/lesson.js'
import { CARD_COUNT_AUTO, CARD_LEVELS, CARD_STYLES, MAX_CARD_COUNT, MAX_TOPIC_CHARS, MIN_CARD_COUNT } from '../../src/lib/cardGeneration.js'
import type { CardLevel, CardStyle } from '../../src/lib/cardGeneration.js'
import { MAX_BACK_CHARS, MAX_FRONT_CHARS, normalizeFront } from '../../src/lib/flashcardText.js'
import { neutralizeSourceTextTags, neutralizeTag, sanitizeSourceText, sanitizeTextLight } from '../../src/lib/sanitizeText.js'
import { MAX_QUIZ_WORDS, MIN_QUIZ_WORDS, countWords } from '../../src/lib/textStats.js'

export type CardsErrorCode =
  | 'bad_type'
  | 'too_large'
  | 'too_short'
  | 'too_long'
  | 'same_language'
  | 'upstream'
  | 'parse'
  | 'model'
  | 'not_configured'
  | 'rate_limited'
  | 'unverified'

export interface GeneratedCard {
  front: string
  back: string
  /** Auto coverage only: the id of the planned fact this card asks. */
  fact?: number
}

export type CardsResponseBody =
  | { cards: { front: string; back: string }[]; removed: number; provider: LlmProvider; fallbackUsed: boolean; requested: number; language: string }
  | { error: CardsErrorCode }

const MAX_REQUEST_BYTES = 768 * 1024
const MAX_AVOID = 300
const MAX_AVOID_CHARS = MAX_FRONT_CHARS
/** Deck fronts shown to the generator (the most recent); every front is still used for the duplicate check afterwards. */
const MAX_AVOID_IN_PROMPT = 120
/** Generated backs are asked to stay near 25 words; this is the hard cap. */
const MAX_GENERATED_BACK_CHARS = 400
/** Solution mode: a solved problem as source text (question, steps, answer, tip, mistakes). */
const MAX_SOLUTION_CHARS = 20_000
const SOLUTION_MIN_CARDS = 3
const SOLUTION_MAX_CARDS = 6
/** Cards asked per model call; larger counts run as batches. */
const BATCH_SIZE = 10
const MAX_TOP_UPS = 4
/** The whole generation must end before the function limit (180 s in vercel.json). */
const TOTAL_BUDGET_MS = 150_000
const TOP_UP_MIN_LEFT_MS = 45_000

/** The reviewer and the rewriter are the cheap checker model (OpenAI); the writer keeps the provider default. */
const REVIEW_MODEL = LESSON_MODELS.checker

const limit = createHourlyIpLimit(30)

/** Token budget that scales with the card count (reasoning models spend output tokens too). */
export function cardTokenBudget(count: number): { initialTokens: number; retryTokens: number } {
  const initialTokens = 1500 + count * 160
  return { initialTokens, retryTokens: initialTokens * 2 }
}

/**
 * A single-backslash LaTeX command that starts a JSON escape (frac, times, neq, beta, right) parses
 * into a control character instead of failing; put the backslash back.
 */
export function restoreLatexEscapes(text: string): string {
  return text
    .replace(/\f(?=[a-z])/g, '\\f')
    .replace(/\t(?=[a-z])/g, '\\t')
    .replace(/\x08(?=[a-z])/g, '\\b')
    .replace(/\r(?=[a-z])/g, '\\r')
    .replace(/\n(?=eq|abla|ot\b|u\b|i\b|ewline)/g, '\\n')
}

function cleanCard(front: unknown, back: unknown): GeneratedCard | null {
  const cleanFront = restoreLatexEscapes(cleanString(front, MAX_FRONT_CHARS))
  const cleanBack = restoreLatexEscapes(cleanString(back, MAX_GENERATED_BACK_CHARS)).slice(0, MAX_BACK_CHARS)
  return cleanFront && cleanBack ? { front: cleanFront, back: cleanBack } : null
}

/** Valid, de-duplicated cards (also against the deck's fronts); null when the reply isn't the expected shape.
 * `withFact` keeps each card's planned-fact id (coverage mode). */
export function validateGeneratedCards(parsed: unknown, avoid: Set<string>, count: number, withFact = false): GeneratedCard[] | null {
  if (!isRecord(parsed) || !Array.isArray(parsed.cards)) return null
  const seen = new Set(avoid)
  const cards: GeneratedCard[] = []
  for (const entry of parsed.cards) {
    if (!isRecord(entry)) continue
    const card = cleanCard(entry.front, entry.back)
    if (!card) continue
    const key = normalizeFront(card.front)
    if (seen.has(key)) continue
    seen.add(key)
    if (withFact && typeof entry.fact === 'number') card.fact = entry.fact
    cards.push(card)
    if (cards.length === count) break
  }
  return cards.length > 0 ? cards : null
}

/** Applies reviewer verdicts by card number; a card without a verdict is dropped (never returned unchecked). */
function readVerdicts(parsed: unknown): Map<number, Record<string, unknown>> | null {
  if (!isRecord(parsed) || !Array.isArray(parsed.cards)) return null
  const verdicts = new Map<number, Record<string, unknown>>()
  for (const entry of parsed.cards) {
    if (isRecord(entry) && typeof entry.id === 'number') verdicts.set(entry.id, entry)
  }
  return verdicts.size === 0 ? null : verdicts
}

const factKey = (fact: unknown) => (typeof fact === 'string' ? fact.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : '')

/** `byFact`: the reviewer names each card's key fact; a later card with the same key fact repeats an earlier one and is dropped. */
export function applyVerdicts(cards: GeneratedCard[], parsed: unknown, avoid: Set<string>, byFact = false): GeneratedCard[] | null {
  const verdicts = readVerdicts(parsed)
  if (!verdicts) return null
  const seen = new Set(avoid)
  const seenFacts = new Set<string>()
  const kept: GeneratedCard[] = []
  cards.forEach((card, index) => {
    const verdict = verdicts.get(index + 1)
    if (!verdict) return
    let result: GeneratedCard | null = null
    if (verdict.verdict === 'ok') result = card
    else if (verdict.verdict === 'fix') {
      const fixed = cleanCard(verdict.front, verdict.back)
      result = fixed ? { ...fixed, ...(card.fact !== undefined ? { fact: card.fact } : {}) } : null
    }
    if (!result) return
    const key = normalizeFront(result.front)
    if (seen.has(key)) return
    const fact = byFact ? factKey(verdict.fact) : ''
    if (fact && seenFacts.has(fact)) return
    seen.add(key)
    if (fact) seenFacts.add(fact)
    kept.push(result)
  })
  return kept
}

function avoidBlock(avoid: string[]): string {
  return `<avoid>\n${avoid.map((front) => `<front>${neutralizeTag(neutralizeTag(front, 'front'), 'avoid')}</front>`).join('\n')}\n</avoid>`
}

function cardsXml(cards: GeneratedCard[]): string {
  return cards
    .map((card, index) => `<card id="${index + 1}"><front>${neutralizeTag(neutralizeTag(card.front, 'front'), 'cards')}</front><back>${neutralizeTag(neutralizeTag(card.back, 'back'), 'cards')}</back></card>`)
    .join('\n')
}

function errorStatus(code: CardsErrorCode): number {
  switch (code) {
    case 'bad_type':
    case 'too_large':
    case 'too_short':
    case 'too_long':
    case 'same_language':
      return 400
    case 'unverified':
      return 422
    case 'rate_limited':
      return 429
    case 'not_configured':
      return 503
    case 'upstream':
    case 'parse':
    case 'model':
      return 502
  }
}

interface CardsRequest {
  mode: CardsMode
  text: string
  topic: string
  level: CardLevel
  count: number
  /** Metin tab "Otomatik": one card per planned fact. */
  auto: boolean
  style: CardStyle
  language: string
  uiLanguage: string
  avoid: string[]
}

/** Shape and size checks; returns the normalized request or an error code. */
export function parseCardsRequest(payload: unknown): CardsRequest | CardsErrorCode {
  if (!isRecord(payload)) return 'bad_type'
  const { mode, text, topic, level, language, avoid, uiLanguage } = payload
  if (mode !== 'text' && mode !== 'topic' && mode !== 'solution') return 'bad_type'
  const auto = mode === 'text' && payload.count === CARD_COUNT_AUTO
  // A solution always asks for 3-6 question -> answer cards; the other modes take the student's options.
  const count = mode === 'solution' ? SOLUTION_MAX_CARDS : auto ? MAX_CARD_COUNT : payload.count
  const style = mode === 'solution' ? 'qa' : payload.style
  if (typeof count !== 'number' || !Number.isInteger(count) || count < MIN_CARD_COUNT || count > MAX_CARD_COUNT) return 'bad_type'
  if (typeof style !== 'string' || !(CARD_STYLES as readonly string[]).includes(style)) return 'bad_type'
  if (avoid !== undefined && !isStringArray(avoid)) return 'bad_type'
  const avoidList = (avoid ?? []).map((entry) => entry.trim()).filter(Boolean)
  if (avoidList.length > MAX_AVOID || avoidList.some((entry) => entry.length > MAX_AVOID_CHARS)) return 'too_large'
  const resolvedLanguage = typeof language === 'string' && OUTPUT_LANGUAGE_CODES.has(language) ? language : 'auto'
  const base = {
    count,
    auto,
    style: style as CardStyle,
    language: resolvedLanguage,
    uiLanguage: normalizeUiLanguage(typeof uiLanguage === 'string' ? uiLanguage : undefined),
    avoid: avoidList,
  }

  if (mode === 'solution') {
    if (typeof text !== 'string' || !text.trim()) return 'bad_type'
    const clean = sanitizeTextLight(text).trim()
    if (clean.length > MAX_SOLUTION_CHARS) return 'too_long'
    return { ...base, mode, text: clean, topic: '', level: 'general' }
  }

  if (mode === 'text') {
    if (typeof text !== 'string') return 'bad_type'
    const sanitized = sanitizeSourceText(text)
    if (sanitized.truncated) return 'too_long'
    const words = countWords(sanitized.text)
    if (words < MIN_QUIZ_WORDS) return 'too_short'
    if (words > MAX_QUIZ_WORDS) return 'too_long'
    const clean = sanitized.text.trim()
    // Foreign word -> translation into the language the text is written in teaches nothing.
    if (base.style === 'translation' && translationLanguageConflict({ selected: base.language, sourceLanguage: detectTextLanguage(clean) })) return 'same_language'
    return { ...base, mode, text: clean, topic: '', level: 'general' }
  }

  if (typeof topic !== 'string' || !topic.trim()) return 'bad_type'
  if (topic.trim().length > MAX_TOPIC_CHARS) return 'too_long'
  if (level !== undefined && (typeof level !== 'string' || !(CARD_LEVELS as readonly string[]).includes(level))) return 'bad_type'
  return { ...base, mode, text: '', topic: topic.trim(), level: (level as CardLevel | undefined) ?? 'general' }
}

// --- the generation flow -----------------------------------------------------------------------

interface Flow {
  request: CardsRequest
  /** Language the cards are written in (the translations for foreign words). */
  outputCode: string
  outputName: string
  /** False when the source did not reveal its language and the UI language was used. */
  certain: boolean
  ruleContext: RuleContext
  /** <source_text> or <topic>+<level> block, sent with every call. */
  sourceBlock: string
  deckFronts: string[]
  deadlineAt: number
  provider: LlmProvider | null
  fallbackUsed: boolean
  removed: number
  seed: number
}

type Failure = { ok: false; error: CardsErrorCode }
type Cards = { ok: true; cards: GeneratedCard[] } | Failure

const otherProvider = (provider: LlmProvider | null): LlmProvider | undefined => (provider ? (provider === 'openai' ? 'anthropic' : 'openai') : undefined)

function noteProvider(flow: Flow, result: { provider: LlmProvider; fallbackUsed: boolean }) {
  flow.provider ??= result.provider
  flow.fallbackUsed = flow.fallbackUsed || result.fallbackUsed
}

interface BatchRequest {
  ask: number
  angles: readonly string[]
  avoid: string[]
  /** Coverage mode: the facts this batch writes one card for. */
  facts?: { id: number; label: string; statement: string }[]
  solutionRange?: [number, number]
  topUp?: boolean
}

async function generateBatch(flow: Flow, batch: BatchRequest): Promise<Cards> {
  const { request } = flow
  const factsXml = batch.facts
    ? `<facts>\n${batch.facts.map((fact) => `<fact id="${fact.id}"><label>${neutralizeTag(fact.label, 'fact')}</label><statement>${neutralizeTag(neutralizeTag(fact.statement, 'fact'), 'facts')}</statement></fact>`).join('\n')}\n</facts>\n`
    : ''
  const system = generatorSystem({
    mode: request.mode,
    style: request.style,
    count: batch.ask,
    languageRule: languageRule({ name: flow.outputName, certain: flow.certain, mode: request.mode, style: request.style, fallbackName: getOutputLanguageEnglishName(normalizeUiLanguage(request.uiLanguage)) ?? 'English' }),
    targetLanguageName: request.style === 'translation' ? flow.outputName : null,
    angles: batch.angles,
    facts: Boolean(batch.facts),
    seed: flow.seed + batch.ask,
    ...(batch.solutionRange ? { solutionRange: batch.solutionRange } : {}),
  })
  const user = [flow.sourceBlock, factsXml + avoidBlock(batch.avoid), batch.topUp ? 'Earlier cards of this run are in <avoid>: take new facts, and when the text has no new fact, go deeper on facts already used from a different angle (cause, condition, comparison, reverse direction, what-if, number, order) with a different question and answer.' : '', `Write the ${batch.solutionRange ? 'method' : batch.ask} flashcards now.`]
    .filter(Boolean)
    .join('\n')
  const avoidKeys = new Set(batch.avoid.map(normalizeFront))
  const result = await callLlmJson({
    system,
    user,
    ...cardTokenBudget(batch.ask),
    reasoningEffort: 'none',
    callType: `cards-${request.mode}`,
    deadlineAt: flow.deadlineAt,
    validate: (parsed) => validateGeneratedCards(parsed, avoidKeys, batch.ask, Boolean(batch.facts)),
  })
  if (!result.ok) return { ok: false, error: result.error }
  noteProvider(flow, result)
  return { ok: true, cards: result.value }
}

/** Cards that break their type's rules are rewritten once; what is still wrong afterwards is dropped. */
async function enforceTypeRules(flow: Flow, cards: GeneratedCard[]): Promise<GeneratedCard[]> {
  const good: { card: GeneratedCard; order: number }[] = []
  const bad: { card: GeneratedCard; order: number; problem: CardViolation }[] = []
  cards.forEach((card, order) => {
    const problem = cardViolation(card, flow.ruleContext)
    if (problem) bad.push({ card, order, problem })
    else good.push({ card, order })
  })
  if (bad.length > 0) {
    const numbered = bad.map((entry, index) => ({ id: index + 1, front: entry.card.front, back: entry.card.back, problem: entry.problem }))
    const result = await callLlmJson({
      system: REWRITE_SYSTEM,
      user: rewriteUser({
        source: flow.sourceBlock,
        languageName: flow.outputName,
        style: flow.request.style,
        targetLanguageName: flow.request.style === 'translation' ? flow.outputName : null,
        cards: numbered,
        neutralize: (text, tag) => neutralizeTag(neutralizeTag(text, tag), 'cards'),
      }),
      ...cardTokenBudget(bad.length),
      reasoningEffort: 'none',
      callType: 'cards-rewrite',
      openAiModel: REVIEW_MODEL,
      deadlineAt: flow.deadlineAt,
      validate: (parsed) => readVerdicts(parsed),
    }).catch(() => null)
    if (result?.ok) {
      noteProvider(flow, result)
      bad.forEach((entry, index) => {
        const verdict = result.value.get(index + 1)
        if (verdict?.verdict !== 'fix') return
        const fixed = cleanCard(verdict.front, verdict.back)
        if (fixed && cardViolation(fixed, flow.ruleContext) === null) good.push({ card: { ...fixed, ...(entry.card.fact !== undefined ? { fact: entry.card.fact } : {}) }, order: entry.order })
      })
    }
  }
  return good.sort((a, b) => a.order - b.order).map((entry) => entry.card)
}

/** Accuracy (topic: general knowledge; text: the source), duplicates, language and type, in one independent call. */
async function judgeCards(flow: Flow, cards: GeneratedCard[]): Promise<Cards> {
  const { request } = flow
  const result = await callLlmJson({
    system: judgeSystem(request.mode),
    user: judgeUser({
      source: flow.sourceBlock,
      languageName: flow.outputName,
      style: request.style,
      targetLanguageName: request.style === 'translation' ? flow.outputName : null,
      cardsXml: cardsXml(cards),
    }),
    ...cardTokenBudget(cards.length),
    ...(otherProvider(flow.provider) ? { preferProvider: otherProvider(flow.provider) } : {}),
    reasoningEffort: 'low',
    callType: request.mode === 'topic' ? 'cards-verify' : 'cards-review',
    deadlineAt: flow.deadlineAt,
    openAiModel: REVIEW_MODEL,
    validate: (parsed) => applyVerdicts(cards, parsed, new Set(), true),
  })
  if (!result.ok) return { ok: false, error: result.error }
  noteProvider(flow, result)
  const kept = result.value
  // A repaired card must still obey its type; one that does not is dropped.
  const fine = kept.filter((card) => cardViolation(card, flow.ruleContext) === null)
  flow.removed += cards.length - fine.length
  return { ok: true, cards: fine }
}

/** Cards that test the same fact in different words: a small grouping call over the accepted cards plus the new ones.
 * The earlier card of a group stays; a failed call keeps everything (the string-level check already ran). */
async function dropSameFact(flow: Flow, accepted: GeneratedCard[], added: GeneratedCard[]): Promise<GeneratedCard[]> {
  if (accepted.length + added.length < 2 || added.length === 0) return added
  const all = [...accepted, ...added]
  const result = await callLlmJson({
    system: SAME_FACT_SYSTEM,
    user: `<cards>\n${cardsXml(all)}\n</cards>\nGroup the cards that test the same fact.`,
    initialTokens: 800 + all.length * 40,
    retryTokens: 1600 + all.length * 80,
    reasoningEffort: 'medium',
    openAiModel: REVIEW_MODEL,
    callType: 'cards-dedupe',
    deadlineAt: flow.deadlineAt,
    validate: (parsed) => {
      if (!isRecord(parsed) || !Array.isArray(parsed.groups)) return null
      return parsed.groups.filter((group): group is number[] => Array.isArray(group) && group.length >= 2 && group.every((id) => Number.isInteger(id)))
    },
  }).catch(() => null)
  if (!result?.ok) return added
  noteProvider(flow, result)
  const dropped = new Set<number>()
  for (const group of result.value) {
    const first = Math.min(...group)
    for (const id of group) if (id !== first && id > accepted.length && id <= all.length) dropped.add(id - accepted.length - 1)
  }
  return added.filter((_, index) => !dropped.has(index))
}

/** Rules, rewrite, duplicates, review. `accepted` are the cards already chosen in this run. */
async function refine(flow: Flow, candidates: GeneratedCard[], accepted: GeneratedCard[]): Promise<Cards> {
  const { request } = flow
  let list = await enforceTypeRules(flow, candidates)
  list = dropNearDuplicates(list, accepted, flow.deckFronts).kept
  if (list.length > 0 && request.mode !== 'solution') {
    const judged = await judgeCards(flow, list)
    if (judged.ok) list = judged.cards
    // A topic card is never returned unchecked; for a source text, the text itself is the ground truth.
    else if (request.mode === 'topic') return judged
  }
  list = dropNearDuplicates(list, accepted, flow.deckFronts).kept
  if (request.mode !== 'solution') list = await dropSameFact(flow, accepted, list)
  return { ok: true, cards: list }
}

function splitBatches(total: number): number[] {
  const batches = Math.max(1, Math.ceil(total / BATCH_SIZE))
  const sizes: number[] = []
  let left = total
  for (let i = 0; i < batches; i++) {
    const size = Math.ceil(left / (batches - i))
    sizes.push(size)
    left -= size
  }
  return sizes
}

const promptAvoid = (deckFronts: string[], accepted: GeneratedCard[]) => [...deckFronts, ...accepted.map((card) => card.front)].slice(-MAX_AVOID_IN_PROMPT)

/** Fixed count: parallel batches with different angles, then up to two top-ups for what duplicates and reviews removed. */
async function generateFixed(flow: Flow, target: number): Promise<Cards> {
  const order = shuffled(ALL_ANGLES, flow.seed)
  const sizes = splitBatches(target)
  // Ask a little more than needed: duplicates and review removals are expected, a top-up is slower.
  const replies = await Promise.all(
    sizes.map((size, index) =>
      generateBatch(flow, { ask: Math.min(12, size + (target > 5 ? 2 : 1)), angles: batchAngles(order, index, sizes.length), avoid: promptAvoid(flow.deckFronts, []) }).catch((): Cards => ({ ok: false, error: 'upstream' })),
    ),
  )
  const firstFailure = replies.find((reply): reply is Failure => !reply.ok)
  const candidates = replies.flatMap((reply) => (reply.ok ? reply.cards : []))
  if (candidates.length === 0) return firstFailure ?? { ok: false, error: 'parse' }

  const refined = await refine(flow, candidates, [])
  if (!refined.ok) return refined
  let accepted = refined.cards.slice(0, target)

  for (let round = 1; round <= MAX_TOP_UPS && accepted.length < target && flow.deadlineAt - Date.now() > TOP_UP_MIN_LEFT_MS; round++) {
    const missing = target - accepted.length
    const deeper = shuffled(ALL_ANGLES, flow.seed + round * 7919)
    const more = await generateBatch(flow, { ask: Math.min(12, Math.ceil(missing * 1.5) + 2), angles: deeper, avoid: promptAvoid(flow.deckFronts, accepted), topUp: true }).catch((): Cards => ({ ok: false, error: 'upstream' }))
    if (!more.ok) break
    const added = await refine(flow, more.cards, accepted)
    if (!added.ok || added.cards.length === 0) break
    accepted = [...accepted, ...added.cards].slice(0, target)
  }
  if (accepted.length === 0) return { ok: false, error: 'unverified' }
  return { ok: true, cards: accepted }
}

interface PlannedFact {
  id: number
  label: string
  statement: string
}

/** Auto coverage: one card per planned fact (at most 30 per run); facts whose card was dropped get one more try. */
async function generateCoverage(flow: Flow, facts: PlannedFact[]): Promise<Cards> {
  const order = shuffled(ALL_ANGLES, flow.seed)
  const chunks: PlannedFact[][] = []
  for (let i = 0; i < facts.length; i += BATCH_SIZE) chunks.push(facts.slice(i, i + BATCH_SIZE))
  const replies = await Promise.all(
    chunks.map((chunk, index) =>
      generateBatch(flow, { ask: chunk.length, angles: batchAngles(order, index, chunks.length), avoid: promptAvoid(flow.deckFronts, []), facts: chunk }).catch((): Cards => ({ ok: false, error: 'upstream' })),
    ),
  )
  const firstFailure = replies.find((reply): reply is Failure => !reply.ok)
  const candidates = replies.flatMap((reply) => (reply.ok ? reply.cards : []))
  if (candidates.length === 0) return firstFailure ?? { ok: false, error: 'parse' }
  const refined = await refine(flow, candidates, [])
  if (!refined.ok) return refined
  let accepted = refined.cards

  const covered = () => new Set(accepted.map((card) => card.fact).filter((id): id is number => id !== undefined))
  const missing = facts.filter((fact) => !covered().has(fact.id))
  if (missing.length > 0 && flow.deadlineAt - Date.now() > TOP_UP_MIN_LEFT_MS) {
    const more = await generateBatch(flow, {
      ask: Math.min(missing.length, BATCH_SIZE),
      angles: shuffled(ALL_ANGLES, flow.seed + 31),
      avoid: promptAvoid(flow.deckFronts, accepted),
      facts: missing.slice(0, BATCH_SIZE),
      topUp: true,
    }).catch((): Cards => ({ ok: false, error: 'upstream' }))
    if (more.ok) {
      const added = await refine(flow, more.cards, accepted)
      if (added.ok) accepted = [...accepted, ...added.cards]
    }
  }
  const position = new Map(facts.map((fact, index) => [fact.id, index]))
  accepted = accepted.sort((a, b) => (position.get(a.fact ?? -1) ?? facts.length) - (position.get(b.fact ?? -1) ?? facts.length))
  if (accepted.length === 0) return { ok: false, error: 'unverified' }
  return { ok: true, cards: accepted }
}

/** Facts for coverage mode, most important first within the 30-card limit, then back in reading order. */
async function planFacts(flow: Flow): Promise<{ facts: PlannedFact[]; total: number } | null> {
  const planned = await extractFactsPlan({ text: flow.request.text, language: `${flow.outputName}, the language the cards are written in`, onlyOpenAi: false }).catch(() => null)
  if (!planned?.value || planned.value.facts.length === 0) return null
  const all = planned.value.facts
  const chosen = all.length <= MAX_CARD_COUNT ? all : [...all].sort((a, b) => Number(b.importance === 'core') - Number(a.importance === 'core') || a.position - b.position).slice(0, MAX_CARD_COUNT).sort((a, b) => a.position - b.position)
  return { facts: chosen.map((fact) => ({ id: fact.id, label: fact.label, statement: fact.statement })), total: all.length }
}

export async function handleCardsRequest(payload: unknown, ip: string): Promise<{ status: number; body: CardsResponseBody }> {
  const fail = (error: CardsErrorCode) => ({ status: errorStatus(error), body: { error } as CardsResponseBody })
  const request = parseCardsRequest(payload)
  if (typeof request === 'string') return fail(request)
  if (!limit.canRecord(ip)) {
    console.log(`cards: error=rate_limited ip=${ip}`)
    return fail('rate_limited')
  }

  // One resolver for every generator: the chosen language, else the language of the source, else the UI language.
  // The solution text carries English labels (Answer:, Tip:) that say nothing about the question's language.
  const sourceForLanguage = request.mode === 'topic' ? request.topic : request.text.replace(/^(?:Answer|Tip|Common mistake):s*/gim, '')
  const translation = request.style === 'translation' && request.mode !== 'solution'
  const resolved = translation
    ? { code: resolveTranslationTarget({ selected: request.language, sourceLanguage: request.mode === 'text' ? detectTextLanguage(request.text) : null, uiLanguage: request.uiLanguage }), certain: true }
    : resolveCardLanguage({ selected: request.language, sourceText: sourceForLanguage, uiLanguage: request.uiLanguage })
  const outputName = getOutputLanguageEnglishName(resolved.code) ?? 'the language of the source'
  const topicBlock = `<topic>${neutralizeTag(request.topic, 'topic')}</topic>\n<level>${LEVEL_NAMES[request.level]}</level>`
  const now = Date.now()
  const flow: Flow = {
    request,
    outputCode: resolved.code,
    outputName,
    certain: resolved.certain,
    ruleContext: { style: request.style, outputLanguage: resolved.certain ? resolved.code : '', ...(request.mode === 'topic' ? { topic: request.topic } : {}) },
    sourceBlock: request.mode === 'topic' ? topicBlock : `<source_text>\n${neutralizeSourceTextTags(request.text)}\n</source_text>`,
    deckFronts: request.avoid,
    deadlineAt: now + TOTAL_BUDGET_MS,
    provider: null,
    fallbackUsed: false,
    removed: 0,
    seed: Math.floor(Math.random() * 900_000) + 100_000,
  }

  let target = request.count
  let outcome: Cards
  if (request.mode === 'solution') {
    const generated = await generateBatch(flow, { ask: SOLUTION_MAX_CARDS, angles: ALL_ANGLES, avoid: promptAvoid(flow.deckFronts, []), solutionRange: [SOLUTION_MIN_CARDS, SOLUTION_MAX_CARDS] })
    outcome = generated.ok ? await refine(flow, generated.cards, []) : generated
    if (outcome.ok && outcome.cards.length === 0) outcome = { ok: false, error: 'unverified' }
  } else if (request.auto) {
    const plan = await planFacts(flow)
    if (plan) {
      target = plan.facts.length
      outcome = await generateCoverage(flow, plan.facts)
    } else {
      // No fact plan (the planner failed): about one card per eight words, like the plan's own rate.
      target = Math.min(MAX_CARD_COUNT, Math.max(MIN_CARD_COUNT, Math.round(countWords(request.text) / 8)))
      outcome = await generateFixed(flow, target)
    }
  } else {
    outcome = await generateFixed(flow, target)
  }
  if (!outcome.ok) return fail(outcome.error)

  limit.record(ip)
  const cards = outcome.cards.map(({ front, back }) => ({ front, back }))
  console.log(`cards: mode=${request.mode} style=${request.style} requested=${target} count=${cards.length} removed=${flow.removed}`)
  return { status: 200, body: { cards, removed: flow.removed, provider: flow.provider ?? 'openai', fallbackUsed: flow.fallbackUsed, requested: target, language: flow.outputCode } }
}

export const cardsRequestHandler = jsonPostHandler<CardsResponseBody>(MAX_REQUEST_BYTES, handleCardsRequest, (error) => ({ error }))
