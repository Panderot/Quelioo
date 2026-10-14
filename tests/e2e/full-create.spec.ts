import type { Locator, Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }
import { seed } from './flashcardHelpers'
import { chooseOption, fillText, SHORT_TEXT } from './helpers'
import { test, expect } from './strict'

// Full coverage of the Create page (part 1): resume strip, text input, every quiz setting in the request,
// errors that keep the typed text, loading / double click, labels / keyboard / translations / layout.
// Files and URLs: full-create-files.spec.ts. The generated quiz (preview, edit, Archive, Study, Print, cards): full-create-result.spec.ts.

const generateButton = (page: Page) => page.getByRole('button', { name: 'Generate Quiz' })
const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ')
const textBox = (page: Page) => page.locator('#quiz-content-input')

/** Goes to another page through the visible navigation (top bar on desktop, tab bar on a phone). */
const navTo = (page: Page, label: RegExp) => page.locator('[data-purpose="top-nav"], [data-purpose="tab-bar"]').getByRole('link', { name: label }).click()

function requestsOf(handle: { requests: () => unknown[] }): Record<string, unknown>[] {
  return handle.requests() as Record<string, unknown>[]
}

async function generateOnce(page: Page, handle: { requests: () => unknown[] }) {
  const before = handle.requests().length
  await expect(generateButton(page)).toBeEnabled()
  await generateButton(page).click()
  await expect.poll(() => handle.requests().length).toBe(before + 1)
  await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
  await expect(generateButton(page)).toBeEnabled()
}

