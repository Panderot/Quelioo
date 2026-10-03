import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useNow } from '../hooks/useNow'
import { cardsForDeck, updateCard, useFlashcards } from '../lib/flashcardStorage'
import type { Card, Deck } from '../lib/flashcardStorage'
import {
  answerCurrent,
  buildStudyQueue,
  currentCardId,
  gradeCard,
  isSessionDone,
  isStudyable,
  nextDueAt,
  startOfLocalDay,
  startSession,
  summarizeSession,
} from '../lib/srs'
import type { SessionState } from '../lib/srs'
import MathText from '../components/MathText'
import { mathToPlainText } from '../lib/mathPlain'
import ProgressRing from '../components/flashcards/ProgressRing'
import StorageNote from '../components/flashcards/StorageNote'

type StudyMode = 'study' | 'practice'

/** Horizontal travel that counts as a swipe; far beyond the tap slop, so a swipe never also clicks. */
const SWIPE_MIN_PX = 60

function formatNextDue(t: TFunction, next: number | null, now: number): string {
  if (next === null) return t('flashcards.when.none')
  const days = Math.round((startOfLocalDay(next) - startOfLocalDay(now)) / 86_400_000)
  if (days <= 0) return t('flashcards.when.today')
  if (days === 1) return t('flashcards.when.tomorrow')
  return t('flashcards.when.inDays', { count: days })
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

const Kbd = ({ children }: { children: string }) => (
  <kbd aria-hidden className="rounded border border-warm-border bg-paper px-1.5 py-0.5 font-sans text-[10px] font-bold text-muted pointer-coarse:hidden">{children}</kbd>
)

interface SessionProps {
  deck: Deck
  cards: Card[]
  now: number
  mode: StudyMode
  onRestart: (mode: StudyMode) => void
}

function StudySession({ deck, cards, now, mode, onRestart }: SessionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionState>(() =>
    startSession((mode === 'study' ? buildStudyQueue(cards, now, deck.newPerDay) : cards.filter(isStudyable)).map((card) => card.id)),
  )
  // Content as it was when the session started, in case a card disappears mid-session.
  const [snapshot] = useState(() => new Map(cards.map((card) => [card.id, card])))
  const [flipped, setFlipped] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [dragX, setDragX] = useState(0)
  const cardRef = useRef<HTMLButtonElement>(null)
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null)

  const currentId = currentCardId(session)
  const current = currentId ? (cards.find((card) => card.id === currentId) ?? snapshot.get(currentId) ?? null) : null
  const done = isSessionDone(session)

  const flip = () => {
    if (!current) return
    const next = !flipped
    setFlipped(next)
    if (next && announcement === '') setAnnouncement(t('flashcards.study.answerAnnouncement', { answer: mathToPlainText(current.back) }))
  }

  const answer = (known: boolean) => {
    if (!current || !flipped) return
    if (mode === 'study') {
      const live = cards.find((card) => card.id === current.id)
      if (live) updateCard(live.id, gradeCard(live, known, Date.now()))
    }
    setSession((state) => answerCurrent(state, known))
    setFlipped(false)
    setAnnouncement('')
    setDragX(0)
    // The card button stays mounted between cards, so focus can move right away (no frame delay
    // during which a fast Enter/Space would land on <body>).
    cardRef.current?.focus({ preventScroll: true })
  }

  const exit = () => navigate(`/flashcards/${deck.id}`)

  // Re-subscribed on every commit, before paint, so a key pressed right after a flip never meets
  // a handler that still sees the previous card state.
  useLayoutEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      if (event.key === 'Escape') {
        exit()
        return
      }
      if (done) return
      if (event.key === ' ') {
        // On a focused button Space already activates it (the card flips via its own click).
        if (event.target instanceof HTMLButtonElement) return
        event.preventDefault()
        flip()
      } else if (event.key === 'ArrowRight' || event.key === '2') {
        if (flipped) answer(true)
      } else if (event.key === 'ArrowLeft' || event.key === '1') {
        if (flipped) answer(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const handlePointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse') return
    pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }

  const handlePointerMove = (event: ReactPointerEvent) => {
    const start = pointerStart.current
    if (!start || start.id !== event.pointerId || !flipped) return
    const dx = event.clientX - start.x
    if (Math.abs(dx) > Math.abs(event.clientY - start.y)) setDragX(dx)
  }

  const handlePointerEnd = (event: ReactPointerEvent) => {
    const start = pointerStart.current
    pointerStart.current = null
    setDragX(0)
    if (!start || start.id !== event.pointerId || !flipped || event.type === 'pointercancel') return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) answer(dx > 0)
  }

  const handleCardKeyDown = (event: ReactKeyboardEvent) => {
    // Arrow keys on the focused card must not scroll the page.
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault()
  }

  // The queue is fixed when the session starts: an empty one means nothing is due (never "show all").
  if (session.queue.length === 0) {
    const studyable = cards.filter(isStudyable)
    return (
      <section data-purpose="all-done" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-8 text-center">
        {studyable.length === 0 ? (
          <>
            <p className="text-sm font-semibold text-ink">{t('flashcards.study.emptyDeck')}</p>
            <Link to={`/flashcards/${deck.id}`} className="inline-block rounded-xl border-2 border-navy px-4 py-2 text-xs font-bold text-navy hover:bg-navy/5">
              {t('flashcards.list.edit')}
            </Link>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">{t('flashcards.study.allDone')}</h2>
            <p data-purpose="next-due" className="text-sm text-muted">
              {t('flashcards.when.next', { when: formatNextDue(t, nextDueAt(cards, now, deck.newPerDay), now) })}
            </p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={() => onRestart('practice')} className="rounded-xl border-2 border-navy px-5 py-2.5 text-sm font-bold text-navy hover:bg-navy/5">
                {t('flashcards.study.practiceAnyway')}
              </button>
              <Link to="/flashcards" className="rounded-xl border border-warm-border px-5 py-2.5 text-sm font-semibold text-ink hover:border-focus-neutral">
                {t('flashcards.backToDecks')}
              </Link>
            </div>
            <p className="text-xs text-muted">{t('flashcards.study.practiceNote')}</p>
          </>
        )}
      </section>
    )
  }

  if (done) {
    const summary = summarizeSession(session)
    const dueNow = buildStudyQueue(cards, now, deck.newPerDay).length > 0
    return (
      <section data-purpose="study-summary" className="space-y-5 rounded-[14px] border border-warm-border bg-card p-6 text-center">
        <h2 className="font-serif text-xl font-semibold text-navy">{t('flashcards.summary.title')}</h2>
        <div className="flex justify-center">
          <ProgressRing
            size={112}
            value={summary.known}
            total={summary.total}
            center={`${summary.known}/${summary.total}`}
            label={t('flashcards.summary.ringLabel', { known: summary.known, total: summary.total })}
          />
        </div>
        <p className="text-sm text-ink">{t('flashcards.summary.known', { known: summary.known, total: summary.total })}</p>
        {summary.toRepeat.length > 0 && (
          <div className="mx-auto max-w-md space-y-2 text-left">
            <p className="text-xs font-bold tracking-wide text-muted uppercase">{t('flashcards.summary.toRepeat', { count: summary.toRepeat.length })}</p>
            <ul data-purpose="summary-repeat" className="space-y-1">
              {summary.toRepeat.map((id) => (
                <li key={id} className="rounded-lg border border-warm-border bg-paper px-3 py-2 text-sm text-ink">
                  <MathText text={(cards.find((card) => card.id === id) ?? snapshot.get(id))?.front ?? ''} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <p data-purpose="next-due" className="text-xs text-muted">
          {dueNow ? t('flashcards.when.dueNow') : t('flashcards.when.next', { when: formatNextDue(t, nextDueAt(cards, now, deck.newPerDay), now) })}
        </p>
        {mode === 'practice' && <p className="text-xs text-muted">{t('flashcards.study.practiceNote')}</p>}
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          {dueNow && (
            <button type="button" onClick={() => onRestart('study')} className="rounded-xl bg-amber px-5 py-2.5 text-sm font-bold text-navy hover:bg-amber-hover">
              {t('flashcards.summary.studyAgain')}
            </button>
          )}
          <Link to="/flashcards" className="rounded-xl border border-warm-border px-5 py-2.5 text-sm font-semibold text-ink hover:border-focus-neutral">
            {t('flashcards.backToDecks')}
          </Link>
        </div>
      </section>
    )
  }

  if (!current) return null
  const position = session.position
  const total = session.queue.length

  return (
    <section data-purpose="study-session" className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p data-purpose="study-progress" className="text-sm font-semibold text-ink">
            {t('flashcards.study.progress', { current: position + 1, total })}
          </p>
          {mode === 'practice' && (
            <span data-purpose="practice-badge" className="rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-bold text-amber-text">
              {t('flashcards.study.practiceBadge')}
            </span>
          )}
        </div>
        <ol data-purpose="progress-dots" aria-hidden className="flex flex-wrap gap-1.5">
          {session.queue.map((id, index) => {
            const answered = session.answers[index]
            const tone =
              index < position ? (answered ? 'bg-success' : 'bg-error') : index === position ? 'bg-amber ring-2 ring-amber/30' : 'bg-warm-border'
            return <li key={`${id}-${index}`} className={`h-2 w-2 rounded-full ${tone}`} />
          })}
        </ol>
      </div>

      <div style={dragX ? { transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)` } : undefined}>
        <button
          ref={cardRef}
          type="button"
          data-purpose="flashcard"
          aria-pressed={flipped}
          onClick={flip}
          onKeyDown={handleCardKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="flashcard-scene block h-[320px] w-full touch-pan-y rounded-2xl text-left select-none md:h-[360px]"
        >
          <span className="flashcard-inner" data-flipped={flipped}>
            <span
              aria-hidden={flipped}
              data-purpose="flashcard-front"
              className="flashcard-face flashcard-front flex flex-col overflow-y-auto rounded-2xl border border-warm-border bg-card p-6"
            >
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('flashcards.study.front')}</span>
              <span className="my-auto block py-4 text-center font-serif text-xl break-words text-navy md:text-2xl">
                <MathText text={current.front} />
              </span>
            </span>
            <span
              aria-hidden={!flipped}
              data-purpose="flashcard-back"
              className="flashcard-face flashcard-back flex flex-col overflow-y-auto rounded-2xl border-2 border-amber/60 bg-card p-6"
            >
              <span className="text-[11px] font-bold tracking-wide text-amber-text uppercase">{t('flashcards.study.back')}</span>
              <span className="my-auto block py-4 text-center text-lg break-words whitespace-pre-line text-ink md:text-xl">
                <MathText text={current.back} />
              </span>
            </span>
          </span>
        </button>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => answer(false)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-warm-border bg-card text-sm font-bold text-error hover:border-error/50"
          >
            {t('flashcards.study.dontKnow')}
            <Kbd>1</Kbd>
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-amber text-sm font-bold text-navy hover:bg-amber-hover"
          >
            {t('flashcards.study.know')}
            <Kbd>2</Kbd>
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">
          <span className="pointer-coarse:hidden">{t('flashcards.study.flipHintKeyboard')}</span>
          <span className="hidden pointer-coarse:inline">{t('flashcards.study.flipHintTouch')}</span>
        </p>
      )}
      <p className="text-center text-[11px] text-muted pointer-coarse:hidden">{t('flashcards.study.shortcuts')}</p>
    </section>
  )
}

export default function FlashcardStudyPage() {
  const { deckId = '' } = useParams()
  const { t } = useTranslation()
  const state = useFlashcards()
  const now = Math.max(useNow(), state.changedAt)
  const deck = state.decks.find((entry) => entry.id === deckId)
  const [run, setRun] = useState<{ mode: StudyMode; key: number }>({ mode: 'study', key: 0 })
  useDocumentTitle(deck ? t('flashcards.study.tabTitle', { name: deck.name || t('flashcards.untitledDeck') }) : t('flashcards.title'))

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

  const cards = cardsForDeck(state.cards, deck.id)
  const restart = (mode: StudyMode) => setRun((current) => ({ mode, key: current.key + 1 }))

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <Link to={`/flashcards/${deck.id}`} className="text-xs font-semibold text-amber-text hover:underline">
          ← {t('flashcards.study.exit')}
        </Link>
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight break-words text-navy lg:text-3xl">{deck.name || t('flashcards.untitledDeck')}</h1>
      </section>

      <StorageNote state={state} />

      <StudySession key={run.key} deck={deck} cards={cards} now={now} mode={run.mode} onRestart={restart} />
    </>
  )
}
