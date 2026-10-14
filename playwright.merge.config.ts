import { defineConfig } from '@playwright/test'

// Only used by `playwright merge-reports` in CI: the blobs come from several configs (e2e, game, supabase), so testDir is their common parent.
export default defineConfig({ testDir: 'tests', reporter: [['html', { open: 'never' }], ['json']] })
