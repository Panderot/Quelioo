import { largestRemainder } from './bloom'
import { MAX_QUESTIONS_PER_CONCEPT, conceptKey, factSimilarity } from './quality'
import { normalize, overlap, shareOfUnion, stems } from './text'
import { questionWeight } from './points'
import type { ExamDistributionRow, QuestionSlotInfo } from './planTypes'

/** Which fact of the source goes to which question slot: topics follow the source (A2), one question per concept where the source allows (A6), facts earlier exams used are last in line (V1). */

export interface PlanFact {
  fact: string
  topic: string
  concept?: string
}

export interface FactChoice<T extends PlanFact> {
  /** One fact per slot, in slot order; shorter than the slots when the plan cannot fill them. */
  facts: T[]
  /** How many facts the plan holds for each teacher row (only when rows were given): a row without enough facts is named to the teacher. */
  rowShortfall: { row: number; text: string; wanted: number; found: number }[]
}

export interface ChooseOptions {
  distribution?: ExamDistributionRow[]
  /** Facts that earlier exams from the same source tested, with the form ("type:bloom") each had; they come last. */
  earlier?: { fact: string; form: string }[]
}

const TOPIC_MERGE = 0.6
const MAX_TOPIC_SHARE = 0.4
const FACT_REUSE = 0.5

/** Do two topic labels name the same topic? They share most of their key words, or one is a single word the other contains. */
function sameTopic(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return a.size === b.size
  if (shareOfUnion(a, b) >= TOPIC_MERGE) return true
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  return small.size === 1 && overlap(small, large) === 1
}

/** A cluster key per fact: topics that share their key words ("Hücre teorisi", "Hücre teorisi ve Hooke") are one topic. */
export function clusterTopics(facts: PlanFact[], rows?: ExamDistributionRow[]): number[] {
  if (rows && rows.length > 0) {
    return facts.map((entry) => {
      const key = normalize(entry.topic)
      const exact = rows.findIndex((row) => normalize(row.text) === key)
      if (exact >= 0) return exact
      const own = stems(entry.topic, 4)
      let best = -1
      let bestShare = TOPIC_MERGE - 0.01
      rows.forEach((row, index) => {
        const share = shareOfUnion(own, stems(row.text, 4))
        if (share > bestShare) {
          best = index
          bestShare = share
        }
      })
      return best
    })
  }
  const clusters: { stems: Set<string> }[] = []
  return facts.map((entry) => {
    const own = stems(entry.topic, 4)
    let found = clusters.findIndex((cluster) => sameTopic(own, cluster.stems))
    if (found < 0) {
      clusters.push({ stems: own })
      found = clusters.length - 1
    }
    return found
  })
}

/** Share of the plan each topic holds (the plan is the source's own spread of testable facts). */
export function topicShares(facts: PlanFact[]): number[] {
  const clusters = clusterTopics(facts)
  const sizes: number[] = []
  for (const cluster of clusters) sizes[cluster] = (sizes[cluster] ?? 0) + 1
  return sizes.map((size) => size / Math.max(1, facts.length))
}

function usable<T extends PlanFact>(entry: T, used: Map<string, number>): boolean {
  const key = conceptKey(entry.concept)
  return !key || (used.get(key) ?? 0) < MAX_QUESTIONS_PER_CONCEPT
}

/** Takes up to `quota` facts of a group: one per concept first, then a second per concept, facts the teacher has not had before first. */
function pickFromGroup<T extends PlanFact>(candidates: { entry: T; penalty: number; index: number }[], quota: number, concepts: Map<string, number>): T[] {
  const ordered = [...candidates].sort((a, b) => a.penalty - b.penalty || a.index - b.index)
  const picked: T[] = []
  for (const pass of [1, 2]) {
    for (const { entry } of ordered) {
      if (picked.length >= quota) return picked
      if (picked.includes(entry)) continue
      const key = conceptKey(entry.concept)
      const count = key ? (concepts.get(key) ?? 0) : 0
      if (key && count >= (pass === 1 ? 1 : MAX_QUESTIONS_PER_CONCEPT)) continue
      picked.push(entry)
      if (key) concepts.set(key, count + 1)
    }
  }
  return picked
}

