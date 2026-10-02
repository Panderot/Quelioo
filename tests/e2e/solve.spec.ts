import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

const FIXTURES_DIR = join(process.cwd(), 'tests/fixtures/images')

function fixtureBuffer(name: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, name))
}

const MOCK_RESULT = {
  topic: 'Linear equations',
  question: 'Solve for x: 2x + 5 = 17',
  steps: ['Subtract 5 from both sides: 2x = 12', 'Divide both sides by 2: x = 6'],
  answer: 'x = 6',
  tip: 'Always isolate the variable last.',
  provider: 'anthropic',
  fallbackUsed: false,
}

/** Builds a real File in the page from raw bytes and dispatches a `drop` DragEvent on the dropzone. */
async function dropFile(page: Page, buffer: Buffer, name: string, mimeType: string) {
  await page.locator('[data-purpose="solve-upload-card"] [role="button"]').evaluate(
    (el, { base64, name: fileName, mimeType: type }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const file = new File([bytes], fileName, { type })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    },
    { base64: buffer.toString('base64'), name, mimeType },
  )
}

/** Builds a real File in the page and dispatches a `paste` ClipboardEvent on `document`. */
async function pasteFile(page: Page, buffer: Buffer, name: string, mimeType: string) {
  await page.evaluate(
    ({ base64, name: fileName, mimeType: type }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const file = new File([bytes], fileName, { type })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer }))
    },
    { base64: buffer.toString('base64'), name, mimeType },
  )
}

/** Every chosen photo opens the crop step first; skip it with "Use whole photo". */
async function useWholePhoto(page: Page, label: string = en.crop.useWhole) {
  await page.getByRole('button', { name: label }).click({ timeout: 20_000 })
  await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
}

