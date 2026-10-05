import { postJson, SolveExtraApiError } from './postJson'
import type { CardLevel, CardStyle } from '../lib/cardGeneration'

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
  | 'network'

export interface CardsRequestPayload {
  /** "solution": a solved problem as text; the server asks for 3-6 method cards. */
  mode: 'text' | 'topic' | 'solution'
  text?: string
  topic?: string
  level?: CardLevel
  /** Ignored for "solution"; "auto" (text only) writes one card per main fact. */
  count?: number | 'auto'
  style?: CardStyle
  language: string
  /** The app's language, used when the source does not reveal its own. */
  uiLanguage?: string
  /** Fronts already in the target deck, so new cards don't repeat them. */
  avoid: string[]
}

export interface GeneratedCards {
  cards: { front: string; back: string }[]
  /** Topic mode: doubtful cards the verification call removed. */
  removed: number
  /** Cards the request aimed for; fewer came back when the content supports no more distinct cards. */
  requested: number
}

const KNOWN: ReadonlySet<string> = new Set(['bad_type', 'too_large', 'too_short', 'too_long', 'same_language', 'upstream', 'parse', 'model', 'not_configured', 'rate_limited', 'unverified'])

export async function generateCards(payload: CardsRequestPayload, signal?: AbortSignal): Promise<GeneratedCards> {
  let body: Record<string, unknown>
  try {
    body = await postJson<CardsErrorCode>('/api/cards', payload, KNOWN, signal)
  } catch (error) {
    // A malformed model reply gets one silent second try before the student sees an error.
    if (!(error instanceof SolveExtraApiError) || error.code !== 'parse') throw error
    body = await postJson<CardsErrorCode>('/api/cards', payload, KNOWN, signal)
  }
  const cards = Array.isArray(body.cards)
    ? body.cards.filter(
        (card): card is { front: string; back: string } =>
          typeof card === 'object' && card !== null && typeof card.front === 'string' && typeof card.back === 'string' && card.front.trim() !== '' && card.back.trim() !== '',
      )
    : []
  if (cards.length === 0) throw new SolveExtraApiError<CardsErrorCode>('parse')
  return { cards: cards.map(({ front, back }) => ({ front, back })), removed: typeof body.removed === 'number' ? body.removed : 0, requested: typeof body.requested === 'number' ? body.requested : cards.length }
}
