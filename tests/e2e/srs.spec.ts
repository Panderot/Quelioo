import { expect, test } from '@playwright/test'

import {
  BOX_INTERVAL_DAYS,
  MAX_REQUEUES_PER_SESSION,
  addLocalDays,
  answerCurrent,
  buildStudyQueue,
  currentCardId,
  gradeCard,
  isSessionDone,
  newIntroducedToday,
  nextDueAt,
  startOfLocalDay,
  startSession,
  summarizeSession,
} from '../../src/lib/srs'
import type { LeitnerBox, SrsCard } from '../../src/lib/srs'
import { cardsToCsv, csvToCards, duplicateFrontIds, parseBulkLines, parseCsvRows } from '../../src/lib/flashcardText'

// Pure unit tests (no browser). Times are local: 2026-03-10 14:00 in the runner's time zone.
const NOW = new Date(2026, 2, 10, 14, 0, 0).getTime()
const HOUR = 3_600_000

function card(id: string, patch: Partial<SrsCard> = {}): SrsCard {
  return { id, front: `front ${id}`, back: `back ${id}`, box: 1, due: NOW - HOUR, lapses: 0, reviews: 0, lastReviewedAt: null, introducedAt: null, createdAt: NOW - 10 * HOUR, ...patch }
}

test.describe('srs: grading', () => {
  test('intervals per box are 0, 1, 3, 7, 16 days', () => {
    expect(BOX_INTERVAL_DAYS).toEqual({ 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 })
  })

  test('Know moves one box up and schedules the new box interval at local midnight', () => {
    for (const box of [1, 2, 3, 4] as LeitnerBox[]) {
      const next = gradeCard(card('a', { box, reviews: 1 }), true, NOW)
      const newBox = (box + 1) as LeitnerBox
      expect(next.box).toBe(newBox)
      expect(next.due).toBe(addLocalDays(NOW, BOX_INTERVAL_DAYS[newBox]))
      expect(new Date(next.due).getHours()).toBe(0)
      expect(next.reviews).toBe(2)
      expect(next.lastReviewedAt).toBe(NOW)
    }
  })

  test('Know in box 5 stays in box 5 (16 days)', () => {
    const next = gradeCard(card('a', { box: 5, reviews: 9 }), true, NOW)
    expect(next.box).toBe(5)
    expect(next.due).toBe(addLocalDays(NOW, 16))
  })

  test("Don't know resets to box 1, adds a lapse and is due right away", () => {
    const next = gradeCard(card('a', { box: 4, lapses: 2, reviews: 5 }), false, NOW)
    expect(next).toMatchObject({ box: 1, due: NOW, lapses: 3, reviews: 6, lastReviewedAt: NOW })
  })

  test('the first grade stamps introducedAt; later grades keep it', () => {
    const first = gradeCard(card('a'), true, NOW)
    expect(first.introducedAt).toBe(NOW)
    const later = gradeCard(card('a', { ...first }), false, NOW + HOUR)
    expect(later.introducedAt).toBe(NOW)
  })
})

test.describe('srs: due selection', () => {
  test('due reviews come first (oldest due first), then new cards (oldest first)', () => {
    const cards = [
      card('new-late', { createdAt: NOW - HOUR }),
      card('review-recent', { reviews: 2, box: 2, due: NOW - HOUR }),
      card('new-early', { createdAt: NOW - 5 * HOUR }),
      card('review-old', { reviews: 3, box: 3, due: NOW - 48 * HOUR }),
      card('future', { reviews: 1, box: 2, due: NOW + HOUR }),
    ]
    expect(buildStudyQueue(cards, NOW, 20).map((entry) => entry.id)).toEqual(['review-old', 'review-recent', 'new-early', 'new-late'])
  })

  test('nothing due gives an empty queue, never the whole deck', () => {
    const cards = [card('a', { reviews: 1, box: 2, due: NOW + HOUR }), card('b', { reviews: 4, box: 5, due: NOW + 100 * HOUR })]
    expect(buildStudyQueue(cards, NOW, 20)).toEqual([])
  })

  test('cards with an empty side are never studied', () => {
    expect(buildStudyQueue([card('a', { back: '  ' }), card('b', { front: '' })], NOW, 20)).toEqual([])
  })

  test('daily new-card limit counts cards introduced since local midnight', () => {
    const fresh = Array.from({ length: 30 }, (_, index) => card(`n${index}`, { createdAt: NOW - HOUR + index }))
    expect(buildStudyQueue(fresh, NOW, 20)).toHaveLength(20)

    const introducedToday = Array.from({ length: 15 }, (_, index) =>
      card(`t${index}`, { reviews: 1, box: 2, due: NOW + 24 * HOUR, introducedAt: startOfLocalDay(NOW) + index }),
    )
    const introducedYesterday = card('y', { reviews: 1, box: 2, due: NOW + 24 * HOUR, introducedAt: startOfLocalDay(NOW) - 1 })
    const all = [...fresh, ...introducedToday, introducedYesterday]
    expect(newIntroducedToday(all, NOW)).toBe(15)
    expect(buildStudyQueue(all, NOW, 20)).toHaveLength(5)
    expect(buildStudyQueue(all, NOW, 10)).toHaveLength(0)
  })

  test('local-day boundary: 23:59 is still today, 00:00 starts a new day', () => {
    const lateEvening = new Date(2026, 2, 10, 23, 59).getTime()
    const midnight = new Date(2026, 2, 11, 0, 0).getTime()
    const introduced = card('i', { reviews: 1, box: 2, due: midnight, introducedAt: new Date(2026, 2, 10, 9, 0).getTime() })
    const waiting = card('w', { createdAt: NOW - HOUR })
    expect(buildStudyQueue([introduced, waiting], lateEvening, 1).map((entry) => entry.id)).toEqual([])
    expect(buildStudyQueue([introduced, waiting], midnight, 1).map((entry) => entry.id)).toEqual(['i', 'w'])
    // A box-2 card graded late in the evening is due at the next local midnight, not 24h later.
    expect(gradeCard(card('x'), true, lateEvening).due).toBe(midnight)
  })

  test('next due time is the earliest future review, or the next midnight when only the new limit blocks', () => {
    const cards = [card('a', { reviews: 1, box: 3, due: addLocalDays(NOW, 3) }), card('b', { reviews: 1, box: 2, due: addLocalDays(NOW, 1) })]
    expect(nextDueAt(cards, NOW, 20)).toBe(addLocalDays(NOW, 1))
    const blocked = [card('n'), card('t', { reviews: 1, box: 2, due: addLocalDays(NOW, 5), introducedAt: NOW - HOUR })]
    expect(buildStudyQueue(blocked, NOW, 1)).toEqual([])
    expect(nextDueAt(blocked, NOW, 1)).toBe(addLocalDays(NOW, 1))
    expect(nextDueAt([], NOW, 20)).toBeNull()
  })
})

