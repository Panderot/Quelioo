import type { TFunction } from 'i18next'

import type { LegacySummary } from '../../lib/import/importLocalData'

export const DATA_IMPORTED_EVENT = 'quelio:data-imported'

const KINDS = ['decks', 'quizzes', 'songs', 'solutions', 'lessons'] as const

/** "8 decks, 23 quizzes and 4 songs": only the kinds that are present, joined in the UI language. */
export function describeSummary(t: TFunction, summary: Pick<LegacySummary, (typeof KINDS)[number]>): string {
  const parts = KINDS.filter((kind) => summary[kind] > 0).map((kind) => t(`importDialog.counts.${kind}`, { count: summary[kind] }))
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} ${t('importDialog.and')} ${parts[parts.length - 1]}`
}

export function describeCards(t: TFunction, cards: number): string {
  return t('importDialog.counts.cards', { count: cards })
}
