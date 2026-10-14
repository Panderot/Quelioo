import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { watchPage } from '../shared/strictPage'
import type { StrictPage } from '../shared/strictPage'
import { admin, signInBrowser } from './helpers'
import type { TestUser } from './helpers'
import { testEnv } from './env'

/** Shared pieces of the account-*.spec.ts files (real TEST project, strict page watching). */

export const ACCOUNT_URL = '/account?lng=en'

/** A user object whose stored browser session lists these sign-in methods (the account page reads them from the session). */
export function withProviders(user: TestUser, providers: ('email' | 'google')[]): TestUser {
  const sessionUser = user.session.user as Record<string, unknown>
  const identities = providers.map((provider) => ({
    identity_id: `${user.id}-${provider}`,
    id: user.id,
    user_id: user.id,
    identity_data: { email: user.email, sub: user.id },
    provider,
    created_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
  return { ...user, session: { ...user.session, user: { ...sessionUser, identities, app_metadata: { provider: providers[0], providers } } } }
}

/** Sets profile fields with the service client (fast arrangement, no UI). */
export async function setProfile(userId: string, patch: { display_name?: string; ui_language?: 'en' | 'tr' | 'hyw' }): Promise<void> {
  const { error } = await admin.from('profiles').update(patch).eq('id', userId)
  if (error) throw new Error(`setProfile failed: ${error.message}`)
}

export async function readProfile(userId: string) {
  const { data } = await admin.from('profiles').select('display_name, ui_language').eq('id', userId).single()
  return data
}

/** A second, independently watched browser context (same strictness as the `page` fixture). Call `check()` at the end of the test. */
export async function extraPage(browser: Browser, user: TestUser | null, viewport?: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page; strict: StrictPage; check: () => void }> {
  const context = await browser.newContext(viewport ? { viewport } : {})
  if (user) await signInBrowser(context, user)
  const page = await context.newPage()
  const { handle, check } = watchPage(page, ['http://localhost:5191', testEnv.url])
  return { context, page, strict: handle, check }
}

/** Fills the account with one of everything (rows made through the user's own client, as the app does). */
export async function seedAccount(user: TestUser, tag: string): Promise<{ deckId: string; cardId: string; quizId: string; solveId: string; deckName: string; quizTitle: string }> {
  const deckId = crypto.randomUUID()
  const cardId = crypto.randomUUID()
  const quizId = crypto.randomUUID()
  const solveId = crypto.randomUUID()
  const deckName = `${tag} deck`
  const quizTitle = `${tag} quiz`
  const check = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label} failed: ${error.message}`)
  }
  check('deck', (await user.client.from('decks').insert({ id: deckId, name: deckName })).error)
  check('card', (await user.client.from('cards').insert({ id: cardId, deck_id: deckId, front: `${tag} front`, back: `${tag} back` })).error)
  check('progress', (await user.client.from('card_progress').insert({ card_id: cardId, box: 2 })).error)
  check('quiz', (await user.client.from('quizzes').insert({ id: quizId, title: quizTitle, quiz: { title: quizTitle, questions: SAMPLE_QUIZ.questions } as never })).error)
  check(
    'solve',
    (
      await user.client
        .from('solves')
        .insert({ id: solveId, language: 'auto', schema_version: 1, result: { topic: `${tag} topic`, question: `${tag} question`, intro: 'i', steps: ['s'], answer: 'a', tip: 't', mistakes: [] } as never })
    ).error,
  )
  return { deckId, cardId, quizId, solveId, deckName, quizTitle }
}

export async function ownedCounts(userId: string) {
  const count = async (table: 'decks' | 'cards' | 'card_progress' | 'quizzes' | 'solves' | 'usage_events') => {
    const { count: total } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)
    return total ?? 0
  }
  return { decks: await count('decks'), cards: await count('cards'), progress: await count('card_progress'), quizzes: await count('quizzes'), solves: await count('solves'), usage: await count('usage_events') }
}

const USER_UPDATE_URL = /\/auth\/v1\/user(\?|$)/

/**
 * Answers the Supabase "update user" call (email or password change) at network level: NO email is ever sent.
 * Returns the recorded request bodies. Without `status` the answer is the account's real user with `new_email` set.
 */
export async function mockUserUpdate(page: Page, user: TestUser, options: { status?: number; error?: { error_code: string; msg: string }; delayMs?: number; abort?: boolean } = {}): Promise<{ calls: Record<string, unknown>[] }> {
  const calls: Record<string, unknown>[] = []
  const known = (await admin.auth.admin.getUserById(user.id)).data.user
  await page.route(USER_UPDATE_URL, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback()
      return
    }
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    calls.push(body)
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    if (options.abort) {
      await route.abort('failed')
      return
    }
    if (options.error) {
      await route.fulfill({ status: options.status ?? 422, contentType: 'application/json', body: JSON.stringify({ code: options.status ?? 422, error_code: options.error.error_code, msg: options.error.msg }) })
      return
    }
    const answer = { ...(known as unknown as Record<string, unknown>), ...(typeof body.email === 'string' ? { new_email: body.email, email_change_sent_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }
    await route.fulfill({ status: options.status ?? 200, contentType: 'application/json', body: JSON.stringify(answer) })
  })
  return { calls }
}

/** Waits until the app shows the signed-in top bar. */
export async function expectSignedIn(page: Page): Promise<void> {
  await expect(page.locator('[data-purpose="user-menu"]')).toBeVisible()
}

/** Scrolls every scroll container (window and app shell) to its end. */
export async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY)) element.scrollTop = element.scrollHeight
    })
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
}

export type { StrictPage }
