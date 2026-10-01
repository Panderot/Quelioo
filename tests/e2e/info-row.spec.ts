import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'

const OVER_LIMIT_TEXT = Array.from({ length: 5010 }, (_, i) => `word${i}`).join(' ')

test.describe('Info row: sentence + word counter', () => {
  test('English: sentence and counter format, counter stays neutral under the minimum', async ({ page }) => {
    await page.goto('/?lng=en')
    await expect(page.getByText('Use 30 to 5,000 words per quiz.')).toBeVisible()
    const counter = page.locator('[data-purpose="word-counter"]')
    await expect(counter).toHaveText('Word count: 0 / 5,000')

    await fillText(page, 'Too short for a quiz.')
    await expect(counter).toHaveText('Word count: 5 / 5,000')
    await expect(counter).toHaveCSS('color', 'rgb(107, 111, 133)') // --color-muted, not red
  })

  test('Turkish: localized sentence and counter format', async ({ page }) => {
    await page.goto('/?lng=tr')
    await expect(page.getByText('Her quiz için 30 ile 5.000 kelime arası metin kullanabilirsin.')).toBeVisible()
    await expect(page.locator('[data-purpose="word-counter"]')).toHaveText('Kelime sayısı: 0 / 5.000')
  })

  test('Western Armenian: localized sentence and counter format', async ({ page }) => {
    await page.goto('/?lng=hyw')
    await expect(page.getByText('Իւրաքանչիւր քուիզի համար 30-էն 5,000 բառ գործածէ։')).toBeVisible()
    await expect(page.locator('[data-purpose="word-counter"]')).toHaveText('Բառերու թիւ. 0 / 5,000')
  })

  test('over 5,000 words the counter turns dark red, in every language', async ({ page }) => {
    for (const [lng, expected] of [
      ['en', 'Word count: 5,010 / 5,000'],
      ['tr', 'Kelime sayısı: 5.010 / 5.000'],
      ['hyw', 'Բառերու թիւ. 5,010 / 5,000'],
    ] as const) {
      await page.goto(`/?lng=${lng}`)
      await fillText(page, OVER_LIMIT_TEXT)
      const counter = page.locator('[data-purpose="word-counter"]')
      await expect(counter).toHaveText(expected)
      await expect(counter).toHaveCSS('color', 'rgb(194, 58, 58)') // --color-error
    }
  })

  test('the counter applies to whichever tab is active (File/URL), not just Text', async ({ page, mockExtractUrl }) => {
    await mockExtractUrl({ title: 'Sample Article', text: SHORT_TEXT, wordCount: 53, truncated: false })
    await page.goto('/?lng=en')
    await page.getByRole('tab', { name: 'URL' }).click()
    await page.locator('input[type="url"]').fill('https://example.com/article')
    await page.getByRole('button', { name: 'Fetch' }).click()
    await expect(page.locator('[data-purpose="word-counter"]')).toHaveText('Word count: 53 / 5,000')
  })
})

test.describe('Info row: layout', () => {
  test('at 1280px the two blocks sit on one row, top-aligned to the first line', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only: asserts the >=640px row layout')
    await page.goto('/?lng=en')

    const textBlock = page.getByText('Use 30 to 5,000 words per quiz.')
    const langRow = page.locator('[data-purpose="output-language-row"]')
    const [textBox, langBox] = await Promise.all([textBlock.boundingBox(), langRow.boundingBox()])
    expect(textBox).not.toBeNull()
    expect(langBox).not.toBeNull()
    // Same row (label sits to the right, not below) and top-aligned (not vertically centered).
    expect(langBox!.x).toBeGreaterThan(textBox!.x)
    expect(Math.abs(langBox!.y - textBox!.y)).toBeLessThanOrEqual(4)

    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })

  test('@mobile at 390px the Output Language selector drops to its own full-width row below the counter, no overlap', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'mobile-only: asserts the <640px stacked layout')
    await page.goto('/?lng=en')

    const counter = page.locator('[data-purpose="word-counter"]')
    const langRow = page.locator('[data-purpose="output-language-row"]')
    const select = page.locator('#output-lang')
    const [counterBox, langRowBox, selectBox] = await Promise.all([counter.boundingBox(), langRow.boundingBox(), select.boundingBox()])
    expect(counterBox).not.toBeNull()
    expect(langRowBox).not.toBeNull()
    expect(selectBox).not.toBeNull()

    // The whole Output Language row sits below the counter — full width, not beside it.
    expect(langRowBox!.y).toBeGreaterThanOrEqual(counterBox!.y + counterBox!.height)
    expect(langRowBox!.width).toBeGreaterThan(250)
    // The selector sits below its own label inside that row, not overlapping it.
    expect(selectBox!.y).toBeGreaterThanOrEqual(langRowBox!.y)

    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })
})
