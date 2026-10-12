// Preloaded into every Playwright worker and web server (NODE_OPTIONS=--require): no test may reach a real AI provider.
// A request to api.openai.com / api.anthropic.com throws, prints a loud line and is logged; the global teardown then fails the run.
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const path = require('node:path')

const LOG = path.join(process.cwd(), 'test-results', 'real-ai-blocked.log')
const HOSTS = /(^|\.)api\.(openai|anthropic)\.com$/i

function hostOf(target) {
  try {
    if (typeof target === 'string') return new URL(target).hostname
    if (target && typeof target.url === 'string') return new URL(target.url).hostname
    if (target instanceof URL) return target.hostname
    if (target && typeof target === 'object') return String(target.hostname || target.host || '').replace(/:\d+$/, '')
  } catch {
    return ''
  }
  return ''
}

function block(host) {
  const message = `REAL AI BLOCKED: a test tried to call ${host}. Tests must use the mocked API.`
  if (!globalThis.__EXPECT_REAL_AI_BLOCK) {
    process.stderr.write(`\n!!! ${message}\n${new Error().stack}\n`)
    try {
      fs.mkdirSync(path.dirname(LOG), { recursive: true })
      fs.appendFileSync(LOG, `${new Date().toISOString()} ${message}\n`)
    } catch {
      // The thrown error below still fails the test.
    }
  }
  throw new Error(message)
}

const realFetch = globalThis.fetch
if (typeof realFetch === 'function') {
  globalThis.fetch = function guardedFetch(input, init) {
    const host = hostOf(input)
    if (HOSTS.test(host)) block(host)
    return realFetch.call(this, input, init)
  }
}

for (const lib of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = lib[name]
    lib[name] = function guardedRequest(first, ...rest) {
      const host = hostOf(first)
      if (HOSTS.test(host)) block(host)
      return real.call(this, first, ...rest)
    }
  }
}
