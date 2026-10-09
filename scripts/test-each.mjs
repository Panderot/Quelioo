// Runs the Playwright specs one file at a time (2 workers, desktop + mobile) against ONE Vite dev server
// that this script starts once and always kills (whole process tree) at the end, even on Ctrl+C.
// Usage: node scripts/test-each.mjs [spec-file ...]   (default: every tests/e2e/*.spec.ts)
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { posix } from 'node:path'

// --supabase: the real-Supabase specs (tests/supabase) on port 5191 against the TEST project; default: the UI-logic specs on a fake backend.
// --game: the Live Game specs (tests/game) on port 5192, also against the TEST project.
const gameMode = process.argv.includes('--game')
const supabaseMode = process.argv.includes('--supabase') || gameMode
const PORT = gameMode ? 5192 : supabaseMode ? 5191 : 5190
const specDir = gameMode ? 'tests/game' : supabaseMode ? 'tests/supabase' : 'tests/e2e'
const args = process.argv.slice(2).filter((arg) => arg !== '--supabase' && arg !== '--game')
const files = args.length > 0 ? args : readdirSync(specDir).filter((f) => f.endsWith('.spec.ts')).map((f) => posix.join(specDir, f))

const nodeCount = () => {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', "(Get-Process node -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: 'utf8' })
  return Number(r.stdout.trim()) || 0
}
const killTree = (pid) => spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })

const { testEnv } = supabaseMode ? await import('../tests/supabase/env.ts').catch(() => ({ testEnv: null })) : { testEnv: null }
const serverEnv = supabaseMode
  ? { VITE_SUPABASE_URL: testEnv?.url ?? '', VITE_SUPABASE_PUBLISHABLE_KEY: testEnv?.publishableKey ?? '', SUPABASE_SECRET_KEY: testEnv?.secretKey ?? '', ...(gameMode ? { CRON_SECRET: 'quelio-test-cron-secret' } : {}) }
  : { VITE_QUELIO_FAKE_BACKEND: '1' }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, QUELIO_NO_HMR: '1', ...serverEnv },
  stdio: 'ignore',
})
const cleanup = () => killTree(server.pid)
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130))

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await fetch(`http://localhost:${PORT}`)).ok) break
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

const baseline = nodeCount()
console.log(`node processes before: ${baseline}`)
let failedFiles = 0
for (const file of files) {
  const run = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...(gameMode ? ['--config=playwright.game.config.ts'] : supabaseMode ? ['--config=playwright.supabase.config.ts'] : []), file, '--project=desktop', '--project=mobile', '--workers=2', '--reporter=line'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  const lines = `${run.stdout}${run.stderr}`.split('\n')
  const summary = lines.filter((l) => /^\s+\d+ (passed|failed|flaky|skipped)/.test(l)).map((l) => l.trim()).join(', ')
  console.log(`${run.status === 0 ? 'ok  ' : 'FAIL'} ${file} — ${summary || 'no summary'} (node: ${nodeCount()})`)
  if (run.status !== 0) {
    failedFiles += 1
    for (const l of lines.filter((x) => /^\s+\d+\) |^\s+Error:|Expected|Received/.test(x)).slice(0, 12)) console.log('   ', l.trim())
  }
}
console.log(`node processes after specs: ${nodeCount()} (before: ${baseline}); failed files: ${failedFiles}`)
cleanup()
process.exitCode = failedFiles ? 1 : 0
