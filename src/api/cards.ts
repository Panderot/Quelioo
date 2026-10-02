import { postJson, SolveExtraApiError } from './postJson'
import type { CardLevel, CardStyle } from '../lib/cardGeneration'

export type CardsErrorCode =
  | 'bad_type'
  | 'too_large'
  | 'too_short'
  | 'too_long'
  | 'upstream'
  | 'parse'
  | 'model'
  | 'not_configured'
  | 'rate_limited'
  | 'unverified'
  | 'network'

export interface CardsRequestPayload {
  mode: 'text' | 'topic'
  text?: string
  topic?: string
  level?: CardLevel
  count: number
  style: CardStyle
  language: string
  /** Fronts already in the target deck, so new cards don't repeat them. */
  avoid: string[]
}

export interface GeneratedCards {
  cards: { front: string; back: string }[]
  /** Topic mode: doubtful cards the verification call removed. */
  removed: number
}

const KNOWN: ReadonlySet<string> = new Set(['bad_type', 'too_large', 'too_short', 'too_long', 'upstream', 'parse', 'model', 'not_configured', 'rate_limited', 'unverified'])

export async function generateCards(payload: CardsRequestPayload, signal?: AbortSignal): Promise<GeneratedCards> {
  const body = await postJson<CardsErrorCode>('/api/cards', payload, KNOWN, signal)
  const cards = Array.isArray(body.cards)
    ? body.cards.filter(
        (card): card is { front: string; back: string } =>
          typeof card === 'object' && card !== null && typeof card.front === 'string' && typeof card.back === 'string' && card.front.trim() !== '' && card.back.trim() !== '',
      )
    : []
  if (cards.length === 0) throw new SolveExtraApiError<CardsErrorCode>('parse')
  return { cards: cards.map(({ front, back }) => ({ front, back })), removed: typeof body.removed === 'number' ? body.removed : 0 }
}
