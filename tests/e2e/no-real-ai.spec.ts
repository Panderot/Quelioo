import { expect, test } from '@playwright/test'

// The guard in tests/guards/no-real-ai.cjs: a test (or the dev server) that reaches a real AI provider fails loudly.

test.describe('no real AI in tests', () => {
  test.beforeEach(() => {
    // These tests call the blocked hosts on purpose: the guard throws but does not mark the run as failed.
    ;(globalThis as { __EXPECT_REAL_AI_BLOCK?: boolean }).__EXPECT_REAL_AI_BLOCK = true
  })
  test.afterEach(() => {
    ;(globalThis as { __EXPECT_REAL_AI_BLOCK?: boolean }).__EXPECT_REAL_AI_BLOCK = false
  })

  test('fetch to api.openai.com throws a loud error before any request leaves the machine', async () => {
    await expect(fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow('REAL AI BLOCKED')
  })

  test('fetch to api.anthropic.com is blocked too', async () => {
    await expect(fetch(new URL('https://api.anthropic.com/v1/messages'))).rejects.toThrow('REAL AI BLOCKED')
  })

  test('node http(s) requests to the providers are blocked', async () => {
    const https = await import('node:https')
    expect(() => https.request({ hostname: 'api.openai.com', path: '/v1/models' })).toThrow('REAL AI BLOCKED')
    expect(() => https.get('https://api.anthropic.com/v1/models')).toThrow('REAL AI BLOCKED')
  })

  test('other hosts and the local app are not touched by the guard', async ({ request }) => {
    const response = await request.get('/')
    expect(response.ok()).toBe(true)
    await expect(fetch('http://localhost:1/never')).rejects.not.toThrow('REAL AI BLOCKED')
  })
})
