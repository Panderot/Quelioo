import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsPageActive } from '../hooks/usePageActive'
import { useNow } from '../hooks/useNow'
import { addCards, cardsForDeck, deleteCard, deleteDeck, discardBlankDeck, dueCountForDeck, resetDeckProgress, restoreCard, updateCard, updateDeck, useFlashcards } from '../lib/flashcardStorage'
import type { Card } from '../lib/flashcardStorage'
import {
  MAX_BACK_CHARS,
  MAX_IMPORT_CARDS,
  MAX_DECK_DESCRIPTION_CHARS,
  MAX_DECK_NAME_CHARS,
  MAX_FRONT_CHARS,
  analyzeCsv,
  cardKey,
  cardsToCsv,
  decodeCsvBytes,
  duplicateFrontIds,
  normalizeFront,
  parseBulk,
  planBulkAdd,
} from '../lib/flashcardText'
import type { CsvAnalysis } from '../lib/flashcardText'
import { cardStage, isStudyable } from '../lib/srs'
import AutosaveField from '../components/flashcards/AutosaveField'
import MathText from '../components/MathText'
import { mathToPlainText } from '../lib/mathPlain'
import CardGeneratorPanel from '../components/flashcards/CardGeneratorPanel'
import ConfirmDialog from '../components/flashcards/ConfirmDialog'
import StorageNote from '../components/flashcards/StorageNote'
import UndoToast from '../components/flashcards/UndoToast'
import Select from '../components/Select'
import { DownloadIcon, PlusIcon, TrashIcon } from '../components/icons'

const NEW_PER_DAY_OPTIONS = [5, 10, 15, 20, 30, 50, 100]
const MAX_IMPORT_BYTES = 2 * 1024 * 1024

const outlineButton = 'flex items-center justify-center gap-1.5 rounded-xl border border-warm-border px-3 py-2 text-xs font-semibold text-ink hover:border-focus-neutral'

function csvFilename(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  return `${safe || 'deck'}.csv`
}

interface CardRowProps {
  card: Card
  index: number
  duplicate: boolean
  autoFocus: boolean
  onDelete: (card: Card) => void
}

function CardRow({ card, index, duplicate, autoFocus, onDelete }: CardRowProps) {
  const { t } = useTranslation()
  const frontRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const noteId = `card-note-${card.id}`

  useEffect(() => {
    if (autoFocus) frontRef.current?.focus()
  }, [autoFocus])

  return (
    <li data-purpose="card-row" className="space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted">{t('flashcards.editor.cardNumber', { number: index + 1 })}</span>
        <span className="flex items-center gap-2">
          <span title={t('flashcards.editor.stageHint')} className="rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-bold text-amber-text">
            {t(`flashcards.editor.stage.${cardStage(card)}`)}
          </span>
          <button
            type="button"
            onClick={() => onDelete(card)}
            aria-label={t('flashcards.editor.deleteCard', { number: index + 1 })}
            title={t('flashcards.editor.deleteCard', { number: index + 1 })}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-error/10 hover:text-error"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <AutosaveField
          inputRef={frontRef}
          multiline
          value={card.front}
          onCommit={(front) => updateCard(card.id, { front })}
          label={t('flashcards.editor.frontLabel', { number: index + 1 })}
          placeholder={t('flashcards.editor.frontPlaceholder')}
          maxLength={MAX_FRONT_CHARS}
          invalid={duplicate}
          describedBy={duplicate || !isStudyable(card) ? noteId : undefined}
          dataPurpose="card-front"
          math
        />
        <AutosaveField
          multiline
          rows={2}
          value={card.back}
          onCommit={(back) => updateCard(card.id, { back })}
          label={t('flashcards.editor.backLabel', { number: index + 1 })}
          placeholder={t('flashcards.editor.backPlaceholder')}
          maxLength={MAX_BACK_CHARS}
          dataPurpose="card-back"
          math
        />
      </div>
      {/* The note line is always reserved, so saving a field on blur never changes the row height
          (a shrinking page under a clicked button would make the click miss). */}
      <p
        id={noteId}
        data-purpose={duplicate ? 'duplicate-warning' : undefined}
        aria-hidden={!duplicate && isStudyable(card)}
        className={`min-h-4 text-xs ${duplicate ? 'font-semibold text-error' : 'text-muted'}`}
      >
        {duplicate ? t('flashcards.editor.duplicate') : !isStudyable(card) ? t('flashcards.editor.incomplete') : ''}
      </p>
    </li>
  )
}

