import { test, expect } from './strict'
import { en, hyw, tr } from './locales'
import { admin, cleanupTestUsers, createTestUser, PASSWORD, signIn, signInBrowser, testEmail } from './helpers'
import type { TestUser } from './helpers'
import { ACCOUNT_URL, expectSignedIn, extraPage, mockUserUpdate, readProfile, setProfile, withProviders } from './account-helpers'

// Account page, part 1 (real TEST project): profile name, interface language, email address, password
// and the list of sign-in methods. Email-change requests are answered by the test (no email is sent).

let shared: TestUser

test.beforeAll(async () => {
  shared = await createTestUser('acct-profile', { displayName: 'Shared Sam' })
})

test.afterAll(async () => {
  await cleanupTestUsers()
})

const section = (page: import('@playwright/test').Page, purpose: string) => page.locator(`[data-purpose="${purpose}"]`)
const menuButton = (page: import('@playwright/test').Page) => page.locator('[data-purpose="user-menu"] > button')
const avatar = (page: import('@playwright/test').Page) => page.locator('[data-purpose="user-avatar"]')

test.describe('profile name', () => {
  test.beforeEach(async ({ context }) => {
    await setProfile(shared.id, { display_name: 'Shared Sam', ui_language: 'en' })
    await signInBrowser(context, shared)
  })

  async function saveName(page: import('@playwright/test').Page, value: string) {
    const profile = section(page, 'account-profile')
    const input = profile.locator('input[name="displayName"]')
    await expect(input).toHaveValue('Shared Sam')
    await input.fill(value)
    await profile.getByRole('button', { name: en.account.save, exact: true }).click()
    await expect(profile.getByText(en.account.saved, { exact: true })).toBeVisible()
  }

  test('a new name updates the top bar name and avatar letters at once and survives a reload', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await expectSignedIn(page)
    await expect(avatar(page)).toHaveText('SS')
    await saveName(page, 'Zeynep Kaya')
    await expect(avatar(page)).toHaveText('ZK')
    await expect(menuButton(page)).toHaveAttribute('aria-label', `${en.userMenu.label}: Zeynep Kaya`)
    await expect(page.locator('[data-purpose="user-menu"]').getByText('Zeynep Kaya')).toBeVisible()
    await expect.poll(async () => (await readProfile(shared.id))?.display_name).toBe('Zeynep Kaya')

    await page.reload()
    await expect(avatar(page)).toHaveText('ZK')
    await expect(section(page, 'account-profile').locator('input[name="displayName"]')).toHaveValue('Zeynep Kaya')
  })

  test('the save button stays off until the name differs from the saved one', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    const profile = section(page, 'account-profile')
    const input = profile.locator('input[name="displayName"]')
    const save = profile.getByRole('button', { name: en.account.save, exact: true })
    await expect(input).toHaveValue('Shared Sam')
    await expect(save).toBeDisabled()
    await input.fill('Shared Sam 2')
    await expect(save).toBeEnabled()
    await input.fill('  Shared Sam  ') // only spaces around: same name
    await expect(save).toBeDisabled()
  })

  test('an empty name is saved as empty: the top bar falls back to the email', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await saveName(page, '')
    await expect.poll(async () => (await readProfile(shared.id))?.display_name).toBe('')
    await expect(avatar(page)).toHaveText(shared.email.charAt(0).toUpperCase())
    await expect(menuButton(page)).toHaveAttribute('aria-label', `${en.userMenu.label}: ${shared.email}`)
    await page.reload()
    await expect(avatar(page)).toHaveText(shared.email.charAt(0).toUpperCase())
  })

  test('a very long name is cut at 80 characters and saves without an error', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    const profile = section(page, 'account-profile')
    await expect(profile.locator('input[name="displayName"]')).toHaveValue('Shared Sam')
    await profile.locator('input[name="displayName"]').fill('Ab'.repeat(100))
    expect((await profile.locator('input[name="displayName"]').inputValue()).length).toBeLessThanOrEqual(80)
    await profile.getByRole('button', { name: en.account.save, exact: true }).click()
    await expect(profile.getByText(en.account.saved, { exact: true })).toBeVisible()
    await expect(profile.getByText(en.auth.genericError)).toHaveCount(0)
    await expect.poll(async () => (await readProfile(shared.id))?.display_name.length).toBeLessThanOrEqual(80)
    // The top bar button stays inside its box (truncated text, no layout break).
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })

  test('emoji in the name are kept whole', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await saveName(page, 'Ada 🎓✨')
    await expect.poll(async () => (await readProfile(shared.id))?.display_name).toBe('Ada 🎓✨')
    await expect(avatar(page)).toHaveText('A🎓')
    await page.reload()
    await expect(section(page, 'account-profile').locator('input[name="displayName"]')).toHaveValue('Ada 🎓✨')
    await expect(menuButton(page)).toHaveAttribute('aria-label', `${en.userMenu.label}: Ada 🎓✨`)
  })

  test('HTML-like text is shown as plain text and never runs', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })
    const html = '<b>Bold</b> <img src=x onerror=alert(1)>'
    await page.goto(ACCOUNT_URL)
    await saveName(page, html)
    const menu = page.locator('[data-purpose="user-menu"]')
    await expect(menu.getByText(html, { exact: true })).toBeVisible()
    await expect(menu.locator('b, img')).toHaveCount(0)
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    await page.reload()
    await expect(menu.getByText(html, { exact: true })).toBeVisible()
    await expect(section(page, 'account-profile').locator('input[name="displayName"]')).toHaveValue(html)
    expect(dialogs).toEqual([])
  })
})

