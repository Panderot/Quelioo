import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'

import { isFakeBackend, supabase, supabaseConfigured } from '../supabase'
import type { Row } from '../supabase'

/** Who is signed in. One module-level store so the data layer (outside React) can read the user id
 * and the access token, and every tab stays in step through supabase-js (storage + BroadcastChannel). */

export type Profile = Row<'profiles'>
export type UiLanguage = 'en' | 'tr' | 'hyw'

export interface AuthUser {
  id: string
  email: string
  /** Sign-in methods linked to the account ("email", "google"). */
  providers: string[]
  createdAt: string
}

export interface AuthState {
  status: 'loading' | 'signedIn' | 'signedOut'
  user: AuthUser | null
  profile: Profile | null
  /** The profile could not be loaded (network); retry with refreshProfile(). */
  profileFailed: boolean
}

const FAKE_USER: AuthUser = { id: 'e2e-user', email: 'e2e@example.com', providers: ['email'], createdAt: '2026-01-01T00:00:00.000Z' }
// The fake user is an admin so the owner page (cost view) can be exercised by the UI-logic specs; the
// real admin check (profiles.role, set only by the owner in SQL) is covered in tests/supabase.
const FAKE_PROFILE: Profile = { id: FAKE_USER.id, display_name: 'E2E User', ui_language: 'en', role: 'admin', created_at: FAKE_USER.createdAt, updated_at: FAKE_USER.createdAt }

let state: AuthState = isFakeBackend
  ? { status: 'signedIn', user: FAKE_USER, profile: FAKE_PROFILE, profileFailed: false }
  : { status: supabaseConfigured ? 'loading' : 'signedOut', user: null, profile: null, profileFailed: false }

const listeners = new Set<() => void>()
const sessionEndHandlers = new Set<() => void>()
const sessionStartHandlers = new Set<(userId: string) => void>()
let started = false

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function getAuthState(): AuthState {
  return state
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState)
}

/** Runs when the session ends or the account changes: drop every in-memory copy of the user's data. */
export function onSessionEnd(handler: () => void): () => void {
  sessionEndHandlers.add(handler)
  return () => sessionEndHandlers.delete(handler)
}

/** Runs once a user is known (sign-in, page load with a saved session). */
export function onSessionStart(handler: (userId: string) => void): () => void {
  sessionStartHandlers.add(handler)
  return () => sessionStartHandlers.delete(handler)
}

/** The signed-in user's id; throws when nobody is signed in (data calls never run signed out). */
export function requireUserId(): string {
  const id = state.user?.id
  if (!id) throw new Error('not signed in')
  return id
}

function toAuthUser(session: Session): AuthUser {
  const user = session.user
  const providers = new Set<string>()
  for (const identity of user.identities ?? []) providers.add(identity.provider)
  if (providers.size === 0 && user.app_metadata?.provider) providers.add(String(user.app_metadata.provider))
  return { id: user.id, email: user.email ?? '', providers: [...providers], createdAt: user.created_at }
}

async function loadProfile(userId: string): Promise<void> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (state.user?.id !== userId) return
  if (error || !data) {
    setState({ profileFailed: true })
    return
  }
  const firstLoad = state.profile === null
  setState({ profile: data, profileFailed: false })
  if (firstLoad) {
    // The i18n setup touches the DOM, so it is loaded here rather than when this module is imported (unit specs run in plain Node).
    const { default: i18n } = await import('../../i18n')
    if (data.ui_language !== i18n.resolvedLanguage) void i18n.changeLanguage(data.ui_language)
  }
}

export function refreshProfile(): Promise<void> {
  const id = state.user?.id
  return id && !isFakeBackend ? loadProfile(id) : Promise.resolve()
}

function applySession(session: Session | null) {
  if (!session) {
    const hadUser = state.user !== null
    setState({ status: 'signedOut', user: null, profile: null, profileFailed: false })
    if (hadUser) sessionEndHandlers.forEach((handler) => handler())
    return
  }
  const user = toAuthUser(session)
  const changedAccount = state.user !== null && state.user.id !== user.id
  if (changedAccount) sessionEndHandlers.forEach((handler) => handler())
  const isNewUser = state.user?.id !== user.id
  setState({ status: 'signedIn', user, ...(isNewUser ? { profile: null, profileFailed: false } : {}) })
  if (isNewUser) {
    // Never call supabase from inside the auth callback itself: it can deadlock the auth lock.
    setTimeout(() => {
      void loadProfile(user.id)
      sessionStartHandlers.forEach((handler) => handler(user.id))
    }, 0)
  }
}

/** Starts listening once (main.tsx). Fake backend: nothing to start. */
export function initAuth(): void {
  if (started || isFakeBackend || !supabaseConfigured) return
  started = true
  supabase.auth.onAuthStateChange((_event, session) => applySession(session))
}

/** Access token for the Authorization header, refreshed when it is about to expire; null if signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (isFakeBackend) return 'e2e-token'
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
  if (isFakeBackend) return
  // Send what is still queued (a card just reviewed, a rename) before the session goes away.
  try {
    const { flushWrites } = await import('../data/writeQueue')
    await Promise.race([flushWrites(), new Promise((resolve) => setTimeout(resolve, 4000))])
  } catch {
    // Offline: the queue keeps the writes for the next sign-in.
  }
  await supabase.auth.signOut({ scope })
  // The SIGNED_OUT event normally clears the state; make sure of it if the network call failed.
  if (state.user) applySession(null)
}

export async function updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'ui_language'>>): Promise<boolean> {
  const id = state.user?.id
  if (!id) return false
  if (isFakeBackend) {
    setState({ profile: { ...(state.profile ?? FAKE_PROFILE), ...patch } })
    return true
  }
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select('*').maybeSingle()
  if (error || !data) return false
  setState({ profile: data })
  if (patch.ui_language) void supabase.auth.updateUser({ data: { ui_language: patch.ui_language } })
  return true
}

/** Remembers a language picked in the switcher on the account (no-op signed out or while loading). */
export function syncLanguageToProfile(language: string): void {
  const profile = state.profile
  if (!profile || (language !== 'en' && language !== 'tr' && language !== 'hyw') || profile.ui_language === language) return
  void updateProfile({ ui_language: language })
}

export function isAdmin(): boolean {
  return state.profile?.role === 'admin'
}
