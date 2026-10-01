/**
 * Direct, non-browser checks of the production access-code gate (api/_lib/song-config.ts and its
 * use in api/_lib/song.ts / api/_lib/song-lyrics.ts) — same pattern as hint-leak-check.spec.ts for
 * the hint accuracy guard: plain function calls, no page needed, run as part of `npm run test:e2e`.
 */
import { test, expect } from '@playwright/test'

import { handleSongCreateRequest } from '../../api/_lib/song'
import { handleSongLyricsRequest } from '../../api/_lib/song-lyrics'

const ORIGINAL_ENV = { ...process.env }

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

test.describe('production access-code gate', () => {
  test.afterEach(resetEnv)

  test('api/song: refuses (fail closed) in production when MUSIC_ACCESS_CODE is unset, any header', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.MUSIC_ACCESS_CODE
    const { status, body } = await handleSongCreateRequest({ lyrics: 'x' }, { ip: '1.2.3.4', accessCodeHeader: 'anything' })
    expect(status).toBe(403)
    expect(body).toEqual({ error: 'locked' })
  })

  test('api/song: refuses with a missing or wrong header when a code is configured', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.MUSIC_ACCESS_CODE = 'super-secret'

    const missing = await handleSongCreateRequest({ lyrics: 'x' }, { ip: '1.2.3.4' })
    expect(missing.status).toBe(403)
    expect(missing.body).toEqual({ error: 'locked' })

    const wrong = await handleSongCreateRequest({ lyrics: 'x' }, { ip: '1.2.3.4', accessCodeHeader: 'nope' })
    expect(wrong.status).toBe(403)
    expect(wrong.body).toEqual({ error: 'locked' })
  })

  test('api/song: a correct header passes the gate (reaches normal validation, not "locked")', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.MUSIC_ACCESS_CODE = 'super-secret'
    process.env.MUSIC_ENABLED = 'true'
    process.env.MUSIC_PROVIDER = 'demo'

    // Demo is still independently blocked in production (CLAUDE.md) — "not_configured", never
    // "locked", proves the code itself was accepted.
    const { status, body } = await handleSongCreateRequest({ lyrics: 'x' }, { ip: '1.2.3.4', accessCodeHeader: 'super-secret' })
    expect(body).not.toEqual({ error: 'locked' })
    expect(status).toBe(503)
    expect(body).toEqual({ error: 'not_configured' })
  })

  test('api/song-lyrics: same gate — unset code fails closed, correct code passes it', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.MUSIC_ACCESS_CODE
    const locked = await handleSongLyricsRequest({ keyFacts: [] }, { accessCodeHeader: 'whatever' })
    expect(locked.status).toBe(403)
    expect(locked.body).toEqual({ error: 'locked' })

    process.env.MUSIC_ACCESS_CODE = 'super-secret'
    process.env.MUSIC_ENABLED = 'true'
    const passed = await handleSongLyricsRequest({ keyFacts: [] }, { accessCodeHeader: 'super-secret' })
    expect(passed.body).not.toEqual({ error: 'locked' })
  })

  test('outside production, no header is required at all (local "song test" workflow keeps working)', async () => {
    delete process.env.VERCEL_ENV
    process.env.MUSIC_ENABLED = 'true'
    process.env.MUSIC_PROVIDER = 'demo'
    const { status, body } = await handleSongCreateRequest({ lyrics: '[Verse]\nhi\n[Chorus]\nho', targetSeconds: 30 }, { ip: '1.2.3.4' })
    expect(body).not.toEqual({ error: 'locked' })
    expect(status).toBe(200)
  })
})
