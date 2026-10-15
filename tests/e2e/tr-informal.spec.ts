import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Turkish UI addresses the user informally ("sen"), like the app, FAQ and email templates.
const FORMAL = /(?<!\p{L})\p{L}*(?:yın|yin|yun|yün|ınız|iniz|unuz|ünüz)(?!\p{L})|(?<!\p{L})(?:seçin|kırpın|bırakın|yapıştırın|sürükleyin|küçültün|tıklayın|ekleyin|istersiniz)(?!\p{L})/giu
// Words that end like a formal form but are not one (yayın: broadcast; şeyin: of the thing).
const ALLOWLIST = new Set(['yayın', 'şeyin'])

function strings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

test('tr locale uses informal "sen" address only', () => {
  const json = JSON.parse(readFileSync('src/i18n/locales/tr.json', 'utf8')) as unknown
  const hits: string[] = []
  for (const [key, text] of strings(json)) {
    for (const match of text.matchAll(FORMAL)) {
      if (!ALLOWLIST.has(match[0].toLowerCase())) hits.push(`${key}: ${match[0]}`)
    }
  }
  expect(hits).toEqual([])
})