test.describe('interface language', () => {
  const steps = [
    { from: 'en', to: 'tr', label: 'Türkçe', short: 'TR', strings: tr },
    { from: 'en', to: 'hyw', label: 'Հայերէն (Արեւմտահայերէն)', short: 'ՀԱՅ', strings: hyw },
    { from: 'tr', to: 'en', label: 'English', short: 'EN', strings: en },
  ] as const

  for (const step of steps) {
    test(`${step.from} to ${step.to}: changes at once, survives a reload and a new session, and matches the top bar switcher`, async ({ page, browser, context }) => {
      await setProfile(shared.id, { display_name: 'Shared Sam', ui_language: step.from })
      await signInBrowser(context, shared)
      await page.goto(`/account?lng=${step.from}`)
      const from = step.from === 'tr' ? tr : en
      await expect(page.getByRole('heading', { name: from.account.title, level: 1 })).toBeVisible()

      await page.locator('#account-language').click()
      await page.getByRole('option', { name: step.label }).click()
      await expect(page.getByRole('heading', { name: step.strings.account.title, level: 1 })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', step.to)
      await expect(page.locator('#account-language')).toContainText(step.label)
      await expect(page.getByRole('button', { name: step.strings.topbar.language.buttonLabel })).toContainText(step.short)
      await expect.poll(async () => (await readProfile(shared.id))?.ui_language).toBe(step.to)

      await page.reload()
      await expect(page.getByRole('heading', { name: step.strings.account.title, level: 1 })).toBeVisible()

      // A brand-new browser session (no local storage) gets the language from the account.
      const fresh = await extraPage(browser, shared)
      await fresh.page.goto('/account')
      await expect(fresh.page.getByRole('heading', { name: step.strings.account.title, level: 1 })).toBeVisible()
      await expect(fresh.page.locator('html')).toHaveAttribute('lang', step.to)
      await fresh.check()
      await fresh.context.close()
    })
  }

  test('the top bar switcher and the account setting stay in step, both ways', async ({ page, context }) => {
    await setProfile(shared.id, { display_name: 'Shared Sam', ui_language: 'en' })
    await signInBrowser(context, shared)
    await page.goto(ACCOUNT_URL)
    await expect(page.locator('#account-language')).toContainText('English')
    await page.getByRole('button', { name: en.topbar.language.buttonLabel }).click()
    await page.getByRole('option', { name: 'Türkçe' }).click()
    await expect(page.getByRole('heading', { name: tr.account.title, level: 1 })).toBeVisible()
    await expect(page.locator('#account-language')).toContainText('Türkçe')
    await expect.poll(async () => (await readProfile(shared.id))?.ui_language).toBe('tr')
    // And back through the account setting.
    await page.locator('#account-language').click()
    await page.getByRole('option', { name: 'English' }).click()
    await expect(page.getByRole('button', { name: en.topbar.language.buttonLabel })).toContainText('EN')
    await expect.poll(async () => (await readProfile(shared.id))?.ui_language).toBe('en')
  })
})

test.describe('email address', () => {
  test.beforeEach(async ({ context }) => {
    await signInBrowser(context, shared)
  })

  const emailForm = (page: import('@playwright/test').Page) => section(page, 'account-email')

  test('shows the current address; an invalid address is refused before any request', async ({ page }) => {
    const mock = await mockUserUpdate(page, shared)
    await page.goto(ACCOUNT_URL)
    const form = emailForm(page)
    await expect(form).toContainText(en.account.email.current.replace('{{email}}', shared.email))
    const submit = form.getByRole('button', { name: en.account.email.submit })
    await expect(submit).toBeDisabled() // nothing typed yet
    await form.locator('input[name="newEmail"]').fill('not-an-email')
    await submit.click()
    await expect(form.getByRole('alert').filter({ hasText: en.auth.emailInvalid })).toBeVisible()
    expect(mock.calls).toHaveLength(0)
  })

  test('the same address (any letter case) is refused with its own message', async ({ page }) => {
    const mock = await mockUserUpdate(page, shared)
    await page.goto(ACCOUNT_URL)
    const form = emailForm(page)
    await form.locator('input[name="newEmail"]').fill(shared.email.toUpperCase())
    await form.getByRole('button', { name: en.account.email.submit }).click()
    await expect(form.getByRole('alert').filter({ hasText: en.account.email.same })).toBeVisible()
    expect(mock.calls).toHaveLength(0)
  })

  test("another account's address gets a clear message (the server's refusal is mocked)", async ({ page, strict }) => {
    strict.allow(/\/auth\/v1\/user/, 422)
    const other = testEmail('taken')
    const mock = await mockUserUpdate(page, shared, { error: { error_code: 'email_exists', msg: 'A user with this email address has already been registered' } })
    await page.goto(ACCOUNT_URL)
    const form = emailForm(page)
    await form.locator('input[name="newEmail"]').fill(other)
    await form.getByRole('button', { name: en.account.email.submit }).click()
    await expect(form.getByRole('alert').filter({ hasText: en.account.email.taken })).toBeVisible()
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0]).toMatchObject({ email: other })
    await expect(form.getByText(en.account.email.sent.replace('{{email}}', other))).toHaveCount(0)
  })

  test('a valid new address says the confirmation was sent (request mocked, no email leaves)', async ({ page }) => {
    const fresh = testEmail('new-address')
    const mock = await mockUserUpdate(page, shared)
    await page.goto(ACCOUNT_URL)
    const form = emailForm(page)
    await form.locator('input[name="newEmail"]').fill(` ${fresh} `)
    await form.getByRole('button', { name: en.account.email.submit }).click()
    await expect(form.locator('[data-purpose="form-message"]')).toHaveText(en.account.email.sent.replace('{{email}}', fresh))
    await expect(form.locator('input[name="newEmail"]')).toHaveValue('')
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0]).toMatchObject({ email: fresh })
    // The real account still has the old address: nothing changes before the link is opened.
    expect((await admin.auth.admin.getUserById(shared.id)).data.user?.email).toBe(shared.email)
  })

  test('a cut connection shows the network message and keeps the typed address', async ({ page }) => {
    const target = testEmail('offline')
    await mockUserUpdate(page, shared, { abort: true })
    await page.goto(ACCOUNT_URL)
    const form = emailForm(page)
    await form.locator('input[name="newEmail"]').fill(target)
    await form.getByRole('button', { name: en.account.email.submit }).click()
    await expect(form.getByRole('alert').filter({ hasText: en.auth.networkError })).toBeVisible()
    await expect(form.locator('input[name="newEmail"]')).toHaveValue(target)
  })

  test('the return link of a finished change shows its success message', async ({ page }) => {
    await page.goto('/account?lng=en&emailChanged=1')
    await expect(page.getByText(en.auth.callback.emailChanged)).toBeVisible()
  })

  test('a double click on "Change email" sends one request', async ({ page }) => {
    const mock = await mockUserUpdate(page, shared, { delayMs: 400 })
    await page.goto(ACCOUNT_URL)
    const form = emailForm(page)
    await form.locator('input[name="newEmail"]').fill(testEmail('double'))
    await form.getByRole('button', { name: en.account.email.submit }).dblclick()
    await expect(form.locator('[data-purpose="form-message"]')).toBeVisible()
    expect(mock.calls).toHaveLength(1)
  })
})