/** One fact for every slot. Topics get questions in proportion to their share of the source (or exactly the teacher's rows), the heavy slots (open-ended) go to different topics first. */
export function chooseFacts<T extends PlanFact>(plan: T[], slots: QuestionSlotInfo[], options: ChooseOptions = {}): FactChoice<T> {
  const total = slots.length
  const rows = options.distribution && options.distribution.length > 0 ? options.distribution : undefined
  const clusters = clusterTopics(plan, rows)
  const groupCount = rows ? rows.length : Math.max(0, ...clusters) + 1
  const earlier = options.earlier ?? []
  const candidates = plan.map((entry, index) => ({ entry, index, penalty: earlier.some((old) => factSimilarity(old.fact, entry.fact) >= FACT_REUSE) ? 1 : 0 }))
  const groups: { entry: T; penalty: number; index: number }[][] = Array.from({ length: groupCount }, () => [])
  candidates.forEach((candidate, index) => {
    const group = clusters[index]
    if (group >= 0) groups[group].push(candidate)
  })

  // How many questions each topic gets.
  const concepts = new Map<string, number>()
  const rowShortfall: FactChoice<T>['rowShortfall'] = []
  let quotas: number[]
  if (rows) {
    quotas = rows.map((row) => row.count)
  } else {
    const sizes = groups.map((group) => group.length)
    quotas = largestRemainder(sizes, total)
    const share = (size: number) => size / Math.max(1, plan.length)
    const cap = groups.map((group) => Math.min(group.length, Math.max(Math.ceil(MAX_TOPIC_SHARE * total), Math.ceil(share(group.length) * total))))
    // A topic cannot get more questions than it has facts (or than the 40 % cap): the rest goes to topics with room.
    let surplus = 0
    quotas = quotas.map((quota, index) => {
      const kept = Math.min(quota, cap[index])
      surplus += quota - kept
      return kept
    })
    for (let guard = 0; surplus > 0 && guard < 200; guard += 1) {
      const room = quotas.map((quota, index) => cap[index] - quota)
      const target = room.indexOf(Math.max(...room))
      if (target < 0 || room[target] <= 0) break
      quotas[target] += 1
      surplus -= 1
    }
  }

  const pickedByGroup = groups.map((group, index) => pickFromGroup(group, quotas[index] ?? 0, concepts))
  if (rows) {
    rows.forEach((row, index) => {
      if (pickedByGroup[index].length < row.count) rowShortfall.push({ row: index, text: row.text, wanted: row.count, found: pickedByGroup[index].length })
    })
  }
  // The plan cannot always fill every quota: top up from whatever is left, keeping the concept limit.
  let count = pickedByGroup.reduce((sum, group) => sum + group.length, 0)
  if (count < total && !rows) {
    const taken = new Set(pickedByGroup.flat())
    const rest = candidates.filter((candidate) => !taken.has(candidate.entry) && usable(candidate.entry, concepts)).sort((a, b) => a.penalty - b.penalty || a.index - b.index)
    for (const { entry, index } of rest) {
      if (count >= total) break
      const group = clusters[index]
      pickedByGroup[group].push(entry)
      const key = conceptKey(entry.concept)
      if (key) concepts.set(key, (concepts.get(key) ?? 0) + 1)
      count += 1
    }
  }

  // Heavy slots first, each to a different topic until every topic has one, then to the topic with the most questions still to place.
  const heavyFirst = slots.map((slot, index) => ({ slot, index })).sort((a, b) => questionWeight(b.slot) - questionWeight(a.slot) || a.index - b.index)
  const remaining = pickedByGroup.map((group) => [...group])
  const order = remaining.map((_, index) => index).sort((a, b) => remaining[b].length - remaining[a].length || a - b)
  const result: (T | undefined)[] = new Array(total).fill(undefined)
  let round = 0
  for (const { index } of heavyFirst) {
    let group: number | undefined
    if (round < order.length) {
      group = order.slice(round).find((candidate) => remaining[candidate].length > 0)
      round += 1
    }
    if (group === undefined) group = remaining.map((list, i) => ({ i, left: list.length })).sort((a, b) => b.left - a.left || a.i - b.i).find((entry) => entry.left > 0)?.i
    if (group === undefined) continue
    result[index] = remaining[group].shift()
  }
  separateRepeatedForms(result, slots, earlier)
  return { facts: result.filter((entry): entry is T => entry !== undefined), rowShortfall }
}

/** A fact an earlier exam used is reused only in another form: swap slots until no reused fact sits in the form it had. */
function separateRepeatedForms<T extends PlanFact>(result: (T | undefined)[], slots: QuestionSlotInfo[], earlier: { fact: string; form: string }[]): void {
  const formOf = (slot: QuestionSlotInfo) => `${slot.type}:${slot.bloom}`
  const clash = (entry: T | undefined, slot: QuestionSlotInfo) => entry !== undefined && earlier.some((old) => old.form === formOf(slot) && factSimilarity(old.fact, entry.fact) >= FACT_REUSE)
  for (let i = 0; i < result.length; i += 1) {
    if (!clash(result[i], slots[i])) continue
    for (let j = 0; j < result.length; j += 1) {
      if (i === j || clash(result[i], slots[j]) || clash(result[j], slots[i])) continue
      ;[result[i], result[j]] = [result[j], result[i]]
      break
    }
  }
}
