import { readFileSync } from 'node:fs'

/** Settings of the TEST Supabase project, read from .env.local (never printed). Destructive tests
 * (sign-ups, deletes, RLS attacks) run only against it, never against production. */

function readEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync('.env.local', 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
    )
  } catch {
    return {}
  }
}

const file = readEnvFile()
const pick = (name: string) => process.env[name] || file[name] || ''

export const testEnv = {
  url: pick('SUPABASE_TEST_URL'),
  publishableKey: pick('SUPABASE_TEST_PUBLISHABLE_KEY'),
  secretKey: pick('SUPABASE_TEST_SECRET_KEY'),
  projectRef: pick('SUPABASE_TEST_PROJECT_REF'),
}

/** The production URL, used only to make sure a test never points at it. */
export const productionUrl = pick('VITE_SUPABASE_URL')

export function assertTestProject(): void {
  if (!testEnv.url || !testEnv.publishableKey || !testEnv.secretKey || !testEnv.projectRef) throw new Error('SUPABASE_TEST_* settings are missing in .env.local')
  if (productionUrl && testEnv.url === productionUrl) throw new Error('Refusing to run destructive tests against the production project')
}