export default function FlashcardDeckPage() {
  const { deckId = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = useFlashcards()
  const now = Math.max(useNow(), state.changedAt)
  const deck = state.decks.find((entry) => entry.id === deckId)
  const cards = useMemo(() => cardsForDeck(state.cards, deckId), [state.cards, deckId])
  const duplicates = useMemo(() => duplicateFrontIds(cards), [cards])
  const dueCount = deck ? dueCountForDeck(deck, state.cards, now) : 0
  useDocumentTitle(deck ? deck.name || t('flashcards.untitledDeck') : t('flashcards.title'))

  const nameRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [focusCardId, setFocusCardId] = useState<string | null>(null)
  const [deletedCard, setDeletedCard] = useState<Card | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  // null = not chosen yet: shown while the deck is empty.
  const [generatorOpen, setGeneratorOpen] = useState<boolean | null>(null)
  const [bulkText, setBulkText] = useState('')
  const [status, setStatus] = useState('')
  // A parsed CSV waits here until the student confirms; nothing is added before that.
  const [csvPreview, setCsvPreview] = useState<CsvAnalysis | null>(null)

  // Arriving from "New deck": select the placeholder name, then drop the flag so a reload doesn't repeat it.
  const focusName = Boolean((location.state as { focusName?: boolean } | null)?.focusName)
  const deckExists = Boolean(deck)
  // A deck made with "New deck" and left without a name or cards disappears when the student leaves it.
  const pageActive = useIsPageActive()
  const visited = useRef<{ id: string; active: boolean } | null>(null)
  useEffect(() => {
    const before = visited.current
    if (before && (before.id !== deckId || (before.active && !pageActive))) discardBlankDeck(before.id)
    visited.current = { id: deckId, active: pageActive }
  }, [deckId, pageActive])
  useEffect(() => {
    if (!focusName || !deckExists) return
    nameRef.current?.focus()
    nameRef.current?.select()
    navigate(location.pathname, { replace: true, state: null })
  }, [focusName, deckExists, navigate, location.pathname])

  const bulkLines = useMemo(() => parseBulk(bulkText).lines, [bulkText])
  const existingKeys = useMemo(() => new Set(cards.map((card) => cardKey(card.front, card.back))), [cards])
  // Live count: valid lines minus cards already in the deck (same front and back) and repeats within the paste.
  const bulkPlan = useMemo(() => planBulkAdd(bulkLines, existingKeys), [bulkLines, existingKeys])
  const existingFronts = useMemo(() => new Set(cards.map((card) => normalizeFront(card.front)).filter(Boolean)), [cards])

  if (!state.loaded) return null

  if (!deck) {
    return (
      <div className="space-y-3 rounded-[14px] border border-warm-border bg-card p-8 text-center">
        <p className="text-sm font-semibold text-ink">{t('flashcards.deck.notFound')}</p>
        <Link to="/flashcards" className="text-xs font-semibold text-amber-text hover:underline">
          {t('flashcards.backToDecks')}
        </Link>
      </div>
    )
  }

  const handleAddCard = () => {
    keepGeneratorVisibility()
    const [card] = addCards(deck.id, [{ front: '', back: '' }])
    setFocusCardId(card.id)
  }

  const handleDeleteCard = (card: Card) => {
    deleteCard(card.id)
    setDeletedCard(card)
  }

  const handleBulkAdd = () => {
    keepGeneratorVisibility()
    const added = addCards(deck.id, bulkPlan.cards)
    setStatus([t('flashcards.bulk.added', { count: added.length }), bulkPlan.duplicates > 0 ? t('flashcards.bulk.duplicatesSkipped', { count: bulkPlan.duplicates }) : ''].filter(Boolean).join(' '))
    setBulkText('')
    setBulkOpen(false)
  }

  const handleGenerated = (generated: { front: string; back: string }[]) => {
    const added = addCards(deck.id, generated)
    setStatus(t('flashcards.bulk.added', { count: added.length }))
    setGeneratorOpen(false)
  }

  // An empty deck opens straight into the generator, where Generate is the screen's primary action.
  const showGenerator = generatorOpen ?? cards.length === 0
  // Adding cards another way keeps the generator where it is instead of hiding it mid-typing.
  const keepGeneratorVisibility = () => setGeneratorOpen((open) => open ?? cards.length === 0)

  const handleExport = () => {
    const blob = new Blob([cardsToCsv(cards.map((card) => ({ front: mathToPlainText(card.front), back: mathToPlainText(card.back) })))], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = csvFilename(deck.name)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus(t('flashcards.csv.tooLarge'))
      return
    }
    const result = analyzeCsv(decodeCsvBytes(await file.arrayBuffer()), existingFronts)
    if (result.error) {
      setCsvPreview(null)
      setStatus(t(`flashcards.csv.errors.${result.error.code}`, { line: result.error.line, max: MAX_IMPORT_CARDS }))
      return
    }
    setStatus('')
    setCsvPreview(result)
  }

  const handleConfirmImport = () => {
    if (!csvPreview) return
    keepGeneratorVisibility()
    addCards(deck.id, csvPreview.cards)
    const parts = [t('flashcards.csv.imported', { count: csvPreview.cards.length })]
    if (csvPreview.duplicates > 0) parts.push(t('flashcards.csv.duplicates', { count: csvPreview.duplicates }))
    if (csvPreview.skipped > 0) parts.push(t('flashcards.csv.skipped', { count: csvPreview.skipped }))
    setStatus(parts.join(' '))
    setCsvPreview(null)
  }

  return (
    <>
      <section data-purpose="page-intro" className="space-y-3">
        <Link to="/flashcards" className="text-xs font-semibold text-amber-text hover:underline">
          ← {t('flashcards.backToDecks')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight break-words text-navy lg:text-3xl">{deck.name || t('flashcards.untitledDeck')}</h1>
            <p className="text-sm text-muted">{[t('flashcards.list.cards', { count: cards.length }), ...(dueCount > 0 ? [t('flashcards.list.dueToday', { count: dueCount })] : [])].join(' · ')}</p>
          </div>
          {cards.length === 0 ? (
            <span aria-disabled="true" title={t('flashcards.list.studyEmpty')} className="cursor-not-allowed rounded-xl border border-warm-border px-5 py-2.5 text-sm font-bold text-muted opacity-60">
              {t('flashcards.list.study', { count: 0 })}
            </span>
          ) : (
            <Link
              to={`/flashcards/${deck.id}/study`}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold ${dueCount > 0 ? 'border-2 border-navy text-navy hover:bg-navy/5' : 'border border-warm-border text-ink hover:border-focus-neutral'}`}
            >
              {t('flashcards.list.study', { count: dueCount })}
            </Link>
          )}
        </div>
      </section>

      <StorageNote state={state} />

      <section data-purpose="deck-settings" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('flashcards.editor.nameLabel')}</span>
          <AutosaveField
            key={`name-${deck.id}`}
            inputRef={nameRef}
            value={deck.name}
            onCommit={(name) => updateDeck(deck.id, { name })}
            label={t('flashcards.editor.nameLabel')}
            maxLength={MAX_DECK_NAME_CHARS}
            placeholder={t('flashcards.untitledDeck')}
            dataPurpose="deck-name"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('flashcards.editor.descriptionLabel')}</span>
          <AutosaveField
            key={`description-${deck.id}`}
            value={deck.description}
            onCommit={(description) => updateDeck(deck.id, { description })}
            label={t('flashcards.editor.descriptionLabel')}
            maxLength={MAX_DECK_DESCRIPTION_CHARS}
            dataPurpose="deck-description"
          />
        </label>
        <div className="max-w-xs space-y-1">
          <span id="new-per-day-label" className="text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('flashcards.editor.newPerDay')}
          </span>
          <Select
            id="new-per-day"
            value={String(deck.newPerDay)}
            options={NEW_PER_DAY_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
            onChange={(value) => updateDeck(deck.id, { newPerDay: Number(value) })}
            labelledBy="new-per-day-label"
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {cards.length > 0 && (
          <button type="button" onClick={() => setGeneratorOpen(!showGenerator)} aria-expanded={showGenerator} className={outlineButton}>
            {t('flashcards.generate.title')}
          </button>
        )}
        <button type="button" onClick={() => setBulkOpen((open) => !open)} aria-expanded={bulkOpen} className={outlineButton}>
          {t('flashcards.bulk.open')}
        </button>
        <button type="button" onClick={handleExport} disabled={cards.length === 0} className={`${outlineButton} disabled:opacity-50`}>
          <DownloadIcon className="h-3.5 w-3.5" />
          {t('flashcards.csv.export')}
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className={outlineButton}>
          {t('flashcards.csv.import')}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => void handleImport(event)} className="sr-only" tabIndex={-1} aria-hidden data-purpose="csv-input" />
        <button type="button" onClick={() => setConfirm('reset')} disabled={cards.length === 0} className={`${outlineButton} disabled:opacity-50`}>
          {t('flashcards.deck.reset')}
        </button>
        <button
          type="button"
          onClick={() => setConfirm('delete')}
          className="flex items-center gap-1.5 rounded-xl border border-warm-border px-3 py-2 text-xs font-semibold text-error hover:border-error/50 sm:ml-auto"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          {t('flashcards.deck.delete')}
        </button>
      </div>

      <p role="status" className={status ? 'text-xs font-semibold text-success' : 'sr-only'}>
        {status}
      </p>

      {csvPreview && (
        <section data-purpose="csv-preview" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5">
          <p className="text-sm font-semibold text-ink">{t('flashcards.csv.previewTitle', { count: csvPreview.cards.length })}</p>
          {(csvPreview.duplicates > 0 || csvPreview.skipped > 0 || csvPreview.extraColumns > 0) && (
            <p className="text-xs text-muted">
              {[
                csvPreview.duplicates > 0 ? t('flashcards.csv.duplicates', { count: csvPreview.duplicates }) : '',
                csvPreview.skipped > 0 ? t('flashcards.csv.skipped', { count: csvPreview.skipped }) : '',
                csvPreview.extraColumns > 0 ? t('flashcards.csv.extraColumns', { count: csvPreview.extraColumns }) : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          )}
          {csvPreview.cards.length > 0 && (
            <ul data-purpose="csv-preview-list" aria-label={t('flashcards.bulk.preview')} className="max-h-64 divide-y divide-warm-border overflow-y-auto rounded-xl border border-warm-border">
              {csvPreview.cards.map((entry, index) => (
                <li key={index} className="grid gap-1 px-3 py-2 text-xs text-ink sm:grid-cols-2">
                  <span dir="auto" className="break-words"><MathText text={entry.front} /></span>
                  <span dir="auto" className="break-words text-muted"><MathText text={entry.back} /></span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={csvPreview.cards.length === 0}
              className="rounded-xl border-2 border-navy px-4 py-2 text-xs font-bold text-navy hover:bg-navy/5 disabled:opacity-50"
            >
              {t('flashcards.bulk.add', { count: csvPreview.cards.length })}
            </button>
            <button type="button" onClick={() => setCsvPreview(null)} className={outlineButton}>
              {t('flashcards.common.cancel')}
            </button>
          </div>
        </section>
      )}

      {showGenerator && <CardGeneratorPanel key={deck.id} deckFronts={cards.map((card) => card.front)} emphasis={cards.length === 0 ? 'primary' : 'secondary'} onAdd={handleGenerated} />}

      {bulkOpen && (
        <section data-purpose="bulk-add" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-ink">{t('flashcards.bulk.title')}</span>
            <span className="block text-xs text-muted">{t('flashcards.bulk.help')}</span>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={5}
              data-purpose="bulk-input"
              className="w-full resize-y rounded-xl border border-warm-border bg-paper px-3 py-2 font-mono text-sm text-ink hover:border-focus-neutral"
            />
          </label>
          {bulkLines.length > 0 && (
            <ul data-purpose="bulk-preview" aria-label={t('flashcards.bulk.preview')} className="max-h-64 divide-y divide-warm-border overflow-y-auto rounded-xl border border-warm-border">
              {bulkLines.map((line, index) => {
                const key = cardKey(line.front, line.back)
                const earlier = (match: (other: (typeof bulkLines)[number]) => boolean) => bulkLines.some((other, otherIndex) => otherIndex < index && other.error === null && match(other))
                const skipped = line.error === null && (existingKeys.has(key) || earlier((other) => cardKey(other.front, other.back) === key))
                // Same front with a different back is allowed (a second meaning) but flagged.
                const sameFront = line.error === null && !skipped && (existingFronts.has(normalizeFront(line.front)) || earlier((other) => normalizeFront(other.front) === normalizeFront(line.front)))
                return (
                  <li
                    key={line.line}
                    data-purpose="bulk-line"
                    data-valid={line.error === null}
                    className={`grid gap-1 px-3 py-2 text-xs sm:grid-cols-[3rem_1fr_1fr] ${line.error ? 'bg-error/5 text-error' : 'text-ink'}`}
                  >
                    <span className="text-muted">{t('flashcards.bulk.line', { number: line.line })}</span>
                    {line.error ? (
                      <span className="sm:col-span-2">
                        <span className="font-semibold">{t(`flashcards.bulk.errors.${line.error}`)}</span> <span className="break-all">{line.raw}</span>
                      </span>
                    ) : (
                      <>
                        <span dir="auto" className="break-words"><MathText text={line.front} /></span>
                        <span className="break-words text-muted">
                          <MathText text={line.back} />
                          {skipped && <span className="ml-2 font-semibold text-amber-text">{t('flashcards.bulk.alreadyHere')}</span>}
                          {sameFront && <span className="ml-2 font-semibold text-amber-text">{t('flashcards.editor.duplicate')}</span>}
                        </span>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBulkAdd}
              disabled={bulkPlan.cards.length === 0}
              className="rounded-xl border-2 border-navy px-4 py-2 text-xs font-bold text-navy hover:bg-navy/5 disabled:opacity-50"
            >
              {t('flashcards.bulk.add', { count: bulkPlan.cards.length })}
            </button>
            {bulkPlan.duplicates > 0 && (
              <span data-purpose="bulk-duplicates" className="self-center text-xs text-muted">
                {t('flashcards.bulk.duplicatesSkipped', { count: bulkPlan.duplicates })}
              </span>
            )}
            <button type="button" onClick={() => setBulkOpen(false)} className={outlineButton}>
              {t('flashcards.common.cancel')}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-semibold text-navy">{t('flashcards.editor.cardsHeading', { count: cards.length })}</h2>
          <button type="button" onClick={handleAddCard} className={outlineButton}>
            <PlusIcon className="h-3.5 w-3.5" />
            {t('flashcards.editor.addCard')}
          </button>
        </div>
        {cards.length === 0 ? (
          <p className="rounded-[14px] border border-warm-border bg-card p-6 text-center text-sm text-muted">{t('flashcards.editor.noCards')}</p>
        ) : (
          <ul data-purpose="card-list" className="divide-y divide-warm-border rounded-[14px] border border-warm-border bg-card">
            {cards.map((card, index) => (
              <CardRow key={card.id} card={card} index={index} duplicate={duplicates.has(card.id)} autoFocus={card.id === focusCardId} onDelete={handleDeleteCard} />
            ))}
          </ul>
        )}
      </section>

      {confirm === 'delete' && (
        <ConfirmDialog
          title={t('flashcards.deck.deleteTitle')}
          body={t('flashcards.deck.deleteBody', { name: deck.name || t('flashcards.untitledDeck'), count: cards.length })}
          confirmLabel={t('flashcards.deck.delete')}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            navigate('/flashcards')
            deleteDeck(deck.id)
          }}
        />
      )}
      {confirm === 'reset' && (
        <ConfirmDialog
          title={t('flashcards.deck.resetTitle')}
          body={t('flashcards.deck.resetBody')}
          confirmLabel={t('flashcards.deck.reset')}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            resetDeckProgress(deck.id)
            setStatus(t('flashcards.deck.resetDone'))
          }}
        />
      )}
      {deletedCard && (
        <UndoToast
          key={deletedCard.id}
          message={t('flashcards.editor.cardDeleted')}
          onUndo={() => {
            restoreCard(deletedCard)
            setDeletedCard(null)
          }}
          onDismiss={() => setDeletedCard(null)}
        />
      )}
    </>
  )
}
