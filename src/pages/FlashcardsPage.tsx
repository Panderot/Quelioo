import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { SAMPLE_DECK_KEYS, SAMPLE_REF_PREFIX, sampleDeckCards } from '../data/sampleDecks'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNow } from '../hooks/useNow'
import { addCards, cardsForDeck, createDeck, dismissDeletedDeck, dueCountForDeck, undoDeleteDeck, useFlashcards } from '../lib/flashcardStorage'
import { MASTERED_BOX } from '../lib/srs'
import ProgressRing from '../components/flashcards/ProgressRing'
import StorageNote from '../components/flashcards/StorageNote'
import UndoToast from '../components/flashcards/UndoToast'
import { CardsIcon, PlusIcon, SearchIcon } from '../components/icons'

export default function FlashcardsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const state = useFlashcards()
  const now = Math.max(useNow(), state.changedAt)
  const [search, setSearch] = useState('')
  useDocumentTitle(t('flashcards.title'))

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return state.decks
      .filter((deck) => !query || (deck.name || t('flashcards.untitledDeck')).toLocaleLowerCase().includes(query))
      .map((deck) => {
        const cards = cardsForDeck(state.cards, deck.id)
        return {
          deck,
          total: cards.length,
          learned: cards.filter((card) => card.reviews > 0 && card.box >= 2).length,
          mastered: cards.filter((card) => card.box >= MASTERED_BOX).length,
          due: dueCountForDeck(deck, state.cards, now),
        }
      })
      .sort((a, b) => b.due - a.due || b.deck.updatedAt - a.deck.updatedAt)
  }, [state.decks, state.cards, search, now, t])

  const handleNewDeck = () => {
    const deck = createDeck({ name: t('flashcards.untitledDeck'), language: i18n.language })
    navigate(`/flashcards/${deck.id}`, { state: { focusName: true } })
  }

  const handleAddSamples = () => {
    for (const key of SAMPLE_DECK_KEYS) {
      const deck = createDeck({ name: t(`flashcards.samples.${key}`), source: 'manual', sourceRef: `${SAMPLE_REF_PREFIX}${key}`, language: i18n.language })
      addCards(deck.id, sampleDeckCards(key, i18n.language))
    }
  }

  const hasSamples = state.decks.some((deck) => deck.sourceRef?.startsWith(SAMPLE_REF_PREFIX))

  return (
    <>
      <section data-purpose="page-intro" className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">{t('flashcards.title')}</h1>
          <p className="text-sm font-normal text-muted">{t('flashcards.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={handleNewDeck}
          disabled={!state.loaded}
          className="flex h-11 items-center gap-2 rounded-xl bg-amber px-5 text-sm font-bold text-navy shadow-sm transition-colors hover:bg-amber-hover disabled:opacity-60"
        >
          <PlusIcon className="h-4 w-4" />
          {t('flashcards.newDeck')}
        </button>
      </section>

      <StorageNote state={state} />

      {state.loaded && state.decks.length === 0 && (
        <div data-purpose="flashcards-empty" className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center">
          <CardsIcon className="h-8 w-8 text-muted" />
          <div>
            <p className="text-sm font-semibold text-ink">{t('flashcards.empty.title')}</p>
            <p className="mt-1 text-xs text-muted">{t('flashcards.empty.subtitle')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={handleNewDeck} className="rounded-xl border-2 border-navy px-4 py-2 text-xs font-bold text-navy hover:bg-navy/5">
              {t('flashcards.newDeck')}
            </button>
            {!hasSamples && (
              <button type="button" onClick={handleAddSamples} className="rounded-xl border border-warm-border px-4 py-2 text-xs font-semibold text-ink hover:border-focus-neutral">
                {t('flashcards.samples.add')}
              </button>
            )}
          </div>
        </div>
      )}

      {state.decks.length > 0 && (
        <>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('flashcards.searchPlaceholder')}
              aria-label={t('flashcards.searchPlaceholder')}
              className="w-full rounded-lg border border-warm-border bg-card py-2 pr-3 pl-9 text-sm text-ink sm:max-w-xs"
            />
          </div>

          {rows.length === 0 ? (
            <p className="rounded-[14px] border border-warm-border bg-card p-6 text-center text-sm text-muted">{t('flashcards.noMatches')}</p>
          ) : (
            <ul data-purpose="deck-list" className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
              {rows.map(({ deck, total, learned, mastered, due }) => {
                const name = deck.name || t('flashcards.untitledDeck')
                return (
                  <li key={deck.id} data-purpose="deck-row" className="flex flex-wrap items-center gap-4 p-4 md:p-5">
                    <ProgressRing value={mastered} total={total} label={t('flashcards.list.ringLabel', { mastered, total })} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link to={`/flashcards/${deck.id}`} className="block truncate text-sm font-semibold text-ink hover:text-amber-text">
                        {name}
                      </Link>
                      <p className="text-xs text-muted">
                        {[t('flashcards.list.cards', { count: total }), t('flashcards.list.learned', { count: learned }), t('flashcards.list.dueToday', { count: due })].join(' · ')}
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Link
                        to={`/flashcards/${deck.id}/study`}
                        aria-label={t('flashcards.list.studyLabel', { name, count: due })}
                        className={`flex-1 rounded-xl px-4 py-2 text-center text-xs font-bold sm:flex-none ${
                          due > 0 ? 'border-2 border-navy text-navy hover:bg-navy/5' : 'border border-warm-border text-muted hover:border-focus-neutral hover:text-ink'
                        }`}
                      >
                        {t('flashcards.list.study', { count: due })}
                      </Link>
                      <Link
                        to={`/flashcards/${deck.id}`}
                        aria-label={t('flashcards.list.editLabel', { name })}
                        className="flex-1 rounded-xl border border-warm-border px-4 py-2 text-center text-xs font-semibold text-ink hover:border-focus-neutral sm:flex-none"
                      >
                        {t('flashcards.list.edit')}
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {state.deletedDeck && (
        <UndoToast
          key={state.deletedDeck.deck.id}
          message={t('flashcards.deck.deleted', { name: state.deletedDeck.deck.name || t('flashcards.untitledDeck') })}
          onUndo={undoDeleteDeck}
          onDismiss={dismissDeletedDeck}
        />
      )}
    </>
  )
}