const QUIZ_ENTRY = {
  id: 'full-create-quiz-1',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: String(SAMPLE_QUIZ.questions.length),
  optionsCount: null,
  outputLanguage: 'en',
  sourceText: 'Seeded source text for the archived quiz.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

test.describe('Resume strip', () => {
  test('the due-card count equals the cards the review shows, and a new quiz becomes "Your last quiz"', async ({ page, mockGenerate }) => {
    await page.goto('/?lng=en')
    await seed(page, [{ id: 'deck-a', name: 'A', cards: [{ id: 'a1', front: 'q1', back: 'a1' }, { id: 'a2', front: 'q2', back: 'a2' }, { id: 'a3', front: 'q3', back: 'a3' }] }], '/?lng=en')
    const due = page.locator('[data-purpose="resume-strip"] [data-purpose="resume-due"]')
    await expect(due).toHaveText('3 cards to review today')

    await test.step('one deck with due cards opens its review with exactly that many cards', async () => {
      await due.click()
      await expect(page).toHaveURL(/\/flashcards\/deck-a\/study$/)
      await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 3')
    })

    await test.step('the Flashcards list shows the same number', async () => {
      await page.goto('/flashcards?lng=en')
      await expect(page.locator('[data-purpose="deck-row"]').first()).toContainText('3 cards to review today')
    })

    await test.step('after generating a quiz the strip offers it in study mode', async () => {
      await mockGenerate(SAMPLE_QUIZ)
      await page.goto('/?lng=en')
      await fillText(page, SHORT_TEXT)
      await generateButton(page).click()
      await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
      await navTo(page, /^Flashcards/)
      await navTo(page, /^Create/)
      const quiz = page.locator('[data-purpose="resume-strip"] [data-purpose="resume-quiz"]')
      await expect(quiz).toHaveText(`Your last quiz: ${SAMPLE_QUIZ.title}`)
      await quiz.click()
      await expect(page).toHaveURL(/\/archive\/[^?]+\?mode=study/)
      await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
    })
  })

  test('the strip links point at the right place when both items exist', async ({ page, seedArchive }) => {
    await seedArchive([QUIZ_ENTRY])
    await page.goto('/?lng=en')
    await seed(page, [{ id: 'deck-b', name: 'B', cards: [{ id: 'b1', front: 'x', back: 'y' }] }, { id: 'deck-c', name: 'C', cards: [{ id: 'c1', front: 'x', back: 'y' }] }], '/?lng=en')
    const strip = page.locator('[data-purpose="resume-strip"]')
    await expect(strip.locator('[data-purpose="resume-due"]')).toHaveText('2 cards to review today')
    await expect(strip.locator('[data-purpose="resume-due"]')).toHaveAttribute('href', '/flashcards')
    await expect(strip.locator('[data-purpose="resume-quiz"]')).toHaveAttribute('href', `/archive/${QUIZ_ENTRY.id}?mode=study`)
  })
})

test.describe('Text input', () => {
  test('29 words are blocked, 30 are accepted, 5,000 are accepted, 5,001 are blocked', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')

    await test.step('29 words: message, no request', async () => {
      await fillText(page, words(29))
      await expect(page.getByText('Word count: 29 / 5,000')).toBeVisible()
      await generateButton(page).click()
      await expect(page.getByRole('alert')).toContainText('at least 30 words')
      expect(generate.requests()).toHaveLength(0)
    })

    await test.step('5,001 words: message, no request', async () => {
      await fillText(page, words(5001))
      await expect(page.getByText('Word count: 5,001 / 5,000')).toBeVisible()
      await generateButton(page).click()
      await expect(page.getByRole('alert')).toContainText('under 5,000 words')
      expect(generate.requests()).toHaveLength(0)
    })

    await test.step('30 words: one request, the quiz appears', async () => {
      await fillText(page, words(30))
      await expect(page.getByRole('alert')).toHaveCount(0)
      await generateOnce(page, generate)
      expect(requestsOf(generate)[0].text).toBe(words(30))
    })

    await test.step('5,000 words: one more request', async () => {
      await fillText(page, words(5000))
      await expect(page.getByText('Word count: 5,000 / 5,000')).toBeVisible()
      await generateOnce(page, generate)
      expect(generate.requests()).toHaveLength(2)
    })
  })

  test('the word counter is right for Turkish and Armenian text', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, 'Çocuklar okula gidiyor, öğretmenler ders anlatıyor. Şeker ve süt aldık.')
    await expect(page.getByText('Word count: 10 / 5,000')).toBeVisible()
    await fillText(page, 'Ես կուզեմ գնալ տուն։ Այսօր եղանակը շատ լաւ է։')
    await expect(page.getByText('Word count: 9 / 5,000')).toBeVisible()
    await fillText(page, '')
    await expect(page.getByText('Word count: 0 / 5,000')).toBeVisible()
  })

  test('"Mark as focus" sends the marked part and "Clear Input" empties the text, chips and counter', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await textBox(page).evaluate((element) => {
      const box = element as HTMLTextAreaElement
      const start = box.value.indexOf('essential for life')
      box.focus()
      box.setSelectionRange(start, start + 'essential for life'.length - 1)
    })
    await page.keyboard.press('Shift+ArrowRight')
    await page.locator('[data-purpose="focus-mark-secondary"]').click()
    await expect(page.locator('[data-purpose="focus-chip"]')).toContainText('essential for life')
    await generateOnce(page, generate)
    expect(requestsOf(generate)[0].focusSnippets).toEqual(['essential for life'])

    await page.getByRole('button', { name: 'Clear Input' }).click()
    await expect(textBox(page)).toHaveValue('')
    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(0)
    await expect(page.getByText('Word count: 0 / 5,000')).toBeVisible()
  })

  test('the text stays after leaving the page and coming back, after back, and after a reload', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    await navTo(page, /^Solve/)
    await expect(page).toHaveURL(/\/solve/)
    await navTo(page, /^Create/)
    await expect(textBox(page)).toHaveValue(SHORT_TEXT)

    await navTo(page, /^Flashcards/)
    await page.goBack()
    await expect(page).toHaveURL(/\/$|\/\?/)
    await expect(textBox(page)).toHaveValue(SHORT_TEXT)

    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quelio.draft.v1') ?? '{}').textValue)).toBe(SHORT_TEXT)
    await page.reload()
    await expect(textBox(page)).toHaveValue(SHORT_TEXT)
  })

  test('empty state: no text, no request, no resume strip; Generate asks for content on every tab', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await expect(page.locator('[data-purpose="resume-strip"]')).toHaveCount(0)
    await expect(page.getByText('Word count: 0 / 5,000')).toBeVisible()
    for (const tab of ['#tab-text', '#tab-file', '#tab-url']) {
      await page.locator(tab).click()
      await generateButton(page).click()
      await expect(page.getByText('Please add some content before generating a quiz.')).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Fetch' })).toBeDisabled()
    expect(generate.requests()).toHaveLength(0)
  })
})

