import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Tests never reach a real AI provider: every worker and the dev server preload tests/guards/no-real-ai.cjs,
// and the run fails at the end if anything was blocked.

const LOG = resolve('test-results', 'real-ai-blocked.log')

/** Call once at the top of a Playwright config: workers and the web server inherit the preload. */
export function blockRealAi(): void {
  const preload = '--require ./tests/guards/no-real-ai.cjs'
  if (!(process.env.NODE_OPTIONS ?? '').includes('no-real-ai.cjs')) process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ')
}

export function clearBlockedLog(): void {
  mkdirSync(resolve('test-results'), { recursive: true })
  rmSync(LOG, { force: true })
}

export function failOnBlockedCalls(): void {
  if (existsSync(LOG)) throw new Error(`A test tried to call a real AI provider (see ${LOG}). Tests must use the mocked API.`)
}
