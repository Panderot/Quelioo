import { expect, test } from '@playwright/test'

import {
  basePoints,
  buildSummary,
  isCorrectAnswer,
  nicknameKey,
  nicknameProblem,
  normalizeCodeInput,
  parseAnswer,
  planLiveQuestions,
  rankPlayers,
  sanitizeSettings,
  scorePlayer,
  streakBonus,
} from '../../src/lib/live/core'
import { sampleQuestions } from './helpers'

// The rules of the game as pure functions: what the server decides, tested without a server.

test('base points fall linearly from 1000 to 500', () => {
  expect(basePoints(0, 20_000)).toBe(1000)
  expect(basePoints(10_000, 20_000)).toBe(750)
  expect(basePoints(20_000, 20_000)).toBe(500)
  expect(basePoints(30_000, 20_000)).toBe(500)
  expect(basePoints(-5, 20_000)).toBe(1000)
})

test('streak bonus: +100 per consecutive correct from the second, capped at +500', () => {
  expect([1, 2, 3, 4, 5, 6, 7, 20].map(streakBonus)).toEqual([0, 100, 200, 300, 400, 500, 500, 500])
})

test('scorePlayer: streak builds, a wrong or missing answer resets it, time is summed', () => {
  const limit = 20_000
  const totals = scorePlayer(
    [
      { questionIndex: 0, correct: true, elapsedMs: 0 },
      { questionIndex: 1, correct: true, elapsedMs: 10_000 },
      { questionIndex: 2, correct: false, elapsedMs: 5_000 },
      // question 3 unanswered
      { questionIndex: 4, correct: true, elapsedMs: 20_000 },
    ],
    [0, 1, 2, 3, 4],
    limit,
  )
  expect(totals.outcomes.map((o) => o.points)).toEqual([1000, 750 + 100, 0, 0, 500])
  expect(totals.score).toBe(1000 + 850 + 500)
  expect(totals.streak).toBe(1)
  expect(totals.correctCount).toBe(3)
  expect(totals.totalTimeMs).toBe(35_000)
})

test('a skipped question (not in the played list) neither breaks nor extends a streak', () => {
  const totals = scorePlayer(
    [
      { questionIndex: 0, correct: true, elapsedMs: 0 },
      { questionIndex: 2, correct: true, elapsedMs: 0 },
    ],
    [0, 2],
    10_000,
  )
  expect(totals.score).toBe(1000 + 1000 + 100)
})

test('ranking: score first, then total answer time, equal in both share a rank', () => {
  const ranked = rankPlayers([
    { id: 'a', nickname: 'A', score: 500, totalTimeMs: 9000 },
    { id: 'b', nickname: 'B', score: 500, totalTimeMs: 4000 },
    { id: 'c', nickname: 'C', score: 900, totalTimeMs: 20000 },
    { id: 'd', nickname: 'D', score: 500, totalTimeMs: 4000 },
  ])
  expect(ranked.map((p) => [p.nickname, p.rank])).toEqual([
    ['C', 1],
    ['B', 2],
    ['D', 2],
    ['A', 4],
  ])
})

test('answers: exact sets only, no partial credit, junk refused', () => {
  const multi = { kind: 'multi' as const, options: ['a', 'b', 'c', 'd'] }
  const single = { kind: 'single' as const, options: ['a', 'b', 'c'] }
  const tf = { kind: 'truefalse' as const, options: [] }
  expect(isCorrectAnswer([0, 2], [2, 0])).toBe(true)
  expect(isCorrectAnswer([0], [0, 2])).toBe(false)
  expect(isCorrectAnswer([0, 1, 2], [0, 2])).toBe(false)
  expect(parseAnswer([2, 0], multi)).toEqual([0, 2])
  expect(parseAnswer([0, 1], single)).toBeNull()
  expect(parseAnswer([3], single)).toBeNull()
  expect(parseAnswer([1], tf)).toEqual([1])
  expect(parseAnswer([2], tf)).toBeNull()
  expect(parseAnswer([0, 0], multi)).toBeNull()
  expect(parseAnswer([], multi)).toBeNull()
  expect(parseAnswer('1', single)).toBeNull()
  expect(parseAnswer([1.5], single)).toBeNull()
})

