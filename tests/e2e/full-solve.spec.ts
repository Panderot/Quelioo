import { test, expect } from './strict'
import { dropBigFile, dropFile, dropZone, fileInput, fixtureBuffer, MOCK_RESULT, pasteFile, pickPhoto, solveButton, solveError, solveResult, waitForCropStep } from './fullSolveHelpers'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

const LOCALES = { en, tr, hyw } as const
type Lng = keyof typeof LOCALES

test.describe('Solve (full) — empty state and adding a photo', () => {
  test('empty state: title, drop zone, a disabled Solve button, no result and no error', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await expect(page.getByRole('heading', { name: en.solve.title })).toBeVisible()
    await expect(dropZone(page)).toBeVisible()
    await expect(page.getByRole('button', { name: en.solve.upload.browse, exact: true })).toBeVisible()
    await expect(solveButton(page)).toBeDisabled()
    await expect(solveResult(page)).toHaveCount(0)
    await expect(solveError(page)).toHaveCount(0)
  })

  test('the file input is the camera-capable one: images only, rear camera on phones, labelled', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await expect(fileInput(page)).toHaveAttribute('capture', 'environment')
    await expect(fileInput(page)).toHaveAttribute('accept', /image\/\*/)
    await expect(fileInput(page)).toHaveAccessibleName(en.solve.upload.browse)
  })

  test('"Choose a photo" opens the file chooser; a chosen photo opens the crop step and enables Solve', async ({ page }) => {
    await page.goto('/solve?lng=en')
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: en.solve.upload.browse, exact: true }).click()])
    await chooser.setFiles({ name: 'plain.jpg', mimeType: 'image/jpeg', buffer: fixtureBuffer('plain.jpg') })
    await waitForCropStep(page)
    // Solve is active as soon as the photo is loaded, without confirming the crop first.
    await expect(solveButton(page)).toBeEnabled()
  })

  test('the keyboard reaches the drop zone and the Choose button; Enter on the zone opens the file chooser', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await expect(dropZone(page)).toBeVisible()
    await dropZone(page).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: en.solve.upload.browse, exact: true })).toBeFocused()
    await dropZone(page).focus()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
    await chooser.setFiles({ name: 'plain.png', mimeType: 'image/png', buffer: fixtureBuffer('transparent.png') })
    await waitForCropStep(page)
  })

  for (const { file, mimeType } of [
    { file: 'plain.jpg', mimeType: 'image/jpeg' },
    { file: 'transparent.png', mimeType: 'image/png' },
    { file: 'plain.webp', mimeType: 'image/webp' },
  ]) {
    test(`drag and drop accepts ${file}`, async ({ page }) => {
      await page.goto('/solve?lng=en')
      await expect(dropZone(page)).toBeVisible()
      await dropFile(page, fixtureBuffer(file), file, mimeType)
      await waitForCropStep(page)
      await expect(solveError(page)).toHaveCount(0)
    })
  }

  test('Ctrl+V paste of an image opens the crop step; a paste without an image does nothing', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await expect(dropZone(page)).toBeVisible()
    await pasteFile(page, Buffer.from('plain text, no image'), 'notes.txt', 'text/plain')
    await expect(dropZone(page)).toBeVisible()
    await expect(solveError(page)).toHaveCount(0)
    await pasteFile(page, fixtureBuffer('transparent.png'), 'transparent.png', 'image/png')
    await waitForCropStep(page)
  })

  test('a file over 25 MB is rejected with a message and the page stays usable', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await expect(dropZone(page)).toBeVisible()
    await dropBigFile(page, 26)
    await expect(solveError(page)).toContainText(en.solve.errors.too_large)
    await expect(solveButton(page)).toBeDisabled()
    await page.getByRole('button', { name: en.solve.errors.tryAnother }).click()
    await expect(solveError(page)).toHaveCount(0)
    await expect(dropZone(page)).toBeVisible()
  })

  test('a non-image file (PDF, text) is rejected with a message', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await fileInput(page).setInputFiles({ name: 'homework.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not an image') })
    await expect(solveError(page)).toContainText(en.solve.errors.unsupported)
    await expect(solveError(page)).toHaveAttribute('role', 'alert')
    await page.getByRole('button', { name: en.solve.errors.tryAnother }).click()
    await fileInput(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(solveError(page)).toContainText(en.solve.errors.unsupported)
  })
})

test.describe('Solve (full) — replace, remove and re-pick', () => {
  test('Replace photo opens the chooser, drops the old result and opens the crop step for the new photo', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: en.solve.upload.replacePhoto }).click()])
    await chooser.setFiles({ name: 'plain.webp', mimeType: 'image/webp', buffer: fixtureBuffer('plain.webp') })
    await waitForCropStep(page)
    await expect(solveResult(page)).toHaveCount(0)
    await expect(solveButton(page)).toBeEnabled()
  })

  test('New question removes the photo and the result; Solve is disabled again', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()

    await page.getByRole('button', { name: en.solve.upload.newQuestion }).click()
    await expect(dropZone(page)).toBeVisible()
    await expect(solveResult(page)).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toHaveCount(0)
    await expect(solveButton(page)).toBeDisabled()
  })

  test('Change crop reopens the crop step and Solve then sends exactly one request', async ({ page, mockSolve }) => {
    const handle = await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await page.getByRole('button', { name: en.solve.upload.changeCrop }).click()
    await waitForCropStep(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()
    expect(handle.requests()).toHaveLength(1)
  })
})

