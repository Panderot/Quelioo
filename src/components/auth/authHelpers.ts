import { useEffect, useState } from 'react'

import { supabasePublishableKey, supabaseUrl } from '../../lib/supabase'

/** Small helpers shared by the sign-in, sign-up, password and callback pages. */

export const MIN_PASSWORD_LENGTH = 8
export const RESEND_COOLDOWN_SECONDS = 60

const NEXT_KEY = 'quelio.authNext'
const COOLDOWN_KEY = 'quelio.authCooldown.v1'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/** A return path that stays inside the app: one leading slash, no "//", no backslash, no scheme. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  return raw
}

export function storeNext(path: string | null): void {
  try {
    if (path) sessionStorage.setItem(NEXT_KEY, path)
    else sessionStorage.removeItem(NEXT_KEY)
  } catch {
    // sessionStorage unavailable: the user simply lands on the home page after signing in.
  }
}

export function readStoredNext(): string | null {
  try {
    return safeNext(sessionStorage.getItem(NEXT_KEY))
  } catch {
    return null
  }
}

/** The path to return to after signing in: the ?next= value, else the one kept across a redirect. */
export function resolveNext(search: string): string {
  return safeNext(new URLSearchParams(search).get('next')) ?? readStoredNext() ?? '/'
}

export function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`
}

// ---------------------------------------------------------------------------
// Resend cooldown (a timestamp in localStorage so it survives a reload)
// ---------------------------------------------------------------------------

function readCooldowns(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COOLDOWN_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function startCooldown(key: string, seconds = RESEND_COOLDOWN_SECONDS): void {
  try {
    const now = Date.now()
    const kept = Object.fromEntries(Object.entries(readCooldowns()).filter(([, until]) => typeof until === 'number' && until > now))
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify({ ...kept, [key]: now + seconds * 1000 }))
  } catch {
    // Without storage the cooldown only lasts for this page view.
  }
}

function secondsLeft(key: string): number {
  const until = readCooldowns()[key]
  return typeof until === 'number' ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0
}

/** Seconds until the next send is allowed for `key` (0 = allowed); counts down each second. */
export function useCooldown(key: string): number {
  const [left, setLeft] = useState(() => secondsLeft(key))
  useEffect(() => {
    // Re-read when the key changes, then tick once a second while a cooldown runs.
    const tick = () => setLeft(secondsLeft(key))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [key])
  return left
}

// ---------------------------------------------------------------------------
// Password strength (a hint only: the one hard rule is the 8-character minimum)
// ---------------------------------------------------------------------------

export type PasswordStrength = 'empty' | 'short' | 'weak' | 'fair' | 'strong'

export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return 'empty'
  if (password.length < MIN_PASSWORD_LENGTH) return 'short'
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  const score = (password.length >= 12 ? 2 : password.length >= 10 ? 1 : 0) + (classes >= 3 ? 2 : classes === 2 ? 1 : 0)
  if (score >= 3) return 'strong'
  if (score >= 2) return 'fair'
  return 'weak'
}

// ---------------------------------------------------------------------------
// Sign-in providers the project has switched on (Google stays hidden until it is enabled)
// ---------------------------------------------------------------------------

export interface EnabledProviders {
  google: boolean
}

let providersPromise: Promise<EnabledProviders> | null = null

function loadProviders(): Promise<EnabledProviders> {
  if (!providersPromise) {
    providersPromise = (async () => {
      try {
        if (!supabaseUrl) return { google: false }
        const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabasePublishableKey } })
        if (!response.ok) return { google: false }
        const body = (await response.json()) as { external?: Record<string, unknown> }
        return { google: body.external?.google === true }
      } catch {
        providersPromise = null
        return { google: false }
      }
    })()
  }
  return providersPromise
}

export function useEnabledProviders(): EnabledProviders {
  const [providers, setProviders] = useState<EnabledProviders>({ google: false })
  useEffect(() => {
    let cancelled = false
    void loadProviders().then((value) => {
      if (!cancelled) setProviders(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return providers
}

/** True when a supabase-js error came from the network, not from the server's answer. */
export function isNetworkError(error: { name?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!error) return false
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || /failed to fetch|networkerror|load failed/i.test(error.message ?? '')
}

/** Up to two initials from the display name, else the first letter of the email. */
export function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 0 ? words.slice(0, 2).map((word) => Array.from(word)[0]) : [Array.from(email.trim())[0] ?? '?']
  return letters.join('').toLocaleUpperCase()
}
