import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { testEnv } from './env'
import { en, hyw, tr } from './locales'
import { admin, adminLink, cleanupTestUsers, createTestUser, PASSWORD, signIn, signInBrowser, testEmail } from './helpers'

// Sign-up, sign-in, sign-out, wrong password, password reset, protected routes and link errors
// against the TEST project. No real email is ever sent: the email endpoints are answered by the test
// and confirmation / recovery links come from the admin API.

test.afterAll(async () => {
  await cleanupTestUsers()
})

const fakeSignupResponse = (email: string) => ({
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: '',
  email,
  phone: '',
  confirmation_sent_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_anonymous: false,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [{ identity_id: 'x', id: 'x', user_id: 'x', identity_data: {}, provider: 'email' }],
})

async function submitSignUp(page: Page, email: string, password: string, acceptTerms = true) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  if (acceptTerms) await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: en.auth.signUp.submit }).click()
}

test.describe('sign up', () => {
  test('needs the terms and a password of 8+ characters, then shows "check your email"', async ({ page }) => {
    const bodies: Record<string, unknown>[] = []
    await page.route('**/auth/v1/signup**', async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSignupResponse('x@example.com')) })
    })
    await page.goto('/sign-up?lng=en')
    await expect(page.locator('[data-purpose="sign-up-form"]')).toBeVisible()

    const email = testEmail('signup-ui')
    await submitSignUp(page, email, 'Abcdef1', true) // 7 characters
    await expect(page.getByText(en.auth.passwordTooShort)).toBeVisible()
    expect(bodies).toHaveLength(0)

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('checkbox').uncheck()
    await page.getByRole('button', { name: en.auth.signUp.submit }).click()
    await expect(page.getByText(en.auth.signUp.termsRequired)).toBeVisible()
    expect(bodies).toHaveLength(0)

    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: en.auth.signUp.submit }).click()
    await expect(page).toHaveURL(/\/check-email/)
    await expect(page.getByRole('heading', { name: en.auth.checkEmail.title })).toBeVisible()
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ email, data: { ui_language: 'en' } })
    expect(bodies[0].code_challenge).toBeTruthy() // PKCE
  })

  test('the legal links open the draft pages in a new tab, so the form is kept', async ({ page }) => {
    await page.goto('/sign-up?lng=en')
    await page.getByLabel('Email').fill('keep-me@example.com')
    for (const [name, path] of [['Terms of Use', '/kullanim-sartlari'], ['Privacy Notice', '/gizlilik']] as const) {
      const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name }).click()])
      await expect(popup).toHaveURL(new RegExp(`${path}$`))
      await expect(popup.locator('[data-purpose="legal-draft-notice"]')).toBeVisible()
      await popup.close()
    }
    await expect(page.getByLabel('Email')).toHaveValue('keep-me@example.com')
  })

  test('opening the confirmation link signs the new account in and creates the profile', async ({ page }) => {
    const email = testEmail('confirm')
    const link = await adminLink('signup', email)
    await page.goto(`/auth/callback?token_hash=${link.tokenHash}&type=${link.type}`)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('[data-purpose="sidebar-navigation"]')).toBeVisible()
    await expect(page.locator('[data-purpose="user-menu"]')).toBeVisible()
    const profile = await admin.from('profiles').select('role, ui_language').eq('id', link.userId).single()
    expect(profile.data).toMatchObject({ role: 'user', ui_language: 'en' })
    const subscription = await admin.from('subscriptions').select('plan, status').eq('user_id', link.userId).single()
    expect(subscription.data).toMatchObject({ plan: 'free', status: 'active' })
    // Reload: the session persists.
    await page.reload()
    await expect(page.locator('[data-purpose="user-menu"]')).toBeVisible()
  })

  test('the same link cannot be used twice', async ({ page, browser }) => {
    const link = await adminLink('signup', testEmail('twice'))
    await page.goto(`/auth/callback?token_hash=${link.tokenHash}&type=${link.type}`)
    await expect(page.locator('[data-purpose="user-menu"]')).toBeVisible()
    const other = await browser.newContext()
    const second = await other.newPage()
    await second.goto(`/auth/callback?token_hash=${link.tokenHash}&type=${link.type}`)
    await expect(second.getByRole('heading', { name: new RegExp(`${en.auth.callback.expiredTitle}|${en.auth.callback.invalidTitle}`) })).toBeVisible()
    await other.close()
  })
})