test.describe('password', () => {
  test.beforeEach(async ({ context }) => {
    await signInBrowser(context, shared)
  })

  const form = (page: import('@playwright/test').Page) => section(page, 'account-password')
  const fields = (page: import('@playwright/test').Page) => ({
    password: form(page).locator('input[name="newPassword"]'),
    confirm: form(page).locator('input[name="confirmPassword"]'),
    submit: form(page).getByRole('button', { name: en.account.password.submit }),
  })

  test('shorter than 8 characters and a mismatching confirmation are refused before any request', async ({ page }) => {
    const mock = await mockUserUpdate(page, shared)
    await page.goto(ACCOUNT_URL)
    const { password, confirm, submit } = fields(page)
    await expect(submit).toBeDisabled()
    await password.fill('Abc1234') // 7
    await confirm.fill('Abc1234')
    await submit.click()
    await expect(form(page).getByRole('alert').filter({ hasText: en.auth.passwordTooShort })).toBeVisible()

    await password.fill('Abcdefg1')
    await confirm.fill('Abcdefg2')
    await submit.click()
    await expect(form(page).getByRole('alert').filter({ hasText: en.auth.passwordMismatch })).toBeVisible()
    await expect(form(page).getByRole('alert').filter({ hasText: en.auth.passwordTooShort })).toHaveCount(0)
    expect(mock.calls).toHaveLength(0)
  })

  test('the strength bar follows the password', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    const { password } = fields(page)
    const bar = form(page).locator('[data-purpose="password-strength"]')
    await expect(bar).toHaveAttribute('data-level', 'empty')
    const cases: [string, string, string][] = [
      ['abc', 'short', en.auth.strength.short],
      ['abcdefgh', 'weak', en.auth.strength.weak],
      ['Abcdefg1', 'fair', en.auth.strength.fair],
      ['Abcdefghij1!', 'strong', en.auth.strength.strong],
    ]
    for (const [value, level, text] of cases) {
      await password.fill(value)
      await expect(bar).toHaveAttribute('data-level', level)
      await expect(bar).toContainText(text)
    }
    await password.fill('')
    await expect(bar).toHaveAttribute('data-level', 'empty')
  })

  test('a double click on "Change password" sends one request (answer mocked)', async ({ page }) => {
    const mock = await mockUserUpdate(page, shared, { delayMs: 400 })
    await page.goto(ACCOUNT_URL)
    const { password, confirm, submit } = fields(page)
    await password.fill('Another-Pass-5')
    await confirm.fill('Another-Pass-5')
    await submit.dblclick()
    await expect(form(page).getByText(en.account.password.done)).toBeVisible()
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0]).toMatchObject({ password: 'Another-Pass-5' })
  })

  test('a successful change: the new password signs in, the old one does not', async ({ browser }) => {
    const user = await createTestUser('pw-change')
    const own = await extraPage(browser, user)
    await own.page.goto(ACCOUNT_URL)
    const next = 'Brand-New-Pass-7'
    const { password, confirm, submit } = fields(own.page)
    await password.fill(next)
    await confirm.fill(next)
    await expect(form(own.page).locator('[data-purpose="password-strength"]')).toHaveAttribute('data-level', 'strong')
    await submit.click()
    await expect(form(own.page).getByText(en.account.password.done)).toBeVisible()
    await expect(password).toHaveValue('')
    await expect(confirm).toHaveValue('')
    await signIn(user.email, next)
    await expect(signIn(user.email, PASSWORD)).rejects.toThrow()
    await own.check()
    await own.context.close()
  })

  test('a Google-only account sees the Google note and can still set a password', async ({ browser }) => {
    const own = await extraPage(browser, withProviders(shared, ['google']))
    await own.page.goto(ACCOUNT_URL)
    await expect(form(own.page)).toContainText(en.account.password.google)
    await expect(fields(own.page).password).toBeVisible()
    await expect(fields(own.page).confirm).toBeVisible()
    await own.check()
    await own.context.close()
  })

  test('an account with an email password does not show the Google note', async ({ page }) => {
    await page.goto(ACCOUNT_URL)
    await expect(form(page).getByRole('heading', { name: en.account.password.title })).toBeVisible()
    await expect(form(page).getByText(en.account.password.google)).toHaveCount(0)
  })
})