test.describe('Settings go into the request', () => {
  test('title, every question type, difficulty, count (Auto, minimum, maximum), options, hints, explanations and shuffle', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    await test.step('defaults', async () => {
      await generateOnce(page, generate)
      expect(requestsOf(generate)[0]).toMatchObject({
        mode: 'generate',
        questionType: 'mcq',
        questionCount: 'auto',
        difficulty: 'medium',
        optionsCount: '4',
        outputLanguage: 'auto',
        includeExplanations: true,
        includeHints: true,
        shuffleOptions: true,
      })
      expect(requestsOf(generate)[0].title).toBeUndefined()
      expect(requestsOf(generate)[0].text).toBe(SHORT_TEXT)
    })

    await test.step('every question type', async () => {
      const types: [string, string][] = [
        ['True or False', 'true-false'],
        ['Fill in the Blanks', 'fill-blanks'],
        ['Short Answer', 'short-answer'],
        ['Matching', 'matching'],
        ['Open-ended', 'open-ended'],
        ['Mixed', 'mixed'],
        ['MCQ (Multiple Choice Questions)', 'mcq'],
      ]
      for (const [label, value] of types) {
        await chooseOption(page, 'Question Type', label)
        await generateOnce(page, generate)
        const last = requestsOf(generate).at(-1)!
        expect(last.questionType).toBe(value)
        // The options count and shuffle only apply to multiple choice and mixed.
        if (value === 'mcq' || value === 'mixed') expect(last.optionsCount).toBe('4')
        else {
          expect(last.optionsCount).toBeUndefined()
          expect(last.shuffleOptions).toBe(false)
        }
      }
    })

    await test.step('difficulty', async () => {
      for (const [label, value] of [['Easy', 'easy'], ['Hard', 'hard'], ['Medium', 'medium']]) {
        await chooseOption(page, 'Difficulty Level', label)
        await generateOnce(page, generate)
        expect(requestsOf(generate).at(-1)!.difficulty).toBe(value)
      }
    })

    await test.step('question count: minimum, maximum, Auto (cover the whole text)', async () => {
      for (const [label, value] of [['3 Questions', '3'], ['20 Questions', '20'], ['Auto (cover everything)', 'auto']]) {
        await chooseOption(page, 'Question Count', label)
        await generateOnce(page, generate)
        expect(requestsOf(generate).at(-1)!.questionCount).toBe(value)
      }
    })

    await test.step('MCQ options count', async () => {
      for (const [label, value] of [['2 Options', '2'], ['5 Options', '5']]) {
        await chooseOption(page, 'MCQ Options Count', label)
        await generateOnce(page, generate)
        expect(requestsOf(generate).at(-1)!.optionsCount).toBe(value)
      }
    })

    await test.step('title, hints, explanations and shuffle switches', async () => {
      await page.getByLabel('Quiz title (optional)').fill('  My photosynthesis quiz  ')
      for (const name of ['Answer explanations', 'Hints', 'Shuffle options']) {
        const toggle = page.getByRole('switch', { name, exact: true })
        await expect(toggle).toHaveAttribute('aria-checked', 'true')
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-checked', 'false')
      }
      await generateOnce(page, generate)
      expect(requestsOf(generate).at(-1)).toMatchObject({ title: 'My photosynthesis quiz', includeExplanations: false, includeHints: false, shuffleOptions: false })

      for (const name of ['Answer explanations', 'Hints', 'Shuffle options']) await page.getByRole('switch', { name, exact: true }).click()
      await generateOnce(page, generate)
      expect(requestsOf(generate).at(-1)).toMatchObject({ includeExplanations: true, includeHints: true, shuffleOptions: true })
    })
  })

  test('output language: Auto and several languages are sent as their code', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    const languages: [string, string][] = [
      ['Türkçe', 'tr'],
      ['Հայերէն (Արեւմտահայերէն)', 'hyw'],
      ['Deutsch', 'de'],
      ['Français', 'fr'],
      ['English', 'en'],
      ['Auto', 'auto'],
    ]
    for (const [label, code] of languages) {
      await chooseOption(page, 'Output Language:', label)
      await generateOnce(page, generate)
      expect(requestsOf(generate).at(-1)!.outputLanguage).toBe(code)
    }
  })
})

