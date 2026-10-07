import { createClient } from '@supabase/supabase-js'

import type { Database } from './database.types'

/** True only when the dev server was started by Playwright for the UI-logic specs: a fake signed-in
 * user and the browser-local stores replace Supabase. The flag is a build-time constant, so a normal
 * build has no way to switch it on. */
// (`import.meta.env` is undefined when a unit spec imports a module in plain Node: everything then reads as "not configured".)
const env = import.meta.env as ImportMetaEnv | undefined

export const isFakeBackend = env?.VITE_QUELIO_FAKE_BACKEND === '1'

const url = env?.VITE_SUPABASE_URL
const publishableKey = env?.VITE_SUPABASE_PUBLISHABLE_KEY

/** False when the build has no Supabase settings; the app then shows a configuration notice. */
export const supabaseConfigured = Boolean(url && publishableKey)

/** Browser client: publishable key only (the secret key never leaves api/). PKCE sign-in, the session
 * persists in the browser, tokens refresh automatically and other tabs follow through onAuthStateChange. */
export const supabase = createClient<Database>(url ?? 'http://localhost:54321', publishableKey ?? 'sb_publishable_missing', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    // The /auth/callback page reads the URL itself so the result can be shown (and never runs twice).
    detectSessionInUrl: false,
  },
})

export const supabaseUrl = url ?? ''
export const supabasePublishableKey = publishableKey ?? ''

export type Tables = Database['public']['Tables']
export type Row<T extends keyof Tables> = Tables[T]['Row']
export type InsertRow<T extends keyof Tables> = Tables[T]['Insert']
