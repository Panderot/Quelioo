import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { expect, test } from '@playwright/test'

import { testEnv } from './env'
import { admin, cleanupTestUsers, createTestUser } from './helpers'

// Every AI endpoint needs a valid account token: without one the answer is 401 and no provider is
// called. Authenticated calls are rate limited per account and logged in usage_events.

const AI_ENDPOINTS = [
  '/api/generate',
  '/api/grade',
  '/api/extract-url',
  '/api/solve',
  '/api/similar',
  '/api/another-way',
  '/api/check-work',
  '/api/explain-step',
  '/api/cards',
  '/api/song-lyrics',
  '/api/song',
  '/api/lesson',
]

test.afterAll(async () => {
  await cleanupTestUsers()
})

test.describe('401 without an account', () => {
  for (const endpoint of AI_ENDPOINTS) {
    test(`${endpoint} answers 401 with no token and with a bad token`, async ({ request }) => {
      const none = await request.post(endpoint, { data: {} })
      expect(none.status()).toBe(401)
      expect(await none.json()).toEqual({ error: 'unauthorized' })
      const bad = await request.post(endpoint, { data: {}, headers: { authorization: 'Bearer not-a-real-token' } })
      expect(bad.status()).toBe(401)
      const malformed = await request.post(endpoint, { data: {}, headers: { authorization: 'Basic abc' } })
      expect(malformed.status()).toBe(401)
    })
  }

  test('the publishable key is not an account token', async ({ request }) => {
    const response = await request.post('/api/generate', { data: {}, headers: { authorization: `Bearer ${testEnv.publishableKey}` } })
    expect(response.status()).toBe(401)
  })

  test('status checks stay open (GET)', async ({ request }) => {
    const response = await request.get('/api/song')
    expect(response.status()).not.toBe(401)
  })
})

test.describe('with an account', () => {
  test('a valid token reaches the handler (a bad body is a 400, not a 401)', async ({ request }) => {
    const user = await createTestUser('api')
    const response = await request.post('/api/grade', { data: {}, headers: { authorization: `Bearer ${user.accessToken}` } })
    expect([400, 413]).toContain(response.status())
  })

  test('the account endpoint needs a token too', async ({ request }) => {
    const response = await request.post('/api/account', { data: { action: 'export' } })
    expect(response.status()).toBe(401)
  })

  test('requests are limited per account with a rate_limited answer', async ({ request }) => {
    const user = await createTestUser('rate')
    const other = await createTestUser('rate-other')
    const statuses: number[] = []
    for (let index = 0; index < 24; index += 1) {
      const response = await request.post('/api/grade', { data: {}, headers: { authorization: `Bearer ${user.accessToken}` } })
      statuses.push(response.status())
      if (response.status() === 429) expect(await response.json()).toEqual({ error: 'rate_limited' })
    }
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(1)
    expect(statuses.slice(0, 20).every((status) => status !== 429)).toBe(true)
    // Another account is not affected.
    const fine = await request.post('/api/grade', { data: {}, headers: { authorization: `Bearer ${other.accessToken}` } })
    expect(fine.status()).not.toBe(429)
  })
})

test.describe('usage log', () => {
  test('provider usage is written to usage_events with tokens and cost', async () => {
    process.env.VITE_SUPABASE_URL = testEnv.url
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = testEnv.publishableKey
    process.env.SUPABASE_SECRET_KEY = testEnv.secretKey
    const { withAuth } = await import('../../api/_lib/with-auth')
    const { recordLlmUsage, recordUsage } = await import('../../api/_lib/usage')

    const server = createServer(
      withAuth(async (_req, res) => {
        recordLlmUsage('openai', { model: 'gpt-5.6-luna', inputTokens: 1000, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 500 })
        recordUsage({ feature: 'lesson-speak', provider: 'openai', model: 'tts', inputTokens: 40, outputTokens: 900, costUsd: 0.011 })
        res.statusCode = 200
        res.end('{}')
      }),
    )
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as AddressInfo).port
    try {
      const user = await createTestUser('usage')
      const unauthorized = await fetch(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', body: '{}' })
      expect(unauthorized.status).toBe(401)
      const response = await fetch(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', body: '{}', headers: { authorization: `Bearer ${user.accessToken}` } })
      expect(response.status).toBe(200)
      const { data } = await admin.from('usage_events').select('*').eq('user_id', user.id).order('id')
      expect(data).toHaveLength(2)
      expect(data?.[0]).toMatchObject({ feature: 'generate', provider: 'openai', model: 'gpt-5.6-luna', input_tokens: 1000, output_tokens: 500 })
      // 1000 input at $0.2/M + 500 output at $1.2/M = $0.0008
      expect(Number(data?.[0].cost_usd)).toBeCloseTo(0.0008, 6)
      expect(data?.[1]).toMatchObject({ feature: 'lesson-speak', model: 'tts', input_tokens: 40, output_tokens: 900 })
      expect(Number(data?.[1].cost_usd)).toBeCloseTo(0.011, 6)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
