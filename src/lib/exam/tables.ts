import { normalize } from './text'
import { BLOOM_LEVELS } from './types'
import type { BloomLevel, ExamQuestion } from './types'

/** The two tables of the answer key (E6): topic distribution (topic × question numbers, count, points) and table of specifications (topic × Bloom level). Both are computed from the questions, so they always match them. */

export interface TableQuestion extends Pick<ExamQuestion, 'topic' | 'points' | 'bloomLevel'> {
  /** The number on the printed paper. */
  number: number
}

export interface DistributionRow {
  topic: string
  numbers: number[]
  count: number
  points: number
}

export interface SpecRow {
  topic: string
  /** Question numbers per Bloom level (index 0 = level 1); questions without a level are in `unset`. */
  cells: number[][]
  unset: number[]
  count: number
}

const sortNumbers = (numbers: number[]) => [...numbers].sort((a, b) => a - b)

/** Questions grouped by topic, in order of first appearance; an empty topic is its own group (labelled by the caller). */
function groupByTopic<T extends TableQuestion>(questions: T[]): { topic: string; items: T[] }[] {
  const groups = new Map<string, { topic: string; items: T[] }>()
  for (const question of questions) {
    const key = normalize(question.topic)
    const group = groups.get(key) ?? { topic: question.topic.trim(), items: [] }
    group.items.push(question)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function distributionRows(questions: TableQuestion[]): DistributionRow[] {
  return groupByTopic(questions).map(({ topic, items }) => ({ topic, numbers: sortNumbers(items.map((item) => item.number)), count: items.length, points: items.reduce((sum, item) => sum + item.points, 0) }))
}

export function specRows(questions: TableQuestion[]): SpecRow[] {
  return groupByTopic(questions).map(({ topic, items }) => ({
    topic,
    cells: BLOOM_LEVELS.map((level: BloomLevel) => sortNumbers(items.filter((item) => item.bloomLevel === level).map((item) => item.number))),
    unset: sortNumbers(items.filter((item) => item.bloomLevel === undefined).map((item) => item.number)),
    count: items.length,
  }))
}

/** Totals per Bloom level (and for the questions without one) over all rows of the table of specifications. */
export function specTotals(rows: SpecRow[]): { perLevel: number[]; unset: number; total: number } {
  return {
    perLevel: BLOOM_LEVELS.map((_, index) => rows.reduce((sum, row) => sum + row.cells[index].length, 0)),
    unset: rows.reduce((sum, row) => sum + row.unset.length, 0),
    total: rows.reduce((sum, row) => sum + row.count, 0),
  }
}

/** "1, 4, 7" */
export const numbersText = (numbers: number[]): string => numbers.join(', ')
