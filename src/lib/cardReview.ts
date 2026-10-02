/** Draft cards in a review list (edit, untick) before anything is saved. */

export interface ReviewCard {
  key: number
  front: string
  back: string
  checked: boolean
}

export function toReviewCards(cards: { front: string; back: string }[]): ReviewCard[] {
  return cards.map((card, index) => ({ key: index, front: card.front, back: card.back, checked: true }))
}

/** Checked cards with both sides filled, trimmed — what "Add N cards" saves. */
export function selectedCards(cards: ReviewCard[]): { front: string; back: string }[] {
  return cards.filter((card) => card.checked && card.front.trim() && card.back.trim()).map((card) => ({ front: card.front.trim(), back: card.back.trim() }))
}
