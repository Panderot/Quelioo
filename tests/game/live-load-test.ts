// Load test for the Live Game against the TEST Supabase project (never production).
// One game, 60 simulated phones, 10 questions: join time, answer latency, and Realtime hints that did not arrive.
//
//   node node_modules/vite/bin/vite.js --port 5192 --strictPort   (with the SUPABASE_TEST_* values as VITE_SUPABASE_* / SUPABASE_SECRET_KEY, see playwright.game.config.ts)
//   npx tsx tests/game/live-load-test.ts [players=60] [questions=10]
//
// The API runs in the local dev server (same code as the Vercel function) and talks to the real test project and its Realtime.
import { createClient } from '@supabase/supabase-js'

import type { Json } from '../../src/lib/database.types'
import type { LiveState } from '../../src/lib/live/core'
import { testEnv } from '../supabase/env'
import { cleanupTestUsers, createTestUser } from '../supabase/helpers'
import { admin } from '../supabase/helpers'

const PLAYERS = Number(process.argv[2]) || 60
const QUESTIONS = Number(process.argv[3]) || 10
const BASE = 'http://localhost:5192'

async function call<T>(action: string, init: { token?: string; player?: string; body?: unknown; query?: Record<string, string>; ip?: string } = {}): Promise<{ status: number; ms: number; body: T }> {
  const url = `${BASE}/api/live?${new URLSearchParams({ action, ...init.query })}`
  const headers: Record<string, string> = { 'x-forwarded-for': init.ip ?? '10.1.1.1' }
  if (init.token) headers.authorization = `Bearer ${init.token}`
  if (init.player) headers['x-live-token'] = init.player
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const started = performance.now()
  const response = await fetch(url, { method: init.body !== undefined ? 'POST' : 'GET', headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined })
  const body = (await response.json()) as T
  return { status: response.status, ms: performance.now() - started, body }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((p / 100) * values.length))] ?? 0
const summary = (label: string, values: number[]) =>
  `${label}: n=${values.length} median=${percentile(values, 50).toFixed(0)}ms p95=${percentile(values, 95).toFixed(0)}ms max=${Math.max(0, ...values).toFixed(0)}ms`

async function main() {
  const teacher = await createTestUser('load')
  const questions = Array.from({ length: QUESTIONS }, (_, i) => ({ id: `q${i}`, question: `Question ${i + 1}: what is ${i} + 1?`, explanation: `It is ${i + 1}.`, type: 'mcq', options: [`${i}`, `${i + 1}`, `${i + 2}`, `${i + 3}`], answerIndex: 1 }))
  const quizId = crypto.randomUUID()
  await admin.from('quizzes').insert({ id: quizId, user_id: teacher.id, title: 'Load test', source: 'text', question_type: 'mcq', difficulty: 'medium', question_count: String(QUESTIONS), quiz: { title: 'Load test', questions } as unknown as Json })

  const created = await call<{ id: string; code: string }>('create', { token: teacher.accessToken, body: { quizId, settings: { secondsPerQuestion: 10, maxPlayers: 100, sound: false } } })
  if (created.status !== 200) throw new Error(`create failed: ${created.status}`)
  const { id, code } = created.body
  const host = await call<LiveState>('host-state', { token: teacher.accessToken, query: { id } })
  const channelKey = host.body.game.channelKey

  // Join: all phones at once, like a class scanning the QR code together.
  const joinTimes: number[] = []
  const players: { token: string; hints: number; latencies: number[] }[] = []
  const joinStart = performance.now()
  await Promise.all(
    Array.from({ length: PLAYERS }, async (_, i) => {
      const result = await call<{ token: string }>('join', { body: { code, nickname: `Player ${i + 1}` }, ip: '10.2.2.2' })
      joinTimes.push(result.ms)
      if (result.status !== 200) throw new Error(`join ${i} failed: ${result.status}`)
      players.push({ token: result.body.token, hints: 0, latencies: [] })
    }),
  )
  const joinTotal = performance.now() - joinStart

  // Realtime: every phone listens to the game's hint channel (the same topic the browser uses).
  const clients = players.map((player) => {
    const client = createClient(testEnv.url, testEnv.publishableKey, { auth: { persistSession: false } })
    const channel = client.channel(`live:${channelKey}`, { config: { broadcast: { self: false } } })
    channel.on('broadcast', { event: 'rev' }, ({ payload }) => {
      if (!(payload as { tick?: boolean }).tick) player.hints += 1
    })
    return { client, channel, ready: new Promise<void>((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve())) }
  })
  await Promise.all(clients.map((entry) => entry.ready))
  console.log(`${PLAYERS} phones joined in ${joinTotal.toFixed(0)}ms and are subscribed to Realtime`)

  const hintLatencies: number[] = []
  let failedAnswers = 0
  await call('command', { token: teacher.accessToken, body: { id, command: 'start' } })
  for (let q = 0; q < QUESTIONS; q += 1) {
    await Promise.all(
      players.map(async (player) => {
        await sleep(100 + Math.random() * 1500)
        const wrong = Math.random() < 0.3
        const result = await call('answer', { player: player.token, body: { index: q, answer: [wrong ? 0 : 1] }, ip: '10.2.2.2' })
        player.latencies.push(result.ms)
        if (result.status !== 200) failedAnswers += 1
      }),
    )
    // Everyone answered, so the server reveals by itself; the board's next call follows a moment later.
    const revealStart = performance.now()
    let state = (await call<LiveState>('host-state', { token: teacher.accessToken, query: { id } })).body
    for (let i = 0; i < 20 && state.game.state !== 'reveal'; i += 1) {
      await sleep(100)
      state = (await call<LiveState>('host-state', { token: teacher.accessToken, query: { id } })).body
    }
    hintLatencies.push(performance.now() - revealStart)
    if (state.game.state !== 'reveal') throw new Error(`question ${q} never revealed`)
    const next = await call<LiveState>('command', { token: teacher.accessToken, body: { id, command: 'next' } })
    if (next.status !== 200) throw new Error(`next failed at ${q}`)
  }
  await sleep(3000)

  const final = (await call<LiveState>('host-state', { token: teacher.accessToken, query: { id } })).body
  const expectedHints = 1 + QUESTIONS * 2 // start + (reveal + next/finish) per question
  const received = players.map((player) => player.hints)
  const answerLatencies = players.flatMap((player) => player.latencies)
  console.log(`game state: ${final.game.state}, ranking rows: ${final.ranking?.length}`)
  console.log(summary('join', joinTimes))
  console.log(summary('answer', answerLatencies))
  console.log(`answers sent: ${answerLatencies.length}, failed: ${failedAnswers}`)
  console.log(summary('reveal after last answer (poll resolution 100ms)', hintLatencies))
  console.log(`Realtime hints per phone: expected ${expectedHints}, min ${Math.min(...received)}, median ${percentile(received, 50)}, max ${Math.max(...received)}; phones missing hints: ${received.filter((count) => count < expectedHints).length}; dropped total: ${received.reduce((sum, count) => sum + Math.max(0, expectedHints - count), 0)}`)

  for (const entry of clients) void entry.client.removeChannel(entry.channel)
  await admin.from('live_games').delete().eq('id', id)
  await cleanupTestUsers()
}

main().then(
  () => process.exit(0),
  async (error) => {
    console.error(error)
    await cleanupTestUsers().catch(() => undefined)
    process.exit(1)
  },
)