test.describe('Solve (full) — page state', () => {
  test('the empty page survives a reload and the browser back button', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await expect(dropZone(page)).toBeVisible()
    await page.reload()
    await expect(dropZone(page)).toBeVisible()
    await expect(solveButton(page)).toBeDisabled()

    await page.goto('/archive?lng=en')
    await expect(page.getByRole('tab', { name: en.archive.tabs.quizzes })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/solve/)
    await expect(dropZone(page)).toBeVisible()
  })

  test('the note field is labelled, and the Solve button has an accessible name', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await expect(page.getByLabel(en.solve.note.label)).toBeVisible()
    await expect(page.getByRole('button', { name: en.solve.cta.solve, exact: true })).toBeEnabled()
  })
})

test.describe('Solve (full) — translations, labels and cost text', () => {
  test('the TR, EN and HYW files have identical key sets and no empty text', () => {
    const flatten = (value: unknown, prefix = ''): [string, string][] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key))
        : [[prefix, String(value)]]
    const keys = (locale: object) => flatten(locale).map(([key]) => key).sort()
    expect(keys(tr)).toEqual(keys(en))
    expect(keys(hyw)).toEqual(keys(en))
    for (const locale of [en, tr, hyw]) {
      const empty = flatten({ solve: locale.solve, crop: locale.crop }).filter(([, text]) => text.trim() === '')
      expect(empty).toEqual([])
    }
  })

  for (const lng of ['en', 'tr', 'hyw'] as Lng[]) {
    test(`${lng}: no raw key names and no unlabelled control on the empty, cropping and solved views`, async ({ page, mockSolve }) => {
      const strings = LOCALES[lng]
      await mockSolve(MOCK_RESULT)
      await page.goto(`/solve?lng=${lng}`)
      await expect(page.getByRole('heading', { name: strings.solve.title })).toBeVisible()

      const audit = async (view: string) => {
        const report = await page.evaluate(() => {
          const visible = (el: Element) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
          }
          const unlabelled: string[] = []
          for (const el of Array.from((document.querySelector('main') ?? document.body).querySelectorAll<HTMLElement>('button, a[href], input, textarea, [role="button"], [role="switch"], [role="tab"]'))) {
            if (el instanceof HTMLInputElement && el.type === 'file') {
              if (el.closest('[data-purpose="solve-upload-card"]') && !el.getAttribute('aria-label')) unlabelled.push('file input')
              continue
            }
            if (!visible(el)) continue
            const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.innerText ?? '').trim() || ((el as HTMLInputElement).labels?.length ?? 0) > 0
            if (!labelled) unlabelled.push(el.outerHTML.slice(0, 80))
          }
          const rawKeys = document.body.innerText.match(/\b[a-z][a-zA-Z]+(?:\.[a-zA-Z_]+){2,}\b/g) ?? []
          return { unlabelled, rawKeys }
        })
        expect(report.unlabelled, `${lng} ${view}: unlabelled controls`).toEqual([])
        expect(report.rawKeys, `${lng} ${view}: raw translation keys on screen`).toEqual([])
      }

      await audit('empty')
      await pickPhoto(page, 'plain.jpg', 'image/jpeg', strings.crop.useWhole)
      await audit('photo')
      await solveButton(page).click()
      await expect(solveResult(page)).toBeVisible()
      await audit('solved')
    })
  }

  test('no price, cost, token or provider wording on the empty, error and solved views', async ({ page, mockSolve }) => {
    const FORBIDDEN = /\$|maliyet|\bcosts?\b|\bprices?\b|\btokens?\b|önbellek|cached|provider|openai|anthropic|դոլար|ծախս/i
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN)
    await fileInput(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
    await expect(solveError(page)).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN)
    await page.getByRole('button', { name: en.solve.errors.tryAnother }).click()
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN)
  })
})

test.describe('Solve (full) — layout at 1280 and 390', () => {
  test('1280: top bar present, no tab bar, no sideways scroll', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/solve?lng=en')
    await expect(page.locator('[data-purpose="top-nav"]')).toBeVisible()
    await expect(page.locator('[data-purpose="tab-bar"]')).toBeHidden()
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })

  test('@mobile 390: the tab bar never covers the Solve button, the result actions or the footer', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/solve?lng=en')
    const tabBar = page.locator('[data-purpose="tab-bar"]')
    await expect(tabBar).toBeVisible()

    const expectAboveTabBar = async (selector: string, label: string) => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const bar = await tabBar.boundingBox()
      const box = await page.locator(selector).last().boundingBox()
      expect(bar, 'tab bar box').not.toBeNull()
      expect(box, `${label} box`).not.toBeNull()
      expect(box!.y + box!.height, `${label} bottom is above the tab bar`).toBeLessThanOrEqual(bar!.y + 1)
    }

    await pickPhoto(page)
    await expectAboveTabBar('[data-purpose="primary-action-cta"] button', 'Solve button')
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()
    await expectAboveTabBar('[data-purpose="solve-result"] > p', 'result footer note')
    await expect(page.locator('[data-purpose="solution-actions"]').getByRole('button', { name: en.solve.actions.checkWork })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })

  test('@mobile 390: the empty page fits and the Choose button opens the chooser', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/solve?lng=en')
    await expect(dropZone(page)).toBeVisible()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: en.solve.upload.browse, exact: true }).click()])
    await chooser.setFiles({ name: 'plain.jpg', mimeType: 'image/jpeg', buffer: fixtureBuffer('plain.jpg') })
    await waitForCropStep(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })
})
