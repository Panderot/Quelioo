import { readFile } from 'node:fs/promises'

import { test, expect } from './strict'
import type { Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { en } from './locales'
import { admin, cleanupTestUsers, createTestUser, listObjects, signIn, signInBrowser } from './helpers'
import { ACCOUNT_URL, expectSignedIn, extraPage, ownedCounts, seedAccount } from './account-helpers'
import { readLegacyCounts, seedLegacyData } from './legacySeed'

// Account page, part 2 (real TEST project): sessions (sign out, sign out everywhere), the data download,
// "data on this device" (old browser-local data) and deleting the account.

test.afterAll(async () => {
  await cleanupTestUsers()
})

const section = (page: Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)

// ---------------------------------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------------------------------

test.describe('sessions', () => {
  test('"Sign out" leads to the sign-in page, and the back button does not return to a protected page', async ({ page, context }) => {
    const user = await createTestUser('sess-out')
    await signInBrowser(context, user)
    await page.goto('/?lng=en')
    await expectSignedIn(page)
    await page.locator('[data-purpose="user-menu"] > button').click()
    await page.getByRole('menuitem', { name: en.userMenu.account }).click()
    await expect(page).toHaveURL(/\/account$/)

    await section(page, 'account-sessions').getByRole('button', { name: en.account.sessions.signOut, exact: true }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.locator('[data-purpose="sign-in-form"]')).toBeVisible()

    await page.goBack()
    await expect(page.locator('[data-purpose="user-menu"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toHaveCount(0)
    await page.goForward()
    await expect(page).toHaveURL(/\/sign-in/)
    await page.goto('/account?lng=en')
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount/)
    await page.reload()
    await expect(page).toHaveURL(/\/sign-in/)
    // The refresh token is gone from the browser: no stored session is left.
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /^sb-.+-auth-token$/.test(key)))).toEqual([])
  })

  test('"Sign out of all devices" ends the session on this device and revokes every other session', async ({ page, context, browser }) => {
    const user = await createTestUser('sess-all')
    const secondDevice = await signIn(user.email, user.password) // a separate session of the same account
    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    await expectSignedIn(page)

    const other = await extraPage(browser, secondDevice)
    await other.page.goto(ACCOUNT_URL)
    await expectSignedIn(other.page)

    await section(page, 'account-sessions').getByRole('button', { name: en.account.sessions.signOutAll }).click()
    await expect(page).toHaveURL(/\/sign-in/)

    // The server no longer accepts the other device's refresh token...
    const refreshed = await user.client.auth.refreshSession({ refresh_token: secondDevice.session.refresh_token })
    expect(refreshed.error).not.toBeNull()
    expect(refreshed.data.session).toBeNull()

    // ...so once that device's short-lived access token needs renewing (simulated: it has just run out), a reload drops it too.
    other.strict.allow(/\/auth\/v1\/token/, [400, 401])
    other.strict.allowConsole(/refresh|session|token/i)
    await other.page.evaluate(() => {
      const key = Object.keys(localStorage).find((name) => /^sb-.+-auth-token$/.test(name))
      if (!key) throw new Error('no stored session')
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...stored, expires_at: Math.floor(Date.now() / 1000) - 120 }))
    })
    await other.page.reload()
    await expect(other.page).toHaveURL(/\/sign-in/)
    await other.check()
    await other.context.close()
  })

  // Auth code (off limits): the second device keeps working until its access token (a stateless JWT) runs out;
  // dropping it on the very next reload would need a server check of the session in src/lib/auth.
  test.fixme('"Sign out of all devices": the other device is dropped on the very next reload, even with a still-valid access token', async () => {})
})

// ---------------------------------------------------------------------------------------------------------------
// Data download
// ---------------------------------------------------------------------------------------------------------------

async function downloadJson(page: Page): Promise<{ name: string; body: Record<string, unknown> & { files: { bucket: string; path: string; url: string | null }[] } }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: en.account.data.download }).click()])
  const text = await readFile((await download.path())!, 'utf8')
  return { name: download.suggestedFilename(), body: JSON.parse(text) }
}