test('planLiveQuestions keeps mcq (2-5 options), multi-answer and true/false, skips the rest, keeps option order', () => {
  const questions = sampleQuestions()
  questions.push({ id: 'big', question: 'Six options', explanation: '', type: 'mcq', options: ['1', '2', '3', '4', '5', '6'], answerIndex: 0 })
  questions.push({ id: 'match', question: 'Match', explanation: '', type: 'matching', pairs: [] } as never)
  const plan = planLiveQuestions(questions)
  expect(plan.questions.map((q) => [q.id, q.kind])).toEqual([
    ['q1', 'single'],
    ['q2', 'truefalse'],
    ['q3', 'multi'],
    ['q5', 'truefalse'],
    ['q6', 'single'],
  ])
  expect(plan.questions[0].options).toEqual(['3', '4', '5', '6'])
  expect(plan.questions[2].correct).toEqual([0, 2])
  expect(plan.questions[1].correct).toEqual([0])
  expect(plan.skipped.map((q) => q.id)).toEqual(['q4', 'big', 'match'])
})

test('nicknames: length, characters, offensive words (TR/EN), impersonation, look-alikes', () => {
  expect(nicknameProblem('A')).toBe('too_short')
  expect(nicknameProblem('x'.repeat(17))).toBe('too_long')
  expect(nicknameProblem('<script>')).toBe('invalid_chars')
  expect(nicknameProblem('=cmd')).toBe('invalid_chars')
  expect(nicknameProblem('Ayşe')).toBeNull()
  expect(nicknameProblem('Hızlı Tilki')).toBeNull()
  expect(nicknameProblem('Ali_2010')).toBeNull()
  expect(nicknameProblem('Amina')).toBeNull()
  expect(nicknameProblem('Aqua')).toBeNull()
  for (const fine of ['Player 45', 'As', 'Mert 5', 'Kaan 10', 'Ece 3']) expect(nicknameProblem(fine), fine).toBeNull()
  for (const word of ['siktir', 'S1KT1R', 'oruspu', 'orospu çocuğu', 'fuuuck', 'f.u.c.k', 'SHIT', 'b1tch', 'amk', 'Hitler']) expect(nicknameProblem(word), word).toBe('blocked')
  for (const word of ['Öğretmen', 'ogretmen', 'Admin', 'ADMIN', 'Teacher', 'Quelio', 'Moderator', 'Host', 'öğretmenim']) expect(nicknameProblem(word), word).toBe('reserved')
  expect(nicknameKey('Ayşe')).toBe(nicknameKey('ayse'))
  expect(nicknameKey('Ali')).toBe(nicknameKey('ALİ'))
})

test('codes and settings are clamped', () => {
  expect(normalizeCodeInput('123 456')).toBe('123456')
  expect(normalizeCodeInput('12345')).toBeNull()
  expect(normalizeCodeInput('abcdef')).toBeNull()
  expect(sanitizeSettings({ secondsPerQuestion: 45, maxPlayers: 500, sound: false })).toMatchObject({ secondsPerQuestion: 20, maxPlayers: 100, sound: false, showLeaderboard: true, shuffleQuestions: false })
  expect(sanitizeSettings({ maxPlayers: 0 }).maxPlayers).toBe(1)
  expect(sanitizeSettings(null).maxPlayers).toBe(60)
})

test('summary: success rate per question and the hardest one', () => {
  const plan = planLiveQuestions(sampleQuestions())
  const summary = buildSummary(
    plan.questions,
    [0, 1],
    [{ score: 1000 }, { score: 500 }],
    [
      { questionIndex: 0, answer: [1], correct: true },
      { questionIndex: 0, answer: [0], correct: false },
      { questionIndex: 1, answer: [1], correct: false },
      { questionIndex: 1, answer: [1], correct: false },
    ],
  )
  expect(summary.playerCount).toBe(2)
  expect(summary.averageScore).toBe(750)
  expect(summary.questions.map((q) => q.successRate)).toEqual([0.5, 0])
  expect(summary.questions[0].counts).toEqual([1, 1, 0, 0])
  expect(summary.hardest).toBe(1)
})
