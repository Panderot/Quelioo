import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

const MOCK_RESULT = {
  topic: 'Linear equations',
  question: 'Solve for x: $3x + 7 = 2x + 15$',
  intro: 'The goal is to isolate $x$.',
  steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
  answer: '$x = 8$',
  tip: 'Do the same operation on both sides.',
  mistakes: ['Forgetting to change the sign when moving $7$ across.', 'Subtracting $2x$ from only one side.'],
  provider: 'openai',
  fallbackUsed: false,
}

type Rgb = [number, number, number]
const RED: Rgb = [220, 20, 20]
const GREEN: Rgb = [20, 200, 20]
const BLUE: Rgb = [20, 20, 220]
const BLACK: Rgb = [10, 10, 10]

/** Renders a PNG in the page: four solid quadrants (TL red, TR green, BL blue, BR black). */
async function makeQuadrantPng(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ width: w, height: h, colors }) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      const halfW = Math.floor(w / 2)
      const halfH = Math.floor(h / 2)
      const rects: [number, number, number, number][] = [
        [0, 0, halfW, halfH],
        [halfW, 0, w - halfW, halfH],
        [0, halfH, halfW, h - halfH],
        [halfW, halfH, w - halfW, h - halfH],
      ]
      rects.forEach((rect, index) => {
        ctx.fillStyle = `rgb(${colors[index].join(',')})`
        ctx.fillRect(...rect)
      })
      return canvas.toDataURL('image/png').split(',')[1]
    },
    { width, height, colors: [RED, GREEN, BLUE, BLACK] },
  )
  return Buffer.from(base64, 'base64')
}

async function choosePhoto(page: Page, buffer: Buffer, name = 'photo.png', mimeType = 'image/png') {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })
  await expect(page.locator('[data-purpose="crop-image"]')).toBeVisible({ timeout: 15_000 })
  // Wait for the stage to measure itself and the preview to finish loading.
  await expect
    .poll(() => page.locator('[data-purpose="crop-image"]').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
}

async function stageBox(page: Page) {
  const box = await page.locator('[data-purpose="crop-stage"]').boundingBox()
  if (!box) throw new Error('crop stage not visible')
  return box
}

/** Reads the cropped upload JPEG back: its size and the color at its center. */
async function readCroppedPreview(page: Page): Promise<{ width: number; height: number; center: Rgb }> {
  const preview = page.locator('[data-purpose="solve-cropped-preview"]')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('src', /^data:image\/jpeg/)
  return preview.evaluate(async (img: HTMLImageElement) => {
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1).data
    return { width: img.naturalWidth, height: img.naturalHeight, center: [data[0], data[1], data[2]] as [number, number, number] }
  })
}

function expectColor(actual: Rgb, expected: Rgb) {
  actual.forEach((channel, index) => expect(Math.abs(channel - expected[index])).toBeLessThan(40))
}

/** Drags the SE corner handle to the stage center with the mouse: crop = top-left quadrant. */
async function dragCornerToCenter(page: Page) {
  const box = await stageBox(page)
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 4 })
  await page.mouse.move(box.x + box.width / 2 - 4, box.y + box.height / 2 - 4, { steps: 4 })
  await page.mouse.up()
}

