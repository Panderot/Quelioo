import { getAuthState } from '../auth/authStore'
import { enqueueWrite } from '../data/writeQueue'
import type { Card, Deck } from '../flashcardStorage'
import { supabase } from '../supabase'
import type { InsertRow } from '../supabase'

/** Supabase side of the flashcard store: tables `decks`, `cards` and `card_progress`. Times are
 * milliseconds in the app and exact instants (timestamptz) in the database. */

export interface FlashcardWrites {
  putDecks?: Deck[]
  deleteDecks?: string[]
  /** New or edited cards (content and progress). */
  putCards?: Card[]
  /** Cards whose progress changed (a review, a reset); their text is untouched. */
  putProgress?: Card[]
  deleteCards?: string[]
}

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (value: string | null) => (value === null ? null : new Date(value).getTime())

export function deckToRow(deck: Deck, userId: string): InsertRow<'decks'> {
  return {
    id: deck.id,
    user_id: userId,
    name: deck.name,
    description: deck.description,
    source: deck.source,
    source_ref: deck.sourceRef,
    language: deck.language,
    new_per_day: deck.newPerDay,
    created_at: iso(deck.createdAt),
    updated_at: iso(deck.updatedAt),
  }
}

export function cardToRow(card: Card, userId: string): InsertRow<'cards'> {
  return { id: card.id, user_id: userId, deck_id: card.deckId, front: card.front, back: card.back, created_at: iso(card.createdAt) }
}

export function progressToRow(card: Card, userId: string): InsertRow<'card_progress'> {
  return {
    card_id: card.id,
    user_id: userId,
    box: card.box,
    due: iso(card.due),
    lapses: card.lapses,
    reviews: card.reviews,
    last_reviewed_at: card.lastReviewedAt === null ? null : iso(card.lastReviewedAt),
    introduced_at: card.introducedAt === null ? null : iso(card.introducedAt),
  }
}

/** Queues the writes in dependency order (decks, then cards, then progress; deletes last). */
export function enqueueFlashcardWrites(writes: FlashcardWrites): void {
  const userId = getAuthState().user?.id
  if (!userId) return
  if (writes.putDecks?.length) enqueueWrite({ kind: 'upsert', table: 'decks', rows: writes.putDecks.map((deck) => deckToRow(deck, userId)), onConflict: 'id' })
  if (writes.putCards?.length) {
    enqueueWrite({ kind: 'upsert', table: 'cards', rows: writes.putCards.map((card) => cardToRow(card, userId)), onConflict: 'id' })
    enqueueWrite({ kind: 'upsert', table: 'card_progress', rows: writes.putCards.map((card) => progressToRow(card, userId)), onConflict: 'card_id' })
  }
  if (writes.putProgress?.length) enqueueWrite({ kind: 'upsert', table: 'card_progress', rows: writes.putProgress.map((card) => progressToRow(card, userId)), onConflict: 'card_id' })
  if (writes.deleteCards?.length) enqueueWrite({ kind: 'delete', table: 'cards', column: 'id', values: writes.deleteCards })
  if (writes.deleteDecks?.length) enqueueWrite({ kind: 'delete', table: 'decks', column: 'id', values: writes.deleteDecks })
}

async function readAllRows<T>(table: 'decks' | 'cards' | 'card_progress'): Promise<T[] | null> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(table === 'card_progress' ? 'card_id' : 'id').range(from, from + 999)
    if (error) return null
    rows.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return rows
}

/** Every deck and card of the signed-in user, in the app's own (millisecond) shape; null on error. */
export async function fetchFlashcards(): Promise<{ decks: Partial<Deck>[]; cards: Partial<Card>[] } | null> {
  const [deckRows, cardRows, progressRows] = await Promise.all([
    readAllRows<Record<string, unknown>>('decks'),
    readAllRows<Record<string, unknown>>('cards'),
    readAllRows<Record<string, unknown>>('card_progress'),
  ])
  if (!deckRows || !cardRows || !progressRows) return null
  const progress = new Map(progressRows.map((row) => [row.card_id as string, row]))
  const decks = deckRows.map<Partial<Deck>>((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    source: row.source as Deck['source'],
    sourceRef: (row.source_ref as string | null) ?? null,
    language: row.language as string,
    newPerDay: row.new_per_day as number,
    createdAt: ms(row.created_at as string) ?? Date.now(),
    updatedAt: ms(row.updated_at as string) ?? Date.now(),
  }))
  const cards = cardRows.map<Partial<Card>>((row) => {
    const createdAt = ms(row.created_at as string) ?? Date.now()
    const p = progress.get(row.id as string)
    return {
      id: row.id as string,
      deckId: row.deck_id as string,
      front: row.front as string,
      back: row.back as string,
      createdAt,
      ...(p
        ? {
            box: p.box as Card['box'],
            due: ms(p.due as string) ?? createdAt,
            lapses: p.lapses as number,
            reviews: p.reviews as number,
            lastReviewedAt: ms((p.last_reviewed_at as string | null) ?? null),
            introducedAt: ms((p.introduced_at as string | null) ?? null),
          }
        : {}),
    }
  })
  return { decks, cards }
}
