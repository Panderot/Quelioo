import { test, expect } from './fixtures'
import { fillText } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

/**
 * Reads the real rendered text color and effective (alpha-composited) background color of a
 * locator and returns their WCAG 2.1 contrast ratio — the same check a manual audit would do,
 * run against the live DOM instead of the raw design tokens, so a soft amber/5-15% badge tint or
 * a dialog nested inside another surface is measured exactly as a user would see it.
 */
async function contrastRatio(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate((el) => {
    function parse(color: string): { r: number; g: number; b: number; a: number } | null {
      const m = color.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
    }
    function over(fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number; a: number }) {
      const a = fg.a + bg.a * (1 - fg.a)
      if (a === 0) return { r: 255, g: 255, b: 255, a: 1 }
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a: 1,
      }
    }
    function effectiveBackground(node: Element | null) {
      const layers: { r: number; g: number; b: number; a: number }[] = []
      let current = node
      while (current) {
        const bg = parse(getComputedStyle(current).backgroundColor)
        if (bg && bg.a > 0) layers.push(bg)
        if (bg && bg.a === 1) break
        current = current.parentElement
      }
      let result = { r: 255, g: 255, b: 255, a: 1 }
      for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i], result)
      return result
    }
    function luminance({ r, g, b }: { r: number; g: number; b: number }) {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const v = c / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
    }

    const fg = parse(getComputedStyle(el).color)!
    const bg = effectiveBackground(el.parentElement)
    const l1 = luminance(fg)
    const l2 = luminance(bg)
    const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1]
    return (lighter + 0.05) / (darker + 0.05)
  })
}

const MIN_CONTRAST = 4.5

test('WCAG contrast: amber-text, muted, success and error text all meet 4.5:1 against their real rendered background', async ({
  page,
  mockGenerate,
}) => {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')

  // text-muted, plain on card: the info-row sentence.
  const sentence = page.getByText('Use 30 to 5,000 words per quiz.')
  expect(await contrastRatio(sentence)).toBeGreaterThanOrEqual(MIN_CONTRAST)

  // text-error, plain on card: the over-limit word counter.
  await fillText(page, Array.from({ length: 5010 }, (_, i) => `word${i}`).join(' '))
  const overLimitCounter = page.locator('[data-purpose="word-counter"]')
  expect(await contrastRatio(overLimitCounter)).toBeGreaterThanOrEqual(MIN_CONTRAST)

  // text-error inside a bg-error/5 tinted box: the too_short validation error.
  await fillText(page, 'Too short for a quiz.')
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  const validationError = page.getByRole('alert').getByText(/at least 30 words/)
  expect(await contrastRatio(validationError)).toBeGreaterThanOrEqual(MIN_CONTRAST)

  // Generate a real quiz to exercise the remaining amber-text/success surfaces.
  await fillText(page, Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '))
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

  // text-amber-text in a bg-amber/12 badge: the question-type pill, always visible.
  const typePill = page.locator('[data-purpose="question-card"]').first().getByText(/Multiple Choice|True|Fill|Short|Matching|Open/).first()
  expect(await contrastRatio(typePill)).toBeGreaterThanOrEqual(MIN_CONTRAST)

  // text-amber-text, plain on card: the "Show explanation" link (revealed by Show answers).
  await page.getByRole('switch', { name: 'Show answers' }).click()
  const showExplanation = page.getByRole('button', { name: 'Show explanation' }).first()
  expect(await contrastRatio(showExplanation)).toBeGreaterThanOrEqual(MIN_CONTRAST)

  // text-amber-text in a bg-amber/15 selected chip: the print dialog's default-selected option.
  await page.getByRole('button', { name: 'Print / PDF' }).click()
  const selectedPrintOption = page.getByRole('radio', { name: 'Question sheet' })
  expect(await contrastRatio(selectedPrintOption)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  await page.getByRole('dialog').getByLabel('Close').click()

  // text-success, plain on card: a correct MCQ check result line.
  const mcqCard = page.locator('[data-purpose="question-card"]', { hasText: 'photosynthesis' })
  await mcqCard.getByRole('radio', { name: /Carbon dioxide/ }).check()
  await mcqCard.getByRole('button', { name: 'Check answer' }).click()
  const correctLine = mcqCard.getByText('Correct!')
  await expect(correctLine).toBeVisible()
  expect(await contrastRatio(correctLine)).toBeGreaterThanOrEqual(MIN_CONTRAST)
})
