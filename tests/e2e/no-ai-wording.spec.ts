import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// User-visible wording never says "AI" / "yapay zekâ" / "artificial intelligence" (Armenian: արհեստական ...).
const BANNED = /\bA\.?I\.?\b|yapay\s+zek|artificial\s+intelligence|արհեստական/i

function strings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

for (const lng of ['tr', 'en', 'hyw']) {
  test(`${lng} locale has no AI wording`, () => {
    const json = JSON.parse(readFileSync(`src/i18n/locales/${lng}.json`, 'utf8')) as unknown
    const hits = strings(json).filter(([, text]) => BANNED.test(text)).map(([key]) => key)
    expect(hits).toEqual([])
  })
}

for (const file of ['index.html', 'landing.html']) {
  test(`${file} has no AI wording in its head`, () => {
    const head = /<head[\s\S]*?<\/head>/i.exec(readFileSync(file, 'utf8'))?.[0] ?? ''
    expect(head).not.toMatch(BANNED)
  })
}

test('prerender meta (title, description, og:*) comes from locale keys without AI wording', () => {
  for (const lng of ['tr', 'en', 'hyw']) {
    const meta = (JSON.parse(readFileSync(`src/i18n/locales/${lng}.json`, 'utf8')) as { landing: { meta: Record<string, string> } }).landing.meta
    expect(Object.values(meta).join('\n')).not.toMatch(BANNED)
  }
})