test.describe('Errors keep the typed text', () => {
  const CASES: { name: string; status: number; contentType: string; body: string; message: string }[] = [
    { name: '429 too many requests', status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limited' }), message: 'Something went wrong generating your quiz. Please try again.' },
    { name: '500 server error', status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'upstream' }), message: 'Something went wrong generating your quiz. Please try again.' },
    { name: '500 model not configured', status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'model' }), message: "Quelio's AI model isn't configured correctly right now. Please try again shortly." },
    { name: '503 generation unavailable', status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not_configured' }), message: 'Quiz generation is temporarily unavailable. Please try again shortly.' },
    { name: '504 gateway timeout (HTML page, not JSON)', status: 504, contentType: 'text/html', body: '<html><body>An error occurred with your deployment</body></html>', message: "Quelio couldn't read a valid quiz this time. Please try again." },
    { name: '200 with broken JSON', status: 200, contentType: 'application/json', body: '{"title": "Broken", "questions": [', message: "Quelio couldn't read a valid quiz this time. Please try again." },
    { name: '200 without questions', status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'No questions here' }), message: "Quelio couldn't read a valid quiz this time. Please try again." },
    { name: '200 with an empty question list', status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'Empty', questions: [] }), message: "Quelio couldn't read a valid quiz this time. Please try again." },
    { name: '200 with a question list of the wrong shape', status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'Bad', questions: [{ nonsense: true }] }), message: "Quelio couldn't read a valid quiz this time. Please try again." },
  ]

  for (const failure of CASES) {
    test(`${failure.name}: clear message, text and settings stay, Try again then works`, async ({ page, strict }) => {
      if (failure.status >= 400) strict.allow(/api\/generate/, failure.status)
      let failing = true
      let calls = 0
      await page.route('**/api/generate', async (route) => {
        calls++
        if (failing) await route.fulfill({ status: failure.status, contentType: failure.contentType, body: failure.body })
        else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_QUIZ) })
      })
      await page.goto('/?lng=en')
      await fillText(page, SHORT_TEXT)
      await page.getByLabel('Quiz title (optional)').fill('Keep me')
      await chooseOption(page, 'Question Type', 'Mixed')
      await generateButton(page).click()

      await expect(page.getByRole('alert')).toHaveText(new RegExp(`${failure.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*Try again`))
      if (failure.status === 429) await expect(page.locator('[data-purpose="rate-limit-notice"]')).toHaveText('Too many requests, try again shortly.')
      await expect(textBox(page)).toHaveValue(SHORT_TEXT)
      await expect(page.getByLabel('Quiz title (optional)')).toHaveValue('Keep me')
      await expect(page.getByRole('button', { name: 'Question Type', exact: true })).toHaveText('Mixed')
      await expect(page.locator('[data-purpose="quiz-result"]')).toHaveCount(0)
      await expect(generateButton(page)).toBeEnabled()

      failing = false
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(calls).toBe(2)
      await expect(textBox(page)).toHaveValue(SHORT_TEXT)
    })
  }

  test('a request that is cut off (offline) shows the connection message and keeps the text', async ({ page }) => {
    await page.route('**/api/generate', (route) => route.abort('internetdisconnected'))
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await generateButton(page).click()
    await expect(page.getByRole('alert')).toContainText("Couldn't connect. Check your connection and try again.")
    await expect(textBox(page)).toHaveValue(SHORT_TEXT)
    await expect(generateButton(page)).toBeEnabled()
  })

  test('a failed attempt creates no Archive entry', async ({ page, strict }) => {
    strict.allow(/api\/generate/, 500)
    await page.route('**/api/generate', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'upstream' }) }))
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await generateButton(page).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await navTo(page, /^Archive/)
    await expect(page.locator('[data-purpose="archive-empty-state"]')).toBeVisible()
  })
})