test.describe('sign in and out', () => {
  test('a wrong password and an unknown email show the same generic message', async ({ page }) => {
    const user = await createTestUser('wrongpw')
    await page.goto('/sign-in?lng=en')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill('not-the-password-1')
    await page.getByRole('button', { name: en.auth.signIn.submit }).click()
    await expect(page.getByText(en.auth.signIn.invalid)).toBeVisible()

    await page.getByLabel('Email').fill(testEmail('nobody'))
    await page.getByRole('button', { name: en.auth.signIn.submit }).click()
    await expect(page.getByText(en.auth.signIn.invalid)).toBeVisible()
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('signing in returns to the page the visitor came from', async ({ page }) => {
    const user = await createTestUser('login')
    await page.goto('/flashcards?q=cap&lng=en')
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fflashcards%3Fq%3Dcap/)
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: en.auth.signIn.submit }).click()
    await expect(page).toHaveURL(/\/flashcards\?q=cap/)
    await expect(page.locator('[data-purpose="user-menu"]')).toBeVisible()
  })

  test('a sign-in return path can only be a path on this site', async ({ page }) => {
    const user = await createTestUser('openredirect')
    for (const next of ['//evil.example', 'https://evil.example/', '/\\evil.example']) {
      await page.goto(`/sign-in?lng=en&next=${encodeURIComponent(next)}`)
      await page.getByLabel('Email').fill(user.email)
      await page.getByLabel('Password').fill(PASSWORD)
      await page.getByRole('button', { name: en.auth.signIn.submit }).click()
      await expect(page).toHaveURL(/localhost:\d+\/$/)
      await page.evaluate(() => window.localStorage.clear())
    }
  })

  test('sign out from the user menu ends the session, also in another tab of the same browser', async ({ browser }) => {
    const user = await createTestUser('signout')
    const context = await browser.newContext()
    await signInBrowser(context, user)
    const first = await context.newPage()
    await first.goto('/flashcards?lng=en')
    await expect(first.locator('[data-purpose="user-menu"]')).toBeVisible()
    const second = await context.newPage()
    await second.goto('/solve?lng=en')
    await expect(second.locator('[data-purpose="user-menu"]')).toBeVisible()

    await first.locator('[data-purpose="user-menu"]').getByRole('button').first().click()
    await first.getByRole('menuitem', { name: en.userMenu.signOut }).click()
    await expect(first).toHaveURL(/\/sign-in/)
    // The other tab follows through onAuthStateChange.
    await expect(second).toHaveURL(/\/sign-in/)
    await first.reload()
    await expect(first).toHaveURL(/\/sign-in/)
    await context.close()
  })

  test('every private page redirects a signed-out visitor to sign-in with a return URL', async ({ page }) => {
    for (const path of ['/', '/solve', '/archive', '/songs', '/flashcards', '/lessons', '/account', '/owner']) {
      await page.goto(path)
      // The home page needs no return URL: signing in lands there anyway.
      await expect(page).toHaveURL(path === '/' ? /\/sign-in$/ : new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}`))
    }
    // The public pages stay open.
    for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/kullanim-sartlari', '/gizlilik']) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
    }
  })
})

test.describe('password reset', () => {
  test('forgot password says the same thing for any email, then a recovery link sets a new password', async ({ page }) => {
    const user = await createTestUser('reset')
    // The test answers the email endpoint itself so no real email is sent.
    await page.route('**/auth/v1/recover**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.goto('/forgot-password?lng=en')
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: en.auth.forgot.submit }).click()
    await expect(page.getByRole('heading', { name: en.auth.forgot.sentTitle })).toBeVisible()
    const known = await page.locator('[data-purpose="auth-card"]').innerText()

    await page.goto('/forgot-password?lng=en')
    await page.getByLabel('Email').fill(testEmail('unknown'))
    await page.getByRole('button', { name: en.auth.forgot.submit }).click()
    await expect(page.getByRole('heading', { name: en.auth.forgot.sentTitle })).toBeVisible()
    // Same screen apart from the typed address.
    expect((await page.locator('[data-purpose="auth-card"]').innerText()).replace(/\S+@\S+/g, '')).toBe(known.replace(/\S+@\S+/g, ''))

    const link = await adminLink('recovery', user.email)
    await page.goto(`/auth/callback?token_hash=${link.tokenHash}&type=${link.type}`)
    await expect(page).toHaveURL(/\/reset-password/)
    await page.getByLabel(en.auth.reset.newPassword).fill('short')
    await page.getByLabel(en.auth.confirmPassword).fill('short')
    await page.getByRole('button', { name: en.auth.reset.submit }).click()
    await expect(page.getByRole('alert').filter({ hasText: en.auth.passwordTooShort })).toBeVisible()

    const next = 'Brand-New-Pass-7'
    await page.getByLabel(en.auth.reset.newPassword).fill(next)
    await page.getByLabel(en.auth.confirmPassword).fill(next)
    await page.getByRole('button', { name: en.auth.reset.submit }).click()
    await expect(page.getByText(en.auth.reset.success)).toBeVisible()
    // The new password works; the old one does not.
    await signIn(user.email, next)
    await expect(signIn(user.email, PASSWORD)).rejects.toThrow()
  })

  test('opening the reset page without a recovery session offers a new link', async ({ page }) => {
    await page.goto('/reset-password?lng=en')
    await expect(page.getByText(en.auth.reset.noSession)).toBeVisible()
    await expect(page.getByRole('link', { name: en.auth.reset.requestNew })).toBeVisible()
  })
})

test.describe('expired and invalid links', () => {
  test('an invalid token', async ({ page }) => {
    await page.goto('/auth/callback?token_hash=definitely-not-valid&type=signup&lng=en')
    await expect(page.getByRole('heading', { name: new RegExp(`${en.auth.callback.expiredTitle}|${en.auth.callback.invalidTitle}`) })).toBeVisible()
    await expect(page.getByRole('link', { name: en.auth.callback.requestNew })).toBeVisible()
  })

  test('an expired link reported by the server in the URL hash', async ({ page }) => {
    await page.goto('/auth/callback?lng=en#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    await expect(page.getByRole('heading', { name: en.auth.callback.expiredTitle })).toBeVisible()
    await page.getByRole('link', { name: en.auth.callback.requestNew }).click()
    await expect(page).toHaveURL(/\/(forgot-password|check-email)/)
  })

  test('a callback with no parameters', async ({ page }) => {
    await page.goto('/auth/callback?lng=en')
    await expect(page.getByRole('heading', { name: new RegExp(`${en.auth.callback.expiredTitle}|${en.auth.callback.invalidTitle}`) })).toBeVisible()
  })
})

test.describe('languages and mobile', () => {
  for (const [code, strings] of [['en', en], ['tr', tr], ['hyw', hyw]] as const) {
    test(`sign-in page in ${code}`, async ({ page }) => {
      await page.goto(`/sign-in?lng=${code}`)
      await expect(page.getByRole('heading', { name: strings.auth.signIn.title })).toBeVisible()
      await expect(page.getByRole('button', { name: strings.auth.signIn.submit })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', code)
      await page.goto(`/sign-up?lng=${code}`)
      await expect(page.getByRole('heading', { name: strings.auth.signUp.title })).toBeVisible()
    })
  }

  test('@mobile sign-in and sign-up fit a phone screen', async ({ page }) => {
    for (const path of ['/sign-in?lng=tr', '/sign-up?lng=hyw', '/forgot-password?lng=en', '/check-email?lng=tr']) {
      await page.goto(path)
      await expect(page.locator('[data-purpose="auth-card"]')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    }
  })

  test('@mobile signed in: the drawer has the user menu and the account page fits a phone', async ({ browser }) => {
    const user = await createTestUser('mobile-account', { displayName: 'Mobile Mia' })
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await signInBrowser(context, user)
    const page = await context.newPage()
    await page.goto('/?lng=en')
    await page.getByRole('button', { name: en.nav.openMenu }).click()
    const menu = page.locator('[data-purpose="user-menu"]')
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('Mobile Mia')
    await menu.getByRole('button').first().click()
    await page.getByRole('menuitem', { name: en.userMenu.account }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('heading', { name: en.account.title, level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await context.close()
  })

  test('Google sign-in is hidden until the provider is enabled in the project', async ({ page }) => {
    const settings = await (await page.request.get(`${testEnv.url}/auth/v1/settings`, { headers: { apikey: testEnv.publishableKey } })).json()
    await page.goto('/sign-in?lng=en')
    await expect(page.locator('[data-purpose="sign-in-form"]')).toBeVisible()
    const enabled = settings?.external?.google === true
    await expect(page.locator('[data-purpose="google-sign-in"]')).toHaveCount(enabled ? 1 : 0)
  })
})