test.describe('download my data', () => {
  test('a valid JSON file with the profile, quizzes, solutions, decks, cards and progress, and nothing that is not the account\'s', async ({ page, context }) => {
    const user = await createTestUser('dl-full', { displayName: 'Dana' })
    const mine = await seedAccount(user, 'Mine')
    const theirs = await createTestUser('dl-other', { displayName: 'Someone Else' })
    await seedAccount(theirs, 'Theirs')
    await user.client.storage.from('uploads').upload(`${user.id}/solves/${mine.solveId}.jpg`, new Blob(['abc'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })

    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    const { name, body } = await downloadJson(page)
    expect(name).toMatch(/^quelio-data-\d{4}-\d{2}-\d{2}\.json$/)

    expect(body.account).toMatchObject({ id: user.id, email: user.email })
    expect(body.profile).toMatchObject({ id: user.id, display_name: 'Dana' })
    expect((body.decks as { name: string }[]).map((deck) => deck.name)).toEqual([mine.deckName])
    expect((body.cards as { front: string }[]).map((card) => card.front)).toEqual(['Mine front'])
    expect(body.card_progress as unknown[]).toHaveLength(1)
    expect((body.quizzes as { title: string }[]).map((quiz) => quiz.title)).toEqual([mine.quizTitle])
    expect((body.solves as { id: string }[]).map((solve) => solve.id)).toEqual([mine.solveId])
    expect(body.files).toHaveLength(1)
    expect(body.files[0].path).toBe(`${user.id}/solves/${mine.solveId}.jpg`)

    // Nothing of the other account, nothing of the removed features.
    const text = JSON.stringify(body)
    expect(text).not.toContain('Theirs')
    expect(text).not.toContain(theirs.id)
    expect(text).not.toContain(theirs.email)
    expect(Object.keys(body).filter((key) => /song|lesson|exam|live|session_code/i.test(key))).toEqual([])
    expect(text).not.toMatch(/"(songs?|lessons?|exams?|live)[A-Za-z_]*"\s*:/i)
    expect(Object.keys(body.profile as object).sort()).toEqual(['created_at', 'display_name', 'id', 'role', 'ui_language', 'updated_at'])
    // Every key is a known part of the account.
    expect(Object.keys(body).sort()).toEqual(['account', 'card_progress', 'cards', 'decks', 'exportedAt', 'files', 'note', 'profile', 'quizzes', 'solves', 'subscription', 'usage_events'])
  })

  test('an empty account still downloads valid JSON', async ({ page, context }) => {
    const user = await createTestUser('dl-empty')
    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    const { body } = await downloadJson(page)
    expect(body.account).toMatchObject({ id: user.id })
    for (const key of ['decks', 'cards', 'card_progress', 'quizzes', 'solves', 'files']) expect(body[key]).toEqual([])
    expect(typeof body.exportedAt).toBe('string')
  })

  test('a double click sends one request, and a cut connection shows the failure message', async ({ page, context, strict }) => {
    strict.allowConsole(/Failed to fetch|ERR_FAILED/)
    const user = await createTestUser('dl-net')
    await signInBrowser(context, user)
    let calls = 0
    await page.route('**/api/account', async (route) => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.continue()
    })
    await page.goto(ACCOUNT_URL)
    const button = page.getByRole('button', { name: en.account.data.download })
    const [download] = await Promise.all([page.waitForEvent('download'), button.dblclick()])
    expect(download.suggestedFilename()).toMatch(/\.json$/)
    expect(calls).toBe(1)

    await page.unroute('**/api/account')
    await page.route('**/api/account', (route) => route.abort('failed'))
    await page.getByRole('button', { name: en.account.data.download }).click()
    await expect(section(page, 'account-data').getByRole('alert')).toHaveText(en.account.data.downloadFailed)
    await expect(page.getByRole('button', { name: en.account.data.download })).toBeEnabled()
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Data on this device
// ---------------------------------------------------------------------------------------------------------------

/** Old browser-local data with broken records and records of the removed song / lesson features mixed in. */
async function seedMessyLegacy(page: Page, options: { withValid: boolean }): Promise<void> {
  await page.evaluate(
    async ({ questions, withValid }) => {
      const entry = (id: string, title: string) => ({ id, title, createdAt: '2026-02-01T10:00:00.000Z', source: 'text', questionType: 'mixed', difficulty: 'medium', questionCount: '6', optionsCount: null, outputLanguage: 'auto', sourceText: `Source of ${title}.`, quiz: { title, questions } })
      localStorage.setItem(
        'quelio.archive.v1',
        JSON.stringify([null, 7, 'text', { id: 'no-quiz', title: 'No quiz' }, { id: 'empty', title: 'Empty', quiz: { questions: [] } }, ...(withValid ? [entry('messy-ok-1', 'Messy legacy quiz')] : [])]),
      )
      localStorage.setItem('quelio.songs.v1', '{"broken":')
      localStorage.setItem('quelio.lessons.v1', JSON.stringify([{ id: 'lesson-1', title: 'Old lesson' }]))

      const open = (name: string, upgrade: (db: IDBDatabase) => void) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name, 1)
          request.onupgradeneeded = () => upgrade(request.result)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => ((tx.oncomplete = () => resolve()), (tx.onerror = () => reject(tx.error))))

      // Removed features: their databases may still sit on the device.
      for (const [name, store] of [['quelio-songs', 'songs'], ['quelio-lessons', 'lessons']] as const) {
        const db = await open(name, (created) => {
          created.createObjectStore(store, { keyPath: 'id' })
        })
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put({ id: `${store}-1`, title: 'Removed feature record', quizId: 'messy-ok-1' })
        await done(tx)
        db.close()
      }

      const cards = await open('quelio-flashcards', (db) => {
        db.createObjectStore('decks', { keyPath: 'id' })
        db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId')
      })
      const tx = cards.transaction(['decks', 'cards'], 'readwrite')
      const now = Date.now()
      tx.objectStore('decks').put({ id: 123, name: 'Deck with a numeric id' })
      tx.objectStore('cards').put({ id: 'orphan-card', deckId: 'ghost-deck', front: 'x', back: 'y' })
      tx.objectStore('cards').put({ id: 'broken-card' })
      if (withValid) {
        tx.objectStore('decks').put({ id: 'messy-deck', name: 'Messy deck', description: '', source: 'manual', sourceRef: null, language: 'en', newPerDay: 15, createdAt: now, updatedAt: now })
        tx.objectStore('cards').put({ id: 'messy-card', deckId: 'messy-deck', front: 'Türkiye', back: 'Ankara', box: 2, due: now, lapses: 0, reviews: 1, lastReviewedAt: now, introducedAt: now, createdAt: now })
      }
      await done(tx)
      cards.close()

      const solutions = await open('quelio-solutions', (db) => {
        db.createObjectStore('solutions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt', { unique: false })
      })
      const solutionTx = solutions.transaction('solutions', 'readwrite')
      solutionTx.objectStore('solutions').put({ id: 42, junk: true })
      await done(solutionTx)
      solutions.close()
    },
    { questions: SAMPLE_QUIZ.questions, withValid: options.withValid },
  )
}

test.describe('data on this device', () => {
  test('with no old local data the section and the dialog are hidden', async ({ page, context }) => {
    const user = await createTestUser('legacy-none')
    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    await expect(section(page, 'account-delete')).toBeVisible() // the page has finished rendering
    await expect(section(page, 'account-import')).toHaveCount(0)
    await expect(page.locator('[data-purpose="import-dialog"]')).toHaveCount(0)
  })

  test('only broken records and removed-feature (song / lesson) records: nothing to offer, nothing crashes', async ({ page, context }) => {
    const user = await createTestUser('legacy-junk')
    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    await seedMessyLegacy(page, { withValid: false })
    await page.reload()
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    await expect(section(page, 'account-delete')).toBeVisible()
    await expect(section(page, 'account-import')).toHaveCount(0)
    await expect(page.locator('[data-purpose="import-dialog"]')).toHaveCount(0)
    for (const path of ['/archive?lng=en', '/flashcards?lng=en', '/solve?lng=en']) {
      await page.goto(path)
      await expectSignedIn(page)
    }
  })

  test('old quizzes and solutions are imported and appear in the Archive; broken and removed-feature records are skipped; a second import adds no copies', async ({ page, context }) => {
    const user = await createTestUser('legacy-import')
    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    await seedLegacyData(page) // the normal old-format data (2 quizzes, 2 decks, 5 cards, 1 solution) ...
    await page.evaluate(() => localStorage.removeItem('quelio.archive.v1')) // ... but the archive is replaced by the messy one below
    await seedMessyLegacy(page, { withValid: true })
    await page.reload()

    const dialog = page.locator('[data-purpose="import-dialog"]')
    await expect(dialog).toBeVisible()
    const preview = dialog.locator('[data-purpose="import-preview"]')
    await expect(preview).toContainText('1 quiz')
    await expect(preview).not.toContainText('2 quizzes')
    await expect(dialog).not.toContainText(/song|lesson/i)
    await dialog.getByRole('button', { name: en.importDialog.import }).click()
    await expect(dialog.getByText(en.importDialog.doneTitle)).toBeVisible({ timeout: 60_000 })
    await dialog.getByRole('button', { name: en.importDialog.keep }).click()

    const first = await ownedCounts(user.id)
    expect(first.quizzes).toBe(1)
    expect(first.solves).toBe(1)
    expect((await admin.from('quizzes').select('title').eq('user_id', user.id)).data?.map((row) => row.title)).toEqual(['Messy legacy quiz'])
    expect((await admin.from('decks').select('name').eq('user_id', user.id)).data?.map((row) => row.name).sort()).toEqual(['Legacy capitals', 'Legacy verbs', 'Messy deck'])

    await page.goto('/archive?lng=en')
    await expect(page.getByRole('link', { name: 'Study — Messy legacy quiz' })).toBeVisible()

    // Importing again changes nothing (the import state is cleared to offer it once more).
    await page.evaluate(() => localStorage.removeItem('quelio.importState.v1'))
    await page.goto(ACCOUNT_URL)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: en.importDialog.import }).click()
    await expect(dialog.getByText(en.importDialog.doneTitle)).toBeVisible({ timeout: 60_000 })
    await dialog.getByRole('button', { name: en.importDialog.keep }).click()
    expect(await ownedCounts(user.id)).toEqual(first)
    // Once imported, the section is gone from the page and the local copy is still there until it is removed.
    await expect(section(page, 'account-import')).toHaveCount(0)
    expect((await readLegacyCounts(page)).decks).toBeGreaterThan(0)
  })

  test('"Not now" keeps the section on the page; its button opens the same dialog again', async ({ page, context }) => {
    const user = await createTestUser('legacy-later')
    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    await seedLegacyData(page)
    await page.reload()
    const dialog = page.locator('[data-purpose="import-dialog"]')
    await dialog.getByRole('button', { name: en.importDialog.notNow }).click()
    const card = section(page, 'account-import')
    await expect(card.getByRole('heading', { name: en.account.import.title })).toBeVisible()
    await expect(card).toContainText('2 decks')
    await expect(card).not.toContainText(/song|lesson/i)
    await card.getByRole('button', { name: en.account.import.button }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape') // Escape on the first screen is "Not now"
    await expect(dialog).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Delete account
// ---------------------------------------------------------------------------------------------------------------

test.describe('delete my account', () => {
  test('nothing is deleted without the confirm step; "Cancel", Escape and the backdrop close it', async ({ page, context }) => {
    const user = await createTestUser('del-cancel')
    await seedAccount(user, 'Keep')
    await signInBrowser(context, user)
    let deleteCalls = 0
    await page.route('**/api/account', async (route) => {
      if ((route.request().postDataJSON() as { action?: string })?.action === 'delete') deleteCalls += 1
      await route.continue()
    })
    await page.goto(ACCOUNT_URL)
    const open = () => section(page, 'account-delete').getByRole('button', { name: en.account.delete.button })
    const dialog = page.locator('[data-purpose="delete-account-dialog"]')
    await expect(section(page, 'account-delete')).toContainText(en.account.delete.hint)

    await open().click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel(en.account.delete.confirmLabel)).toBeFocused()
    const confirm = dialog.getByRole('button', { name: en.account.delete.confirm })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(en.account.delete.confirmLabel).fill('wrong@example.com')
    await expect(confirm).toBeDisabled()
    await dialog.getByRole('button', { name: en.flashcards.common.cancel }).click()
    await expect(dialog).toHaveCount(0)

    await open().click()
    await expect(dialog.getByLabel(en.account.delete.confirmLabel)).toHaveValue('') // a fresh dialog
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await open().click()
    await page.mouse.click(5, 5) // backdrop
    await expect(dialog).toHaveCount(0)

    expect(deleteCalls).toBe(0)
    await expect(page).toHaveURL(/\/account/)
    expect((await admin.auth.admin.getUserById(user.id)).data.user).not.toBeNull()
    expect((await ownedCounts(user.id)).decks).toBe(1)
  })

  test('a failed deletion keeps the dialog and the account, shows the reason, and a double click sends one request', async ({ page, context, strict }) => {
    strict.allow(/\/api\/account/, 500)
    const user = await createTestUser('del-fail')
    await seedAccount(user, 'Stay')
    await signInBrowser(context, user)
    let calls = 0
    await page.route('**/api/account', async (route) => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'server' }) })
    })
    await page.goto(ACCOUNT_URL)
    await section(page, 'account-delete').getByRole('button', { name: en.account.delete.button }).click()
    const dialog = page.locator('[data-purpose="delete-account-dialog"]')
    await dialog.getByLabel(en.account.delete.confirmLabel).fill(user.email.toUpperCase()) // letter case does not matter
    await dialog.getByRole('button', { name: en.account.delete.confirm }).dblclick()
    await expect(dialog.getByRole('alert')).toHaveText(en.account.errors.server)
    expect(calls).toBe(1)
    await expect(dialog.getByRole('button', { name: en.account.delete.confirm })).toBeEnabled()
    await expect(page).toHaveURL(/\/account/)
    expect((await admin.auth.admin.getUserById(user.id)).data.user).not.toBeNull()
  })

  test('deleting removes every row in every table and every uploaded file, ends the session, and the same credentials no longer sign in', async ({ page, context, strict }) => {
    strict.allow(/\/auth\/v1\/logout/) // the app signs out with a token of the account that was just deleted
    const user = await createTestUser('del-all')
    const seeded = await seedAccount(user, 'Doomed')
    await user.client.storage.from('uploads').upload(`${user.id}/solves/${seeded.solveId}.jpg`, new Blob(['abc'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    await user.client.storage.from('uploads').upload(`${user.id}/solves/extra.jpg`, new Blob(['def'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    await admin.from('usage_events').insert({ user_id: user.id, feature: 'generate', cost_usd: 0.002 })
    expect(await ownedCounts(user.id)).toEqual({ decks: 1, cards: 1, progress: 1, quizzes: 1, solves: 1, usage: 1 })
    expect(await listObjects('uploads', user.id)).toHaveLength(2)

    await signInBrowser(context, user)
    await page.goto(ACCOUNT_URL)
    await section(page, 'account-delete').getByRole('button', { name: en.account.delete.button }).click()
    const dialog = page.locator('[data-purpose="delete-account-dialog"]')
    await dialog.getByLabel(en.account.delete.confirmLabel).fill(` ${user.email.toUpperCase()} `)
    await dialog.getByRole('button', { name: en.account.delete.confirm }).click()
    await expect(page).toHaveURL(/\/sign-in/)

    expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull()
    expect(await ownedCounts(user.id)).toEqual({ decks: 0, cards: 0, progress: 0, quizzes: 0, solves: 0, usage: 0 })
    expect((await admin.from('profiles').select('id').eq('id', user.id)).data).toEqual([])
    expect((await admin.from('subscriptions').select('user_id').eq('user_id', user.id)).data).toEqual([])
    expect(await listObjects('uploads', user.id)).toEqual([])
    // The card's progress goes with the card, whoever asks.
    expect((await admin.from('card_progress').select('card_id').eq('card_id', seeded.cardId)).data).toEqual([])

    await expect(signIn(user.email, user.password)).rejects.toThrow()
    await page.goto('/account?lng=en')
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount/)
  })
})
