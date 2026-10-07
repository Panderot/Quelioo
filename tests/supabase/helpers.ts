import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrowserContext } from '@playwright/test'

import type { Database } from '../../src/lib/database.types'
import { assertTestProject, testEnv } from './env'

/** Helpers for the real-Supabase specs. Everything here talks to the TEST project only. */

assertTestProject()

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const

/** Full-access client (secret key) for creating and deleting test users and reading what a test left behind. */
export const admin: SupabaseClient<Database> = createClient<Database>(testEnv.url, testEnv.secretKey, clientOptions)

export const PASSWORD = 'Correct-Horse-9'

export interface TestUser {
  id: string
  email: string
  password: string
  /** A client signed in as this user (publishable key + the user's own token): what the browser can do. */
  client: SupabaseClient<Database>
  accessToken: string
  session: { access_token: string; refresh_token: string; expires_at?: number; expires_in: number; token_type: string; user: unknown }
}

const created: string[] = []

const randomTag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const testEmail = (label = 'user') => `quelio-e2e-${label}-${randomTag()}@example.com`

/** Creates a confirmed user (no email is sent) and signs in as them. */
export async function createTestUser(label = 'user', options: { displayName?: string; language?: 'en' | 'tr' | 'hyw' } = {}): Promise<TestUser> {
  const email = testEmail(label)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: options.displayName ?? label, ui_language: options.language ?? 'en' },
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  created.push(data.user.id)
  return signIn(email, PASSWORD, data.user.id)
}

export async function signIn(email: string, password: string, knownId?: string): Promise<TestUser> {
  const client = createClient<Database>(testEnv.url, testEnv.publishableKey, clientOptions)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`signIn failed: ${error?.message}`)
  return {
    id: knownId ?? data.user.id,
    email,
    password,
    client,
    accessToken: data.session.access_token,
    session: data.session as TestUser['session'],
  }
}

export function trackUser(id: string) {
  if (!created.includes(id)) created.push(id)
}

/** Lists every object under "<prefix>/" of a bucket (folders are walked). */
export async function listObjects(bucket: 'audio' | 'uploads', prefix: string): Promise<string[]> {
  const paths: string[] = []
  const walk = async (folder: string): Promise<void> => {
    const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`
      if (entry.id === null) await walk(path)
      else paths.push(path)
    }
  }
  await walk(prefix)
  return paths
}

/** Deletes a test user with their files (rows go with the user: every table cascades). */
export async function deleteTestUser(id: string): Promise<void> {
  for (const bucket of ['audio', 'uploads'] as const) {
    const paths = await listObjects(bucket, id)
    if (paths.length > 0) await admin.storage.from(bucket).remove(paths)
  }
  await admin.auth.admin.deleteUser(id)
}

/** Deletes every user and file this run created, plus leftover `quelio-e2e-*` accounts older than 20 minutes
 * (from an aborted run; younger ones may belong to a spec running in parallel). */
export async function cleanupTestUsers(): Promise<void> {
  for (const id of created.splice(0)) await deleteTestUser(id).catch(() => undefined)
  for (let page = 1; page < 20; page += 1) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const stale = (data?.users ?? []).filter((user) => user.email?.startsWith('quelio-e2e-') && Date.now() - new Date(user.created_at).getTime() > 20 * 60_000)
    for (const user of stale) await deleteTestUser(user.id).catch(() => undefined)
    if ((data?.users.length ?? 0) < 200) break
  }
}

/** The key supabase-js stores the session under in the browser. */
export const sessionStorageKey = `sb-${testEnv.projectRef}-auth-token`

/** Makes every page of the context start signed in as `user` (same effect as having signed in earlier). */
export async function signInBrowser(context: BrowserContext, user: TestUser): Promise<void> {
  await context.addInitScript(
    ([key, value]) => {
      // Only the first page load of a context seeds the session: later sign-outs must stay signed out.
      if (!window.sessionStorage.getItem('e2e-session-seeded')) {
        window.localStorage.setItem(key, value)
        window.sessionStorage.setItem('e2e-session-seeded', '1')
      }
    },
    [sessionStorageKey, JSON.stringify(user.session)],
  )
}

/** Token link for an email flow, created by the admin API so no real email is sent. */
export async function adminLink(type: 'signup' | 'recovery' | 'magiclink' | 'email_change_new', email: string, extra: { password?: string; newEmail?: string } = {}): Promise<{ tokenHash: string; type: string; userId: string }> {
  const params =
    type === 'signup'
      ? ({ type: 'signup', email, password: extra.password ?? PASSWORD } as const)
      : type === 'email_change_new'
        ? ({ type: 'email_change_new', email, newEmail: extra.newEmail ?? '' } as const)
        : ({ type, email } as const)
  const { data, error } = await admin.auth.admin.generateLink(params as Parameters<typeof admin.auth.admin.generateLink>[0])
  if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`)
  trackUser(data.user.id)
  return { tokenHash: data.properties.hashed_token, type: data.properties.verification_type, userId: data.user.id }
}
