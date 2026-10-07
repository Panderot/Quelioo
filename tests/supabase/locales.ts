import { readFileSync } from 'node:fs'

// The UI strings, read as plain JSON (a JSON import needs an import attribute in Node's ESM loader).
type Locale = typeof import('../../src/i18n/locales/en.json')
const load = (code: string): Locale => JSON.parse(readFileSync(`src/i18n/locales/${code}.json`, 'utf8')) as Locale

export const en = load('en')
export const tr = load('tr')
export const hyw = load('hyw')
