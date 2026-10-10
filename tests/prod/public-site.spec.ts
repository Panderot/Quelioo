import { expect, test } from '@playwright/test'

import type { LiveState } from '../../src/lib/live/core'

// The production bundle must hand out the canonical address, whatever address the teacher opened the app from.

const CANONICAL = 'https://quelio.vercel.app'
const CODE = '893622'

function lobbyState(): LiveState {
  return {
    rev: 1,
    serverNow: Date.now(),
    role: 'host',
    game: {
      id: 'g1',
      code: CODE,
      quizId: 'q1',
      state: 'lobby',
      locked: false,
      paused: false,
      settings: { secondsPerQuestion: 20, showLeaderboard: true, shuffleQuestions: false, sound: false, maxPlayers: 60, lateJoin: true },
      quizTitle: 'Quiz',
      questionCount: 5,
      skippedCount: 0,
      currentIndex: -1,
      deadlineAt: null,
      startedAt: null,
      pausedRemainingMs: null,
      channelKey: 'k',
    },
    question: null,
    counts: { players: 0, answered: 0 },
    reveal: null,
    players: [],
    ranking: null,
    me: null,
  } as unknown as LiveState
}

test('the lobby shows the canonical join address and QR value in a production build', async ({ page }) => {
  await page.route('**/api/live*', (route) => route.fulfill({ json: lobbyState() }))
  await page.goto('/live/g1')
  await expect(page.locator('[data-purpose="live-join-address"]')).toHaveText('quelio.vercel.app/katil')
  await expect(page.locator('[data-purpose="live-qr"]')).toHaveAttribute('data-value', `${CANONICAL}/katil/${CODE}`)
})

test('a deployment-specific vercel.app address moves to the canonical address, keeping path, query and hash', async ({ page }) => {
  const deployment = 'https://quelio-r1mfqxqi5-some-team.vercel.app'
  const seen: string[] = []
  await page.route(/https:\/\/quelio[^/]*\.vercel\.app\/.*/, async (route) => {
    const url = route.request().url()
    seen.push(url)
    if (url.startsWith(deployment)) {
      // Same file from the local preview server (the page itself, its scripts and styles).
      const { pathname, search } = new URL(url)
      await route.fulfill({ response: await route.fetch({ url: `http://localhost:5193${pathname}${search}` }) })
    } else {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>canonical</body></html>' })
    }
  })
  await page.goto(`${deployment}/katil/${CODE}?x=1#h`, { waitUntil: 'commit' }).catch(() => undefined)
  await page.waitForURL(`${CANONICAL}/katil/${CODE}?x=1#h`)
  expect(seen.some((url) => url.startsWith(CANONICAL))).toBe(true)
})