test.describe('Solve crop step', () => {
  test('mouse crop maps to the expected region of the original', async ({ page, mockSolve }) => {
    const handle = await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))

    await expect(page.getByRole('button', { name: en.solve.cta.solve })).toBeDisabled()
    await dragCornerToCenter(page)
    await page.getByRole('button', { name: en.crop.useArea }).click()

    const cropped = await readCroppedPreview(page)
    expect(Math.abs(cropped.width - 400)).toBeLessThanOrEqual(4)
    expect(Math.abs(cropped.height - 300)).toBeLessThanOrEqual(4)
    expectColor(cropped.center, RED)

    await page.getByRole('button', { name: en.solve.cta.solve }).click()
    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    const [request] = handle.requests() as { imageBase64: string; mimeType: string }[]
    expect(request.mimeType).toBe('image/jpeg')
    expect(request.imageBase64).toBe(await page.locator('[data-purpose="solve-cropped-preview"]').getAttribute('src'))
  })

  test('rotation right then crop maps through the rotation', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    const before = await stageBox(page)
    await page.getByRole('button', { name: en.crop.rotateRight }).click()
    await expect.poll(async () => (await stageBox(page)).height > (await stageBox(page)).width).toBe(true)
    expect(before.width).toBeGreaterThan(before.height)

    await dragCornerToCenter(page)
    await page.getByRole('button', { name: en.crop.useArea }).click()
    const cropped = await readCroppedPreview(page)
    // Clockwise: the original bottom-left (blue) is now top-left, 300x400.
    expect(Math.abs(cropped.width - 300)).toBeLessThanOrEqual(4)
    expect(Math.abs(cropped.height - 400)).toBeLessThanOrEqual(4)
    expectColor(cropped.center, BLUE)
  })

  test('rotation left, reset and skip use the whole photo', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))

    await page.getByRole('button', { name: en.crop.rotateLeft }).click()
    await dragCornerToCenter(page)
    await page.getByRole('button', { name: en.crop.useArea }).click()
    let cropped = await readCroppedPreview(page)
    // Counter-clockwise: the original top-right (green) is now top-left.
    expectColor(cropped.center, GREEN)

    // "Change crop" restores the previous rotation and box; Reset returns to the whole, unrotated photo.
    await page.getByRole('button', { name: en.solve.upload.changeCrop }).click()
    const stage = await stageBox(page)
    expect(stage.height).toBeGreaterThan(stage.width)
    const cropBox = await page.locator('[data-purpose="crop-box"]').boundingBox()
    expect(cropBox!.width).toBeLessThan(stage.width * 0.6)

    await page.getByRole('button', { name: en.crop.reset }).click()
    await expect.poll(async () => (await stageBox(page)).width > (await stageBox(page)).height).toBe(true)
    const resetStage = await stageBox(page)
    const resetBox = await page.locator('[data-purpose="crop-box"]').boundingBox()
    expect(Math.abs(resetBox!.width - resetStage.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(resetBox!.height - resetStage.height)).toBeLessThanOrEqual(1)

    await dragCornerToCenter(page)
    await page.getByRole('button', { name: en.crop.useWhole }).click()
    cropped = await readCroppedPreview(page)
    expect(cropped.width).toBe(800)
    expect(cropped.height).toBe(600)
    await expect(page.getByRole('button', { name: en.solve.upload.replacePhoto })).toBeVisible()
  })

  test('keyboard: arrows move, Shift+arrows resize, and the box has a minimum size', async ({ page }) => {
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    const box = page.locator('[data-purpose="crop-box"]')
    await box.focus()
    for (let i = 0; i < 25; i += 1) await page.keyboard.press('Shift+ArrowLeft')
    for (let i = 0; i < 25; i += 1) await page.keyboard.press('Shift+ArrowUp')
    for (let i = 0; i < 25; i += 1) await page.keyboard.press('ArrowRight')

    const stage = await stageBox(page)
    const rect = (await box.boundingBox())!
    expect(Math.abs(rect.width - stage.width / 2)).toBeLessThanOrEqual(3)
    expect(Math.abs(rect.x - (stage.x + stage.width / 2))).toBeLessThanOrEqual(3)

    await page.getByRole('button', { name: en.crop.useArea }).click()
    const cropped = await readCroppedPreview(page)
    expectColor(cropped.center, GREEN)

    // Minimum size: shrinking far past zero stops at a usable box.
    await page.getByRole('button', { name: en.solve.upload.changeCrop }).click()
    await box.focus()
    for (let i = 0; i < 60; i += 1) await page.keyboard.press('Shift+ArrowLeft')
    const tiny = (await box.boundingBox())!
    expect(tiny.width).toBeGreaterThanOrEqual(46)

    // Dragging a corner past the opposite corner also stops at the minimum size.
    const stage2 = await stageBox(page)
    const current = (await box.boundingBox())!
    await page.mouse.move(current.x + 3, current.y + 3)
    await page.mouse.down()
    await page.mouse.move(stage2.x + stage2.width, stage2.y + stage2.height, { steps: 5 })
    await page.mouse.up()
    const clamped = (await box.boundingBox())!
    expect(clamped.width).toBeGreaterThanOrEqual(46)
    expect(clamped.height).toBeGreaterThanOrEqual(46)
  })

  const shapes = [
    { label: 'very tall', width: 600, height: 6000 },
    { label: 'very wide', width: 6000, height: 400 },
    { label: 'tiny', width: 220, height: 220 },
    { label: 'landscape photo', width: 1600, height: 1200 },
  ]
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const shape of shapes) {
      test(`${shape.label} image is fully visible at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await page.goto('/solve?lng=en')
        await choosePhoto(page, await makeQuadrantPng(page, shape.width, shape.height))
        const stage = page.locator('[data-purpose="crop-stage"]')
        await stage.scrollIntoViewIfNeeded()
        const box = (await stage.boundingBox())!
        const card = (await page.locator('[data-purpose="solve-upload-card"]').boundingBox())!

        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
        expect(box.x).toBeGreaterThanOrEqual(card.x)
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width)
        expect(box.height).toBeLessThanOrEqual(viewport.height * (viewport.width < 768 ? 0.6 : 0.7) + 1)

        // Not clipped or distorted: the rendered image keeps the photo's aspect ratio and fills the stage.
        const img = (await page.locator('[data-purpose="crop-image"]').boundingBox())!
        expect(Math.abs(img.width - box.width)).toBeLessThanOrEqual(1)
        expect(Math.abs(img.height - box.height)).toBeLessThanOrEqual(1)
        const aspect = shape.width / shape.height
        expect(Math.abs(box.width / box.height - aspect) / aspect).toBeLessThan(0.05)

        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
      })
    }
  }

  test('@mobile touch drag and pinch resize the crop box', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'multi-touch needs the touch-enabled Chromium project (driven via CDP)')
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((point, id) => ({ x: point.x, y: point.y, id })),
      })

    const stage = await stageBox(page)
    // One finger: drag the SE corner to the center.
    await touch('touchStart', [{ x: stage.x + stage.width - 4, y: stage.y + stage.height - 4 }])
    await touch('touchMove', [{ x: stage.x + stage.width * 0.7, y: stage.y + stage.height * 0.7 }])
    await touch('touchMove', [{ x: stage.x + stage.width / 2 - 4, y: stage.y + stage.height / 2 - 4 }])
    await touch('touchEnd', [])
    const box = page.locator('[data-purpose="crop-box"]')
    const afterDrag = (await box.boundingBox())!
    expect(Math.abs(afterDrag.width - stage.width / 2)).toBeLessThanOrEqual(4)

    // Two fingers: pinch outwards inside the box to grow it around its center.
    const cx = afterDrag.x + afterDrag.width / 2
    const cy = afterDrag.y + afterDrag.height / 2
    await touch('touchStart', [{ x: cx - 20, y: cy }])
    await touch('touchStart', [
      { x: cx - 20, y: cy },
      { x: cx + 20, y: cy },
    ])
    await touch('touchMove', [
      { x: cx - 30, y: cy },
      { x: cx + 30, y: cy },
    ])
    await touch('touchMove', [
      { x: cx - 40, y: cy },
      { x: cx + 40, y: cy },
    ])
    await touch('touchEnd', [])
    const afterPinch = (await box.boundingBox())!
    expect(afterPinch.width).toBeGreaterThan(afterDrag.width * 1.4)

    await page.getByRole('button', { name: en.crop.useArea }).click()
    await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })

  test('@mobile crop actions stack full width at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    const card = (await page.locator('[data-purpose="solve-upload-card"]').boundingBox())!
    for (const name of [en.crop.useArea, en.crop.useWhole]) {
      const button = (await page.getByRole('button', { name }).boundingBox())!
      expect(button.width).toBeGreaterThan(card.width - 60)
    }
  })
})

test.describe('Solve result extras', () => {
  test('multiple problems show a choice list; choosing one sends only that choice', async ({ page }) => {
    const problems = ['1) $2x + 3 = 11$', '2) $5y - 4 = 21$']
    const requests: { problem?: string; imageBase64: string }[] = []
    await page.route('**/api/solve', async (route) => {
      const body = route.request().postDataJSON() as { problem?: string; imageBase64: string }
      requests.push(body)
      const response = body.problem ? MOCK_RESULT : { problems, provider: 'openai', fallbackUsed: false }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
    })
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    await page.getByRole('button', { name: en.crop.useWhole }).click()
    await page.getByRole('button', { name: en.solve.cta.solve }).click()

    const choicesCard = page.locator('[data-purpose="solve-choices"]')
    await expect(choicesCard.getByRole('heading', { name: en.solve.choices.title })).toBeVisible()
    await expect(choicesCard.getByRole('button')).toHaveCount(3)
    await choicesCard.getByRole('button').nth(1).click()

    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    await expect(choicesCard).toHaveCount(0)
    expect(requests).toHaveLength(2)
    expect(requests[0].problem).toBeUndefined()
    expect(requests[1].problem).toBe(problems[1])
    expect(requests[1].imageBase64).toBe(requests[0].imageBase64)
  })

  test('"Crop the photo" from the choice list reopens the crop step', async ({ page, mockSolve }) => {
    await mockSolve({ problems: ['1) $x + 1 = 2$', '2) $x - 1 = 2$'], provider: 'openai', fallbackUsed: false })
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    await page.getByRole('button', { name: en.crop.useWhole }).click()
    await page.getByRole('button', { name: en.solve.cta.solve }).click()
    await page.getByRole('button', { name: en.solve.choices.cropAction }).click()
    await expect(page.locator('[data-purpose="crop-step"]')).toBeVisible()
    await expect(page.locator('[data-purpose="solve-choices"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: en.solve.cta.solve })).toBeDisabled()
  })

  test('intro line, compact aligned answer and common mistakes render', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    await page.getByRole('button', { name: en.crop.useWhole }).click()
    await page.getByRole('button', { name: en.solve.cta.solve }).click()

    const result = page.locator('[data-purpose="solve-result"]')
    await expect(result.locator('[data-purpose="solve-intro"]')).toContainText('The goal is to isolate')
    await expect(result.locator('ol > li')).toHaveCount(2)

    const answer = (await result.locator('[data-purpose="solve-answer"]').boundingBox())!
    const stepText = (await result.locator('ol > li').first().locator('span').nth(1).boundingBox())!
    expect(Math.abs(answer.x - stepText.x)).toBeLessThanOrEqual(2)
    expect(answer.height).toBeLessThan(48)

    const mistakes = result.locator('[data-purpose="solve-mistakes"]')
    await expect(mistakes).toContainText(en.solve.result.mistakeLabel)
    await expect(mistakes.locator('li')).toHaveCount(2)
    await expect(mistakes.locator('svg').first()).toBeVisible()
  })

  test('mistakes and intro are hidden when absent (older response shape)', async ({ page, mockSolve }) => {
    const { intro: _intro, mistakes: _mistakes, ...legacy } = MOCK_RESULT
    void _intro
    void _mistakes
    await mockSolve(legacy)
    await page.goto('/solve?lng=en')
    await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
    await page.getByRole('button', { name: en.crop.useWhole }).click()
    await page.getByRole('button', { name: en.solve.cta.solve }).click()
    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    await expect(page.locator('[data-purpose="solve-mistakes"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-intro"]')).toHaveCount(0)
  })

  for (const { lng, strings } of [
    { lng: 'en', strings: en },
    { lng: 'tr', strings: tr },
    { lng: 'hyw', strings: hyw },
  ]) {
    test(`crop, choices and mistakes are localized in ${lng}`, async ({ page }) => {
      let call = 0
      await page.route('**/api/solve', async (route) => {
        call += 1
        const response = call === 1 ? { problems: ['1) $a$', '2) $b$'], provider: 'openai', fallbackUsed: false } : MOCK_RESULT
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
      })
      await page.goto(`/solve?lng=${lng}`)
      await choosePhoto(page, await makeQuadrantPng(page, 800, 600))
      for (const label of [strings.crop.rotateLeft, strings.crop.rotateRight, strings.crop.reset, strings.crop.useArea]) {
        await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
      }
      await page.getByRole('button', { name: strings.crop.useWhole, exact: true }).click()
      await expect(page.getByRole('button', { name: strings.solve.upload.changeCrop })).toBeVisible()
      await expect(page.getByRole('button', { name: strings.solve.upload.replacePhoto })).toBeVisible()
      await page.getByRole('button', { name: strings.solve.cta.solve, exact: true }).click()
      await expect(page.getByRole('heading', { name: strings.solve.choices.title })).toBeVisible()
      await expect(page.getByRole('button', { name: strings.solve.choices.cropAction })).toBeVisible()
      await page.locator('[data-purpose="solve-choices"] li button').first().click()
      await expect(page.locator('[data-purpose="solve-mistakes"]')).toContainText(strings.solve.result.mistakeLabel)
    })
  }
})
