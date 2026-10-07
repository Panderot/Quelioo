/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable key (sb_publishable_...; public, safe in the browser). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** "1" only in the Playwright dev server: a fake signed-in user and browser-local storage replace Supabase. Never set in a real build. */
  readonly VITE_QUELIO_FAKE_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
