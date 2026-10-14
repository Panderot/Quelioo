import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Console noise that is not an app error (the same list as tests/e2e/fixtures.ts; extend only for a confirmed harmless message). */
const IGNORED_CONSOLE: RegExp[] = [
  /Failed to load resource: /,
  /can.t establish a connection to the server at ws:\/\/localhost:\d+\/\?token=.*@vite\/client/,
  /^\[vite\] failed to connect to websocket/,
  /^Failed to send error to Vite server/,
]

export interface Allowance {
  /** Matches the request URL. */
  url: RegExp
  /** Allowed statuses; omitted = any 4xx/5xx for that URL. */
  status?: number[]
}

export interface StrictPage {
  /** Declares that a 4xx/5xx for `url` is expected in this test (a deliberate error path). */
  allow: (url: RegExp, status?: number | number[]) => void
  /** Console messages that are expected in this test (a deliberate error path). */
  allowConsole: (pattern: RegExp) => void
  /** Stops checking (for the rest of the test) — only for a test whose point is a crashing page. */
  finish: () => void
}

/** Collects console errors, uncaught page errors and 4xx/5xx responses of the app origin and the API; call `check()` after the test body. */
export function watchPage(page: Page, appOrigins: string[]): { handle: StrictPage; check: () => void } {
  const problems: string[] = []
  const allowances: Allowance[] = []
  const consoleAllowed: RegExp[] = []
  let done = false

  page.on('console', (message) => {
    if (done || message.type() !== 'error') return
    const text = message.text()
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text)) || consoleAllowed.some((pattern) => pattern.test(text))) return
    problems.push(`console: ${text}`)
  })
  page.on('pageerror', (error) => {
    if (!done) problems.push(`pageerror: ${error.message}`)
  })
  page.on('response', (response) => {
    if (done) return
    const status = response.status()
    if (status < 400) return
    const url = response.url()
    if (!appOrigins.some((origin) => url.startsWith(origin))) return
    if (allowances.some((allowance) => allowance.url.test(url) && (!allowance.status || allowance.status.includes(status)))) return
    problems.push(`${status} ${response.request().method()} ${url}`)
  })

  return {
    handle: {
      allow: (url, status) => allowances.push({ url, status: status === undefined ? undefined : Array.isArray(status) ? status : [status] }),
      allowConsole: (pattern) => consoleAllowed.push(pattern),
      finish: () => {
        done = true
      },
    },
    check: () => expect(problems, `console errors, page errors or unexpected 4xx/5xx requests:\n${problems.join('\n')}`).toEqual([]),
  }
}
