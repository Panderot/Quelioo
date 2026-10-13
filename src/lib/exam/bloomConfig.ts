import type { BloomLevel, ExamLevel, ExamQuestionType } from './types.js'

/** The only place the Bloom numbers live. Order of each mix: Hatırlama / Anlama / Uygulama / Analiz / Değerlendirme / Yaratma (percent). */

export type GradeBand = 'primary' | 'middle' | 'high' | 'university'

export const BLOOM_MIX: Record<GradeBand, [number, number, number, number, number, number]> = {
  primary: [30, 35, 25, 10, 0, 0], // grades 1-4
  middle: [20, 30, 25, 15, 5, 5], // grades 5-8
  high: [15, 25, 25, 20, 10, 5], // grades 9-12
  university: [10, 20, 25, 20, 15, 10],
}

/** "Üst düzey düşünme": how the three upper levels share the questions (Analiz / Değerlendirme / Yaratma, percent). */
export const HIGHER_ORDER_SPLIT: [number, number, number] = [60, 25, 15]

/** The highest level each question type can reach. Multiple choice measures up to Analiz; Değerlendirme and Yaratma need an open-ended answer. */
export const BLOOM_CAP: Record<ExamQuestionType, BloomLevel> = {
  'true-false': 2,
  'fill-blanks': 2,
  matching: 2,
  'short-answer': 3,
  mcq: 4,
  'open-ended': 6,
}

export function gradeBand(level: ExamLevel): GradeBand {
  if (level === '1' || level === '2' || level === '3' || level === '4') return 'primary'
  if (level === '5' || level === '6' || level === '7' || level === '8') return 'middle'
  if (level === 'university' || level === 'other') return 'university'
  return 'high'
}
