// Writes a short passed / failed / skipped / flaky table for a Playwright JSON report to the GitHub step summary.
// Usage: node scripts/ci-summary.mjs <results.json> <title>
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

const [file, title = 'Playwright'] = process.argv.slice(2)
let table
if (!file || !existsSync(file)) {
  table = `### ${title}\n\n| Result |\n|---|\n| **No report was produced** (the run stopped before the tests) |\n`
} else {
  const { stats } = JSON.parse(readFileSync(file, 'utf8'))
  const seconds = Math.round(stats.duration / 1000)
  const time = seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`
  table = `### ${title}\n\n| passed | failed | skipped | flaky | duration |\n|---:|---:|---:|---:|---:|\n| ${stats.expected} | ${stats.unexpected} | ${stats.skipped} | ${stats.flaky} | ${time} |\n`
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n')
else console.log(table)