test.describe('Solve — file picker, real formats', { tag: '@cross' }, () => {
  const validFixtures: { file: string; mimeType: string }[] = [
    { file: 'plain.jpg', mimeType: 'image/jpeg' },
    { file: 'exif-rotated.jpg', mimeType: 'image/jpeg' },
    { file: 'transparent.png', mimeType: 'image/png' },
    { file: 'plain.webp', mimeType: 'image/webp' },
    { file: 'plain.bmp', mimeType: 'image/bmp' },
    { file: 'icon.ico', mimeType: 'image/x-icon' },
    { file: 'plain.svg', mimeType: 'image/svg+xml' },
    { file: 'single-page.tiff', mimeType: 'image/tiff' },
    { file: 'multi-page.tiff', mimeType: 'image/tiff' },
    { file: 'preview.dng', mimeType: 'image/x-adobe-dng' },
    { file: 'animated.gif', mimeType: 'image/gif' },
  ]

  for (const { file, mimeType } of validFixtures) {
    test(`${file} uploads via picker and solves`, async ({ page, mockSolve }) => {
      const handle = await mockSolve(MOCK_RESULT)
      await page.goto('/solve?lng=en')

      await page.locator('input[type="file"]').setInputFiles({
        name: file,
        mimeType,
        buffer: fixtureBuffer(file),
      })

      await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 10_000 })
      await useWholePhoto(page)
      const previewImg = page.locator('[data-purpose="solve-cropped-preview"]')
      await expect(previewImg).toHaveAttribute('src', /^data:image\/jpeg/)

      await page.getByRole('button', { name: en.solve.cta.solve }).click()
      await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
      await expect(page.getByText(MOCK_RESULT.topic)).toBeVisible()

      const [request] = handle.requests() as { mimeType: string; note: string }[]
      expect(request.mimeType).toBe('image/jpeg')
      expect(typeof request.note).toBe('string')
    })
  }

  test('too-small.jpg shows the too_small error and resets cleanly', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'too-small.jpg',
      mimeType: 'image/jpeg',
      buffer: fixtureBuffer('too-small.jpg'),
    })
    const error = page.locator('[data-purpose="solve-error"]')
    await expect(error).toBeVisible()
    await expect(error).toContainText(en.solve.errors.too_small)

    await page.getByRole('button', { name: en.solve.errors.tryAnother }).click()
    await expect(error).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-upload-card"] img')).toHaveCount(0)
  })

  test('synthetic HEIC with no real image data fails gracefully (decode_failed), not a crash', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'synthetic-no-data.heic',
      mimeType: 'image/heic',
      buffer: fixtureBuffer('synthetic-no-data.heic'),
    })
    const error = page.locator('[data-purpose="solve-error"]')
    await expect(error).toBeVisible({ timeout: 10_000 })
    await expect(error).toContainText(en.solve.errors.decode_failed)
  })

  test('a .txt file renamed to .png is rejected as unsupported', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'notes.png',
      mimeType: 'image/png',
      buffer: Buffer.from('just some plain text, not an image at all', 'utf8'),
    })
    const error = page.locator('[data-purpose="solve-error"]')
    await expect(error).toBeVisible()
    await expect(error).toContainText(en.solve.errors.unsupported)
  })

  test('a corrupted file with valid JPEG magic bytes fails to decode gracefully', async ({ page }) => {
    await page.goto('/solve?lng=en')
    const corrupted = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not actually a jpeg body'.repeat(20))])
    await page.locator('input[type="file"]').setInputFiles({
      name: 'broken.jpg',
      mimeType: 'image/jpeg',
      buffer: corrupted,
    })
    const error = page.locator('[data-purpose="solve-error"]')
    await expect(error).toBeVisible()
    await expect(error).toContainText(en.solve.errors.decode_failed)
  })

  test('an uppercase .JPG extension still decodes (detection is magic-byte based)', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'PHOTO.JPG',
      mimeType: 'image/jpeg',
      buffer: fixtureBuffer('plain.jpg'),
    })
    await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 10_000 })
  })

  test('a HEIC file with an empty MIME type (Windows-style) is still detected from magic bytes', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'IMG_0001.HEIC',
      mimeType: '',
      buffer: fixtureBuffer('synthetic-no-data.heic'),
    })
    // No real HEIC decoder data here, so this should reach the graceful decode_failed path —
    // the point of this test is that detection-by-extension-less-empty-MIME still routes to the
    // HEIC decoder at all, not that the (synthetic, dataless) file actually renders a photo.
    const error = page.locator('[data-purpose="solve-error"]')
    await expect(error).toBeVisible({ timeout: 10_000 })
    await expect(error).toContainText(en.solve.errors.decode_failed)
  })

  test('a file over 25MB is rejected as too_large before any decode attempt', async ({ page }) => {
    await page.goto('/solve?lng=en')
    // Built in the page: shipping 26MB through setInputFiles costs seconds and adds nothing here.
    await page.locator('input[type="file"]').evaluate((input: HTMLInputElement) => {
      const bytes = new Uint8Array(26 * 1024 * 1024)
      bytes.set([0xff, 0xd8, 0xff, 0xe0])
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'huge.jpg', { type: 'image/jpeg' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const error = page.locator('[data-purpose="solve-error"]')
    await expect(error).toBeVisible()
    await expect(error).toContainText(en.solve.errors.too_large)
  })

  test('a large (~20MB) but otherwise valid JPEG still decodes successfully', async ({ page, mockSolve }) => {
    test.setTimeout(45_000)
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    // Real JPEG at the front; trailing bytes after EOI are universally ignored by JPEG decoders.
    const base = fixtureBuffer('plain.jpg')
    const padded = Buffer.concat([base, Buffer.alloc(20 * 1024 * 1024 - base.length, 0x00)])
    await page.locator('input[type="file"]').setInputFiles({
      name: 'big-but-valid.jpg',
      mimeType: 'image/jpeg',
      buffer: padded,
    })
    await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('Solve — drag-and-drop and paste', { tag: '@cross' }, () => {
  test('drag-and-drop a valid JPEG shows a preview', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await dropFile(page, fixtureBuffer('plain.jpg'), 'plain.jpg', 'image/jpeg')
    await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 10_000 })
  })

  test('drag-and-drop an unsupported file shows the unsupported error', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await dropFile(page, Buffer.from('not an image'), 'notes.txt', 'text/plain')
    const error = page.locator('[data-purpose="solve-error"]')
    await expect(error).toBeVisible()
    await expect(error).toContainText(en.solve.errors.unsupported)
  })

  test('paste a valid PNG from the clipboard shows a preview', async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'a synthetic paste with a file only reaches the page in Chromium')
    await page.goto('/solve?lng=en')
    await pasteFile(page, fixtureBuffer('transparent.png'), 'transparent.png', 'image/png')
    await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Solve — mocked API flows', () => {
  test('loading state shows while solving, then renders the result', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT, { delayMs: 1500 })
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'plain.jpg',
      mimeType: 'image/jpeg',
      buffer: fixtureBuffer('plain.jpg'),
    })
    await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 10_000 })
    await useWholePhoto(page)

    // A stable structural selector, not one bound to button text — the accessible name flips from
    // "Solve" to "Solving..." (not a substring match of each other) once the click lands.
    const primaryButton = page.locator('[data-purpose="primary-action-cta"] button').first()
    await primaryButton.click()
    await expect(page.getByText(en.solve.cta.solving)).toBeVisible()
    await expect(primaryButton).toBeDisabled()

    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    await expect(page.getByText(MOCK_RESULT.topic)).toBeVisible()
  })

  test('cancel during solving returns to the ready state with no error', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT, { delayMs: 2000 })
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'plain.jpg',
      mimeType: 'image/jpeg',
      buffer: fixtureBuffer('plain.jpg'),
    })
    await useWholePhoto(page)
    await page.getByRole('button', { name: en.solve.cta.solve }).click()
    await page.getByRole('button', { name: en.solve.cta.cancel }).click()

    await expect(page.locator('[data-purpose="solve-error"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-result"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: en.solve.cta.solve })).toBeEnabled()
  })

  test('the optional note reaches the request payload', async ({ page, mockSolve }) => {
    const handle = await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'plain.jpg',
      mimeType: 'image/jpeg',
      buffer: fixtureBuffer('plain.jpg'),
    })
    await useWholePhoto(page)
    await page.getByLabel(en.solve.note.label).fill("I don't understand step 2")
    await page.getByRole('button', { name: en.solve.cta.solve }).click()
    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()

    const [request] = handle.requests() as { note: string }[]
    expect(request.note).toBe("I don't understand step 2")
  })

  const errorCases: { code: string; status: number; messageKey: keyof typeof en.solve.errors }[] = [
    { code: 'unreadable', status: 422, messageKey: 'unreadable' },
    { code: 'not_math', status: 422, messageKey: 'not_math' },
    { code: 'upstream', status: 502, messageKey: 'upstream' },
    { code: 'not_configured', status: 503, messageKey: 'not_configured' },
    { code: 'rate_limited', status: 429, messageKey: 'rate_limited' },
  ]

  for (const { code, status, messageKey } of errorCases) {
    test(`server error "${code}" shows the correct localized message`, async ({ page, mockSolve }) => {
      await mockSolve({ error: code }, { status })
      await page.goto('/solve?lng=en')
      await page.locator('input[type="file"]').setInputFiles({
        name: 'plain.jpg',
        mimeType: 'image/jpeg',
        buffer: fixtureBuffer('plain.jpg'),
      })
      await useWholePhoto(page)
      await page.getByRole('button', { name: en.solve.cta.solve }).click()
      const error = page.locator('[data-purpose="solve-error"]')
      await expect(error).toBeVisible()
      await expect(error).toContainText(en.solve.errors[messageKey])
    })
  }

  test('the Solve button is disabled while solving (no double submit)', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT, { delayMs: 500 })
    await page.goto('/solve?lng=en')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'plain.jpg',
      mimeType: 'image/jpeg',
      buffer: fixtureBuffer('plain.jpg'),
    })
    await useWholePhoto(page)
    const solveButton = page.getByRole('button', { name: en.solve.cta.solve })
    await solveButton.click()
    await expect(page.getByRole('button', { name: en.solve.cta.solving })).toBeDisabled()
  })
})

