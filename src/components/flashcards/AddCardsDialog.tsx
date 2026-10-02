import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { CardsErrorCode, GeneratedCards } from '../../api/cards'
import { SolveExtraApiError } from '../../api/postJson'
import { selectedCards, toReviewCards } from '../../lib/cardReview'
import type { ReviewCard } from '../../lib/cardReview'
import { addCards, cardsForDeck, createDeck, useFlashcards } from '../../lib/flashcardStorage'
import type { DeckSource } from '../../lib/flashcardStorage'
import { MAX_DECK_NAME_CHARS, normalizeFront } from '../../lib/flashcardText'
import Select from '../Select'
import { CloseIcon, SpinnerIcon } from '../icons'
import CardReviewList from './CardReviewList'

interface AddCardsDialogProps {
  title: string
  defaultDeckName: string
  source: DeckSource
  /** The quiz or solution id; a deck already made from it triggers the "already converted" note. */
  sourceRef: string | null
  /** Cards ready for review (quiz conversion), or… */
  initialCards?: { front: string; back: string }[]
  /** …an AI request run when the dialog opens (solution → cards). */
  generate?: (signal: AbortSignal) => Promise<GeneratedCards>
  onClose: () => void
}

type Phase = 'loading' | 'error' | 'review' | 'done'

/** Review step + destination (new deck named after the source, or an existing deck) for cards made
 * from a quiz or a solution. Nothing is saved until "Add N cards". */
