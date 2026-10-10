import { expect, test } from '@playwright/test'

import { CANONICAL_SITE_URL, canonicalRedirectTarget, resolvePublicSiteUrl } from '../../src/lib/publicSiteCore'

const siteUrl = CANONICAL_SITE_URL
const at = (hostname: string, pathname = '/katil/123456', search = '?a=1', hash = '#t') => canonicalRedirectTarget({ hostname, pathname, search, hash, siteUrl })

test('getPublicSiteUrl: production is canonical, an env override wins, development keeps the origin', () => {
  const origin = 'https://quelio-r1mfqxqi5-some-team.vercel.app'
  expect(resolvePublicSiteUrl({ prod: true, origin })).toBe('https://quelio.vercel.app')
  expect(resolvePublicSiteUrl({ prod: true, origin, override: '' })).toBe('https://quelio.vercel.app')
  expect(resolvePublicSiteUrl({ prod: true, origin, override: 'https://quelio.app/' })).toBe('https://quelio.app')
  expect(resolvePublicSiteUrl({ prod: true, origin, override: 'not a url' })).toBe('https://quelio.vercel.app')
  expect(resolvePublicSiteUrl({ prod: false, origin: 'http://localhost:5190', override: 'https://quelio.app' })).toBe('http://localhost:5190')
})

test('redirect decision: only other quelio deployment hosts move, with path, query and hash kept', () => {
  expect(at('quelio-r1mfqxqi5-some-team.vercel.app')).toBe('https://quelio.vercel.app/katil/123456?a=1#t')
  expect(at('quelio-git-feature-some-team.vercel.app', '/live')).toBe('https://quelio.vercel.app/live?a=1#t')
  expect(at('quelio.vercel.app')).toBeNull()
  expect(at('localhost')).toBeNull()
  expect(at('someone-else.vercel.app')).toBeNull()
  expect(at('quelio-r1mfqxqi5-some-team.vercel.app', '/api/live')).toBeNull()
  expect(at('quelio-r1mfqxqi5-some-team.vercel.app', '/version.json')).toBeNull()
  expect(at('quelio-r1mfqxqi5-some-team.vercel.app', '/assets/index-abc.js')).toBeNull()
})