test.describe('sign-in methods list', () => {
  const cases: { name: string; providers: ('email' | 'google')[]; expected: string[] }[] = [
    { name: 'email only', providers: ['email'], expected: [en.account.methods.email] },
    { name: 'Google only', providers: ['google'], expected: [en.account.methods.google] },
    { name: 'both', providers: ['email', 'google'], expected: [en.account.methods.email, en.account.methods.google] },
  ]
  for (const item of cases) {
    test(`${item.name}`, async ({ browser }) => {
      const own = await extraPage(browser, withProviders(shared, item.providers))
      await own.page.goto(ACCOUNT_URL)
      const list = section(own.page, 'account-methods').locator('li')
      await expect(list).toHaveText(item.expected)
      await expect(list).toHaveCount(item.providers.length)
      await own.check()
      await own.context.close()
    })
  }

  for (const [code, strings] of [['tr', tr], ['hyw', hyw]] as const) {
    test(`the list is translated in ${code}`, async ({ browser }) => {
      await setProfile(shared.id, { ui_language: code })
      const own = await extraPage(browser, withProviders(shared, ['email', 'google']))
      await own.page.goto(`/account?lng=${code}`)
      await expect(section(own.page, 'account-methods').locator('li')).toHaveText([strings.account.methods.email, strings.account.methods.google])
      await own.check()
      await own.context.close()
      await setProfile(shared.id, { ui_language: 'en' })
    })
  }
})
