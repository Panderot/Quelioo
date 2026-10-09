import { randomUUID } from 'node:crypto'

import type { BrowserContext, Page } from '@playwright/test'

import type { Json } from '../../src/lib/database.types'
import type { LiveSettings, LiveState } from '../../src/lib/live/core'
import type { GeneratedQuiz, QuizQuestion } from '../../src/lib/quiz'
import { admin, createTestUser, deleteTestUser, signInBrowser } from '../supabase/helpers'
import type { TestUser } from '../supabase/helpers'

export { admin, createTestUser, deleteTestUser, signInBrowser }
export type { TestUser }

export const PORT = 5192
export const BASE = `http://localhost:${PORT}`
export const CRON_SECRET = 'quelio-test-cron-secret'

/** Six quiz questions: three live-playable kinds with a known right answer, one two-answer question, one true/false, and one that live games skip. */
export function sampleQuestions(): QuizQuestion[] {
  const base = (id: string, question: string) => ({ id, question, explanation: `Because ${id}.` })
  return [
    { ...base('q1', 'What is 2 + 2?'), type: 'mcq', options: ['3', '4', '5', '6'], answerIndex: 1 },
    { ...base('q2', 'The capital of France is Paris.'), type: 'true-false', answerBool: true },
    { ...base('q3', 'Which are prime numbers?'), type: 'mcq', options: ['2', '4', '5', '9'], answerIndex: 0, answerIndices: [0, 2] } as QuizQuestion,
    { ...base('q4', 'Name the largest planet.'), type: 'fill-blanks', answer: 'Jupiter' },
    { ...base('q5', 'Water boils at 100 °C at sea level.'), type: 'true-false', answerBool: true },
    { ...base('q6', 'Pick the color of the sky on a clear day.'), type: 'mcq', options: ['Green', 'Blue', 'Red'], answerIndex: 1 },
  ]
}

export async function insertQuiz(user: TestUser, questions: QuizQuestion[] = sampleQuestions(), title = 'Live test quiz'): Promise<string> {
  const id = randomUUID()
  const quiz: GeneratedQuiz = { title, questions }
  const { error } = await admin.from('quizzes').insert({
    id,
    user_id: user.id,
    title,
    source: 'text',
    question_type: 'mixed',
    difficulty: 'medium',
    question_count: String(questions.length),
    quiz: quiz as unknown as Json,
  })
  if (error) throw new Error(`insertQuiz failed: ${error.message}`)
  return id
}

export const fastSettings: Partial<LiveSettings> = { secondsPerQuestion: 10, showLeaderboard: true, shuffleQuestions: false, sound: false, maxPlayers: 60, lateJoin: true }

interface CallOptions {
  token?: string
  playerToken?: string
  ip?: string
  body?: unknown
  method?: 'GET' | 'POST'
}

/** Calls /api/live and returns status + JSON. `ip` stands in for the client address (the dev server trusts x-forwarded-for). */
export async function live<T = Record<string, unknown>>(action: string, query: Record<string, string> = {}, options: CallOptions = {}): Promise<{ status: number; body: T }> {
  const params = new URLSearchParams({ action, ...query })
  const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.playerToken) headers['x-live-token'] = options.playerToken
  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET')
  if (method === 'POST') headers['content-type'] = 'application/json'
  const response = await fetch(`${BASE}/api/live?${params}`, { method, headers, body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined })
  const text = await response.text()
  let body: unknown = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text }
  }
  return { status: response.status, body: body as T }
}

export async function createGame(user: TestUser, quizId: string, settings: Partial<LiveSettings> = fastSettings) {
  const result = await live<{ id: string; code: string; error?: string }>('create', {}, { token: user.accessToken, body: { quizId, settings } })
  return result
}

export async function hostState(user: TestUser, id: string): Promise<LiveState> {
  const result = await live<LiveState>('host-state', { id }, { token: user.accessToken })
  if (result.status !== 200) throw new Error(`host-state ${result.status}`)
  return result.body
}

export async function command(user: TestUser, id: string, name: string, extra: Record<string, unknown> = {}) {
  return live<LiveState & { error?: string }>('command', {}, { token: user.accessToken, body: { id, command: name, ...extra } })
}

export async function joinGame(code: string, nickname: string, extra: { token?: string; ip?: string } = {}) {
  return live<{ token: string; state: LiveState; error?: string }>('join', {}, { body: { code, nickname, token: extra.token }, ip: extra.ip })
}

export async function playerState(playerToken: string) {
  return live<LiveState & { error?: string }>('state', {}, { playerToken })
}

export async function answer(playerToken: string, index: number, option: number[]) {
  return live<{ ok?: boolean; error?: string }>('answer', {}, { playerToken, body: { index, answer: option } })
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Signs the browser context in as the teacher and keeps the page at a desktop board size. */
export async function teacherPage(context: BrowserContext, user: TestUser): Promise<Page> {
  await signInBrowser(context, user)
  return context.newPage()
}

export async function deleteGames(userIds: string[]): Promise<void> {
  for (const id of userIds) await admin.from('live_games').delete().eq('owner_id', id)
}