export default function AddCardsDialog({ title, defaultDeckName, source, sourceRef, initialCards, generate, onClose }: AddCardsDialogProps) {
  const { t, i18n } = useTranslation()
  const uid = useId()
  const state = useFlashcards()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>(generate ? 'loading' : 'review')
  const [error, setError] = useState<CardsErrorCode | null>(null)
  const [review, setReview] = useState<ReviewCard[]>(() => toReviewCards(initialCards ?? []))
  const [destination, setDestination] = useState<'new' | 'existing'>('new')
  const [deckName, setDeckName] = useState(defaultDeckName.slice(0, MAX_DECK_NAME_CHARS))
  const [existingId, setExistingId] = useState('')
  const [result, setResult] = useState<{ deckId: string; deckName: string; count: number } | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Previously converted from the same quiz/solution.
  const sourceDeck = useMemo(() => (sourceRef ? state.decks.find((deck) => deck.source === source && deck.sourceRef === sourceRef) : undefined), [state.decks, source, sourceRef])
  const targetId = destination === 'existing' ? existingId || state.decks[0]?.id || '' : ''
  const targetFronts = useMemo(() => (targetId ? cardsForDeck(state.cards, targetId).map((card) => card.front) : []), [state.cards, targetId])
  const sourceDeckFronts = useMemo(() => (sourceDeck ? new Set(cardsForDeck(state.cards, sourceDeck.id).map((card) => normalizeFront(card.front))) : null), [state.cards, sourceDeck])
  const missingCount = sourceDeckFronts ? review.filter((card) => !sourceDeckFronts.has(normalizeFront(card.front))).length : 0
  const selected = selectedCards(review)

  // Read through a ref so a parent re-render (new function identity) never starts a second request.
  const generateRef = useRef(generate)
  useEffect(() => {
    generateRef.current = generate
  }, [generate])

  // One request per attempt: the started attempt is remembered in a ref, so React's dev-mode
  // effect re-run never sends a second (billed) request. Closing aborts it explicitly.
  const controllerRef = useRef<AbortController | null>(null)
  const startedAttempt = useRef(-1)
  useEffect(() => {
    const run = generateRef.current
    if (!run || startedAttempt.current === attempt) return
    startedAttempt.current = attempt
    const controller = new AbortController()
    controllerRef.current = controller
    run(controller.signal)
      .then((generated) => {
        if (controller.signal.aborted) return
        setReview(toReviewCards(generated.cards))
        setPhase('review')
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return
        setError(caught instanceof SolveExtraApiError ? (caught.code as CardsErrorCode) : 'upstream')
        setPhase('error')
      })
  }, [attempt])

  const close = () => {
    controllerRef.current?.abort()
    onClose()
  }

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }

  const onlyMissing = () => {
    if (!sourceDeck || !sourceDeckFronts) return
    setReview((current) => current.filter((card) => !sourceDeckFronts.has(normalizeFront(card.front))))
    setDestination('existing')
    setExistingId(sourceDeck.id)
  }

  const handleAdd = () => {
    if (selected.length === 0) return
    if (destination === 'existing' && targetId) {
      const deck = state.decks.find((entry) => entry.id === targetId)
      addCards(targetId, selected)
      setResult({ deckId: targetId, deckName: deck?.name || t('flashcards.untitledDeck'), count: selected.length })
    } else {
      const name = deckName.trim() || defaultDeckName || t('flashcards.untitledDeck')
      const deck = createDeck({ name, source, sourceRef, language: i18n.language })
      addCards(deck.id, selected)
      setResult({ deckId: deck.id, deckName: deck.name, count: selected.length })
    }
    setPhase('done')
  }

  const radioClass = (active: boolean) =>
    `rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${active ? 'border-amber bg-amber/15 text-amber-text' : 'border-warm-border text-ink hover:border-focus-neutral'}`

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/40" aria-hidden onClick={close} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        data-purpose="add-cards-dialog"
        className="fixed inset-x-3 top-1/2 z-50 mx-auto max-h-[88vh] max-w-2xl -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl border border-warm-border bg-card p-5 shadow-lg focus:outline-none sm:inset-x-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${uid}-title`} className="font-serif text-lg font-semibold text-navy">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('song.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-warm-border/50 hover:text-ink"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {phase === 'loading' && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <SpinnerIcon className="h-4 w-4 text-amber-text" />
            {t('flashcards.generate.generating')}
            <button type="button" onClick={close} className="font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
              {t('flashcards.common.cancel')}
            </button>
          </div>
        )}

        {phase === 'error' && error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
            <span className="font-semibold">{t(`flashcards.generate.errors.${error}`)}</span>
            {error !== 'rate_limited' && (
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setPhase('loading')
                  setAttempt((value) => value + 1)
                }}
                className="font-bold underline-offset-2 hover:underline"
              >
                {t('flashcards.generate.retry')}
              </button>
            )}
          </div>
        )}

        {phase === 'review' && (
          <>
            {sourceDeck && destination === 'new' && (
              <div data-purpose="already-converted" className="space-y-2 rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm text-ink">
                <p>{t('flashcards.convert.alreadyConverted', { name: sourceDeck.name || t('flashcards.untitledDeck') })}</p>
                {missingCount > 0 ? (
                  <button type="button" onClick={onlyMissing} className="rounded-xl border-2 border-navy px-3 py-1.5 text-xs font-bold text-navy hover:bg-navy/5">
                    {t('flashcards.convert.onlyMissing', { count: missingCount })}
                  </button>
                ) : (
                  <p className="text-xs text-muted">{t('flashcards.convert.nothingMissing')}</p>
                )}
              </div>
            )}

            {review.length === 0 ? (
              <p className="text-sm text-muted">{t('flashcards.convert.noCards')}</p>
            ) : (
              <>
                <p className="text-xs text-muted">{t('flashcards.generate.reviewHelp')}</p>
                <CardReviewList cards={review} onChange={setReview} existingFronts={targetFronts} />
              </>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">{t('flashcards.convert.destination')}</legend>
              <div role="radiogroup" aria-label={t('flashcards.convert.destination')} className="grid gap-2 sm:grid-cols-2">
                <button type="button" role="radio" aria-checked={destination === 'new'} onClick={() => setDestination('new')} className={radioClass(destination === 'new')}>
                  {t('flashcards.convert.newDeck')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={destination === 'existing'}
                  disabled={state.decks.length === 0}
                  onClick={() => setDestination('existing')}
                  className={`${radioClass(destination === 'existing')} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {t('flashcards.convert.existingDeck')}
                </button>
              </div>
              {destination === 'new' ? (
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-ink">{t('flashcards.editor.nameLabel')}</span>
                  <input
                    type="text"
                    value={deckName}
                    maxLength={MAX_DECK_NAME_CHARS}
                    onChange={(event) => setDeckName(event.target.value)}
                    data-purpose="convert-deck-name"
                    className="w-full rounded-xl border border-warm-border bg-paper px-3 py-2 text-sm text-ink hover:border-focus-neutral"
                  />
                </label>
              ) : (
                <div className="space-y-1">
                  <span id={`${uid}-deck`} className="text-xs font-semibold text-ink">
                    {t('flashcards.convert.chooseDeck')}
                  </span>
                  <Select
                    id={`${uid}-deck-select`}
                    value={targetId}
                    options={state.decks.map((deck) => ({ value: deck.id, label: deck.name || t('flashcards.untitledDeck') }))}
                    onChange={setExistingId}
                    labelledBy={`${uid}-deck`}
                  />
                </div>
              )}
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={selected.length === 0}
                className="rounded-xl bg-amber px-4 py-2 text-sm font-bold text-navy hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('flashcards.generate.add', { count: selected.length })}
              </button>
              <button type="button" onClick={close} className="rounded-xl border border-warm-border px-4 py-2 text-sm font-semibold text-ink hover:border-focus-neutral">
                {t('flashcards.common.cancel')}
              </button>
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <div role="status" className="space-y-3">
            <p className="text-sm font-semibold text-success">{t('flashcards.convert.added', { count: result.count, name: result.deckName })}</p>
            <div className="flex flex-wrap gap-2">
              <Link to={`/flashcards/${result.deckId}`} className="rounded-xl border-2 border-navy px-4 py-2 text-sm font-bold text-navy hover:bg-navy/5">
                {t('flashcards.convert.openDeck')}
              </Link>
              <button type="button" onClick={close} className="rounded-xl border border-warm-border px-4 py-2 text-sm font-semibold text-ink hover:border-focus-neutral">
                {t('flashcards.convert.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