test.describe('srs: session', () => {
  test("Don't know re-queues the card at the end, at most 3 times per session", () => {
    let state = startSession(['a', 'b'])
    state = answerCurrent(state, false)
    expect(state.queue).toEqual(['a', 'b', 'a'])
    state = answerCurrent(state, true)
    for (let i = 0; i < MAX_REQUEUES_PER_SESSION; i++) {
      expect(currentCardId(state)).toBe('a')
      state = answerCurrent(state, false)
    }
    expect(isSessionDone(state)).toBe(true)
    expect(state.queue.filter((id) => id === 'a')).toHaveLength(1 + MAX_REQUEUES_PER_SESSION)
    expect(summarizeSession(state)).toEqual({ total: 2, known: 1, toRepeat: ['a'] })
  })

  test('a card known after a miss counts as known in the summary', () => {
    let state = startSession(['a'])
    state = answerCurrent(state, false)
    state = answerCurrent(state, true)
    expect(isSessionDone(state)).toBe(true)
    expect(summarizeSession(state)).toEqual({ total: 1, known: 1, toRepeat: [] })
    expect(state.answers).toEqual([false, true])
  })

  test('practice never schedules: the session reducer alone changes no card', () => {
    const before = card('a', { box: 3, reviews: 4, due: NOW + 24 * HOUR })
    const snapshot = { ...before }
    let state = startSession([before.id])
    state = answerCurrent(state, false)
    state = answerCurrent(state, true)
    expect(before).toEqual(snapshot)
  })
})

test.describe('flashcard text formats', () => {
  test('bulk lines: ";" or tab, invalid lines flagged', () => {
    const lines = parseBulkLines('cat ; kedi\ndog\tköpek; dost\n\nno separator here\n ; empty front\n' + 'x'.repeat(301) + ';long')
    expect(lines.map((line) => [line.line, line.front, line.back, line.error])).toEqual([
      [1, 'cat', 'kedi', null],
      [2, 'dog', 'köpek; dost', null],
      [4, 'no separator here', '', 'no_separator'],
      [5, '', 'empty front', 'empty_side'],
      [6, 'x'.repeat(301), 'long', 'too_long'],
    ])
  })

  test('duplicate fronts ignore case and spacing', () => {
    const ids = duplicateFrontIds([
      { id: '1', front: 'Ağrı  Dağı' },
      { id: '2', front: 'ağrı dağı ' },
      { id: '3', front: 'Van' },
      { id: '4', front: '' },
      { id: '5', front: '' },
    ])
    expect([...ids].sort()).toEqual(['1', '2'])
  })

  test('CSV round trip keeps Turkish, Armenian, quotes, commas, semicolons and newlines', () => {
    const cards = [
      { front: 'Şapka Kanunu', back: '25 Kasım 1925' },
      { front: 'Բարեւ', back: 'Merhaba, "selam"; hello' },
      { front: 'çok\nsatırlı', back: 'ığüşöç İĞÜŞÖÇ' },
    ]
    const csv = cardsToCsv(cards)
    expect(csv.startsWith('﻿front,back\r\n')).toBe(true)
    expect(csvToCards(csv)).toEqual({ cards, skipped: 0 })
  })

  test('CSV import: semicolon delimiter, no header, skipped rows counted', () => {
    expect(parseCsvRows('a;"b;c"\r\nd;e')).toEqual([['a', 'b;c'], ['d', 'e']])
    expect(csvToCards('elma,apple\n,missing front\nonly one column\n')).toEqual({ cards: [{ front: 'elma', back: 'apple' }], skipped: 2 })
  })
})
