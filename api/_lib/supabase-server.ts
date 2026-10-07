import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../../src/lib/database.types.js'

/** Server-side Supabase access. The secret key lives only here (Vercel env / .env.local) and is never
 * sent to the browser; the publishable key is the same one the browser uses. */

function supabaseUrl(): string {
  return (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim()
}

function publishableKey(): string {
  return (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
}

function secretKey(): string {
  return (process.env.SUPABASE_SECRET_KEY ?? '').trim()
}

/** Token checks need the URL and the publishable key. */
export function isAuthConfigured(): boolean {
  return Boolean(supabaseUrl() && publishableKey())
}

export function isServiceConfigured(): boolean {
  return Boolean(supabaseUrl() && secretKey())
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const

let authClient: SupabaseClient<Database> | null = null
let serviceClient: SupabaseClient<Database> | null = null
let authKey = ''
let serviceKey = ''

/** Stateless client that only verifies access tokens. */
export function getAuthClient(): SupabaseClient<Database> {
  const key = `${supabaseUrl()}|${publishableKey()}`
  if (!authClient || authKey !== key) {
    authClient = createClient<Database>(supabaseUrl(), publishableKey(), options)
    authKey = key
  }
  return authClient
}

/** Full-access client (bypasses Row Level Security). Every query made with it must filter by the caller's own user id. */
export function getServiceClient(): SupabaseClient<Database> {
  const key = `${supabaseUrl()}|${secretKey()}`
  if (!serviceClient || serviceKey !== key) {
    serviceClient = createClient<Database>(supabaseUrl(), secretKey(), options)
    serviceKey = key
  }
  return serviceClient
}