test.describe('Loading and double click', () => {
  test('a double click on Generate sends one request and saves one quiz; the button shows the loading state', async ({ page }) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const requests: unknown[] = []
    await page.route('**/api/generate', async (route) => {
      requests.push(route.request().postDataJSON())
      await gate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_QUIZ) })
    })
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    await generateButton(page).dblclick()
    const busy = page.getByRole('button', { name: 'Generating your quiz...' })
    await expect(busy).toBeDisabled()
    await expect(busy).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('ul.animate-pulse')).toHaveCount(1)
    await expect.poll(() => requests.length).toBe(1)

    release()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
    expect(requests).toHaveLength(1)

    await navTo(page, /^Archive/)
    await expect(page.locator('[data-purpose="archive-list"] > li')).toHaveCount(1)
  })

  test('Enter and Space on the focused Generate button work like a click, once', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await generateButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
    expect(generate.requests()).toHaveLength(1)
    await generateButton(page).focus()
    await page.keyboard.press('Space')
    await expect.poll(() => generate.requests().length).toBe(2)
  })
})

/** Elements a user can operate that have no accessible name. */
async function unlabelled(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = (element as HTMLElement).getBoundingClientRect()
      const style = getComputedStyle(element)
      return style.visibility !== 'hidden' && style.display !== 'none' && (rect.width > 0 || rect.height > 0 || (element as HTMLElement).classList.contains('sr-only'))
    }
    const nameOf = (element: Element): string => {
      const html = element as HTMLElement
      const aria = element.getAttribute('aria-label')
      if (aria?.trim()) return aria.trim()
      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy) {
        const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
        if (text) return text
      }
      const labels = (element as HTMLInputElement).labels
      if (labels && labels.length > 0 && Array.from(labels).some((label) => label.textContent?.trim())) return 'label'
      if (html.textContent?.trim()) return html.textContent.trim()
      if (element.getAttribute('title')?.trim()) return 'title'
      if (element.tagName === 'INPUT' && (element as HTMLInputElement).placeholder) return 'placeholder'
      return ''
    }
    const selector = 'button, input:not([type="hidden"]), textarea, select, a[href], [role="button"], [role="switch"], [role="tab"], [role="radio"], [role="checkbox"]'
    return Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .filter((element) => !element.closest('[data-purpose="top-nav"], [data-purpose="tab-bar"]'))
      .filter((element) => !nameOf(element))
      .map((element) => element.outerHTML.slice(0, 120))
  })
}

