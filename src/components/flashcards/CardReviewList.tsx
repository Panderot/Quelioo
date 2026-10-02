import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { MAX_BACK_CHARS, MAX_FRONT_CHARS, normalizeFront } from '../../lib/flashcardText'
import type { ReviewCard } from '../../lib/cardReview'

const inputClass = 'w-full resize-y rounded-xl border border-warm-border bg-paper px-3 py-2 text-sm text-ink hover:border-focus-neutral'

interface CardReviewListProps {
  cards: ReviewCard[]
  onChange: (cards: ReviewCard[]) => void
  /** Fronts already in the target deck; matching cards are flagged as duplicates. */
  existingFronts: string[]
}

/** Review step shared by every card source: each card editable, with a checkbox (all checked). */
export default function CardReviewList({ cards, onChange, existingFronts }: CardReviewListProps) {
  const { t } = useTranslation()
  const duplicateKeys = useMemo(() => {
    const result = new Set<number>()
    const seen = new Set(existingFronts.map(normalizeFront).filter(Boolean))
    for (const card of cards) {
      const key = normalizeFront(card.front)
      if (!key) continue
      if (seen.has(key)) result.add(card.key)
      seen.add(key)
    }
    return result
  }, [cards, existingFronts])

  const update = (key: number, patch: Partial<ReviewCard>) => onChange(cards.map((card) => (card.key === key ? { ...card, ...patch } : card)))

  return (
    <ul data-purpose="review-list" className="divide-y divide-warm-border rounded-xl border border-warm-border">
      {cards.map((card, index) => (
        <li key={card.key} data-purpose="review-card" className={`grid gap-2 p-3 sm:grid-cols-[auto_1fr_1fr] ${card.checked ? '' : 'opacity-60'}`}>
          <input
            type="checkbox"
            checked={card.checked}
            onChange={(event) => update(card.key, { checked: event.target.checked })}
            aria-label={t('flashcards.generate.include', { number: index + 1 })}
            className="mt-2 h-4 w-4 accent-amber"
          />
          <textarea
            rows={2}
            value={card.front}
            maxLength={MAX_FRONT_CHARS}
            onChange={(event) => update(card.key, { front: event.target.value })}
            aria-label={t('flashcards.editor.frontLabel', { number: index + 1 })}
            className={`${inputClass} ${duplicateKeys.has(card.key) ? 'border-error' : ''}`}
          />
          <textarea
            rows={2}
            value={card.back}
            maxLength={MAX_BACK_CHARS}
            onChange={(event) => update(card.key, { back: event.target.value })}
            aria-label={t('flashcards.editor.backLabel', { number: index + 1 })}
            className={inputClass}
          />
          {duplicateKeys.has(card.key) && <p className="text-xs font-semibold text-error sm:col-start-2 sm:col-end-4">{t('flashcards.editor.duplicate')}</p>}
        </li>
      ))}
    </ul>
  )
}