test.describe('Solve — languages', () => {
  const cases: { lng: 'en' | 'tr' | 'hyw'; strings: typeof en }[] = [
    { lng: 'en', strings: en },
    { lng: 'tr', strings: tr },
    { lng: 'hyw', strings: hyw },
  ]

  for (const { lng, strings } of cases) {
    test(`solve flow renders in ${lng}`, async ({ page, mockSolve }) => {
      await mockSolve(MOCK_RESULT)
      await page.goto(`/solve?lng=${lng}`)
      await expect(page.getByRole('heading', { name: strings.solve.title })).toBeVisible()

      await page.locator('input[type="file"]').setInputFiles({
        name: 'plain.jpg',
        mimeType: 'image/jpeg',
        buffer: fixtureBuffer('plain.jpg'),
      })
      await useWholePhoto(page, strings.crop.useWhole)
      await page.getByRole('button', { name: strings.solve.cta.solve }).click()
      await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    })
  }
})

test('@mobile full solve flow works at 390px with no horizontal overflow', async ({ page, mockSolve }) => {
  await mockSolve(MOCK_RESULT)
  await page.goto('/solve?lng=en')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'plain.jpg',
    mimeType: 'image/jpeg',
    buffer: fixtureBuffer('plain.jpg'),
  })
  await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 10_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await useWholePhoto(page)

  await page.getByRole('button', { name: en.solve.cta.solve }).click()
  await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