test.describe('Labels, keyboard, translations, layout', () => {
  for (const lng of ['en', 'tr', 'hyw']) {
    test(`every control on every tab and in the result has an accessible name in ${lng}`, async ({ page, mockGenerate, mockExtractUrl, strict }) => {
      strict.allow(/api\/extract-url/, 502)
      await mockGenerate(SAMPLE_QUIZ)
      await mockExtractUrl({ error: 'unreachable' }, { status: 502 })
      await page.goto(`/?lng=${lng}`)
      await expect(textBox(page)).toBeVisible()
      expect(await unlabelled(page), 'text tab').toEqual([])
      await page.locator('#tab-file').click()
      await expect(page.locator('input[type="file"]')).toBeAttached()
      expect(await unlabelled(page), 'file tab').toEqual([])
      await page.locator('#tab-url').click()
      await page.locator('input[type="url"]').fill('https://example.com/a')
      await page.locator('input[type="url"]').press('Enter')
      await expect(page.getByRole('alert')).toBeVisible()
      expect(await unlabelled(page), 'url tab').toEqual([])
      await page.locator('#tab-text').click()
      await fillText(page, SHORT_TEXT)
      await page.locator('[data-purpose="primary-action-cta"] button').click()
      await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
      expect(await unlabelled(page), 'result').toEqual([])
    })
  }

  test('Tab reaches every setting and the Generate button; the input tabs work with the arrow keys', async ({ page }) => {
    await page.goto('/?lng=en')
    const seen = new Set<string>()
    await textBox(page).focus()
    for (let press = 0; press < 40; press++) {
      await page.keyboard.press('Tab')
      const descriptor = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        return element ? element.getAttribute('aria-label') || element.id || element.textContent?.trim() || element.tagName : ''
      })
      seen.add(descriptor)
      if (descriptor === 'Generate Quiz') break
    }
    for (const expected of ['btn-clear', 'param-title', 'Answer explanations', 'Shuffle options', 'Hints', 'Generate Quiz']) expect(seen, `Tab stops: ${[...seen].join(' | ')}`).toContain(expected)

    await page.locator('#tab-text').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#tab-file')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(page.locator('#tab-url')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(page.locator('#tab-text')).toHaveAttribute('aria-selected', 'true')
  })

  test('the Create catalogs have the same keys in TR, EN and HYW', async () => {
    const flatten = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key))
        : [prefix.replace(/_(zero|one|two|few|many|other)$/, '')]
    const scope = (catalog: Record<string, unknown>) =>
      new Set(['hero', 'inputCard', 'params', 'cta', 'create', 'coverage'].flatMap((namespace) => flatten(catalog[namespace], namespace)))
    const english = scope(en as Record<string, unknown>)
    for (const [name, catalog] of [['tr', tr], ['hyw', hyw]] as const) {
      const other = scope(catalog as Record<string, unknown>)
      expect([...english].filter((key) => !other.has(key)), `${name} lacks keys`).toEqual([])
      expect([...other].filter((key) => !english.has(key)), `${name} has extra keys`).toEqual([])
    }
  })

  for (const lng of ['en', 'tr', 'hyw']) {
    test(`no key name, empty label or unfilled placeholder is shown in ${lng}, in any Create state`, async ({ page, mockGenerate, mockExtractUrl, strict }) => {
      strict.allow(/api\/extract-url/, 502)
      await mockGenerate(SAMPLE_QUIZ)
      await mockExtractUrl({ error: 'unreachable' }, { status: 502 })
      const scan = async (state: string) => {
        const text = await page.evaluate(() => document.body.innerText)
        expect(text, `${state}: an i18n key is visible`).not.toMatch(/\b(hero|inputCard|params|cta|create|coverage|flashcards|archive|nav|errors|study|topbar|app)\.[A-Za-z_]+(\.[A-Za-z_]+)*/)
        expect(text, `${state}: a placeholder is unfilled`).not.toMatch(/\{\{|\}\}|undefined|NaN|\[object/)
      }
      await page.goto(`/?lng=${lng}`)
      await scan('initial')
      await page.locator('[data-purpose="primary-action-cta"] button').click()
      await scan('empty content error')
      await fillText(page, 'Too short for a quiz.')
      await page.locator('[data-purpose="primary-action-cta"] button').click()
      await expect(page.getByRole('alert')).toBeVisible()
      await scan('too short error')
      await page.locator('#tab-file').click()
      await page.locator('input[type="file"]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('png') })
      await expect(page.getByRole('alert')).toBeVisible()
      await scan('file error')
      await page.locator('#tab-url').click()
      await page.locator('input[type="url"]').fill('https://example.com/a')
      await page.locator('input[type="url"]').press('Enter')
      await expect(page.getByRole('alert')).toBeVisible()
      await scan('url error')
      await page.locator('#tab-text').click()
      await fillText(page, SHORT_TEXT)
      await page.locator('[data-purpose="primary-action-cta"] button').click()
      await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
      await scan('result')
    })
  }

  for (const lng of ['en', 'tr']) {
    test(`no price or cost text on the page, the result or the settings in ${lng}`, async ({ page, mockGenerate }) => {
      await mockGenerate(SAMPLE_QUIZ)
      const money = /[$€₺£]\s?\d|\d\s?(USD|EUR|TRY|TL|dollars?)\b|\b(price|pricing|cost|costs|credit|credits|fiyat|maliyet|ücret|kredi)\b/i
      await page.goto(`/?lng=${lng}`)
      expect(await page.evaluate(() => document.body.innerText)).not.toMatch(money)
      await fillText(page, SHORT_TEXT)
      await page.locator('[data-purpose="primary-action-cta"] button').click()
      await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
      expect(await page.evaluate(() => document.body.innerText)).not.toMatch(money)
    })
  }

  test('@mobile the Generate button is not covered by the tab bar and nothing scrolls sideways', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    const covered = async (target: Locator) => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      return target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return [rect.top + 4, rect.top + rect.height / 2, rect.bottom - 4].some((y) => {
          const hit = document.elementFromPoint(rect.left + rect.width / 2, y)
          return !hit || !element.contains(hit)
        })
      })
    }
    expect(await covered(generateButton(page)), 'the Generate button is covered at the end of the page').toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

    await generateButton(page).click()
    await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
    expect(generate.requests()).toHaveLength(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

    for (const tab of ['#tab-file', '#tab-url']) {
      await page.locator(tab).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), tab).toBe(true)
    }
  })
})
