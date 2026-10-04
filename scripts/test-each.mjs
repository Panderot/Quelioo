// Runs the Playwright specs one file at a time (2 workers, desktop + mobile) against ONE Vite dev server
// that this script starts once and always kills (whole process tree) at the end, even on Ctrl+C.
// Usage: node scripts/test-each.mjs [spec-file ...]   (default: every tests/e2e/*.spec.ts)
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { posix } from 'node:path'

const PORT = 5190
const files = process.argv.length > 2 ? process.argv.slice(2) : readdirSync('tests/e2e').filter((f) => f.endsWith('.spec.ts')).map((f) => posix.join('tests/e2e', f))

const nodeCount = () => {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', "(Get-Process node -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: 'utf8' })
  return Number(r.stdout.trim()) || 0
}
const killTree = (pid) => spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, QUELIO_NO_HMR: '1' },
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
  const run = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', file, '--project=desktop', '--project=mobile', '--workers=2', '--reporter=line'], { encoding: 'utf8', maxBuffer: 1 << 28 })
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
