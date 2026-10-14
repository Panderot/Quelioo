import type { FileChooser, Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { ARTICLE_SENTENCES, ARTICLE_TEXT, buildDocx, buildPdf } from '../fixtures/files'
import { countWords } from '../../src/lib/textStats'
import { fillText } from './helpers'
import { test, expect } from './strict'

// Create, file tab (PDF, DOCX, TXT, MD and every failure) and URL tab (a valid article and every failure).
//
// URL tab note: the real /api/extract-url handler refuses localhost and every private address (api/_lib/ssrf.ts), so a
// local test server cannot be fetched through it. The responses are mocked here with the exact status and body shapes of
// api/_lib/extract-url.ts (400 invalid_url / blocked_address / youtube_not_supported, 422 no_readable_text, 502 unreachable /
// not_html / too_many_redirects, 504 timeout); the browser side (messages, retry, generate from the article) runs for real.

const generateButton = (page: Page) => page.getByRole('button', { name: 'Generate Quiz' })
const fileInput = (page: Page) => page.locator('input[type="file"]')
const navTo = (page: Page, label: RegExp) => page.locator('[data-purpose="top-nav"], [data-purpose="tab-bar"]').getByRole('link', { name: label }).click()
const ARTICLE_WORDS = countWords(ARTICLE_TEXT)

async function openFileTab(page: Page, lng = 'en') {
  await page.goto(`/?lng=${lng}`)
  await page.locator('#tab-file').click()
  await expect(fileInput(page)).toBeAttached()
}

async function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await fileInput(page).setInputFiles({ name, mimeType, buffer })
}

/** Resolves once the Create draft (extracted file text) is in IndexedDB, so a reload really restores it. */
async function waitForSavedCreateDraft(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const request = indexedDB.open('quelio-page-drafts')
            request.onerror = () => resolve(false)
            request.onsuccess = () => {
              const db = request.result
              if (!db.objectStoreNames.contains('drafts')) return resolve(false)
              const get = db.transaction('drafts').objectStore('drafts').get('create')
              get.onsuccess = () => resolve(Boolean(get.result?.data?.file?.extractedText))
              get.onerror = () => resolve(false)
            }
          }),
      ),
    )
    .toBe(true)
}

test.describe('File tab: files that are read', () => {
  const READABLE: { name: string; mimeType: string; build: () => Buffer; contains: string[] }[] = [
    { name: 'plants.pdf', mimeType: 'application/pdf', build: () => buildPdf(ARTICLE_SENTENCES), contains: ['Photosynthesis is the process', 'Without this process'] },
    { name: 'plants.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', build: () => buildDocx([ARTICLE_SENTENCES.slice(0, 3).join(' '), ARTICLE_SENTENCES.slice(3).join(' ')]), contains: ['Photosynthesis is the process', 'Without this process'] },
    { name: 'plants.txt', mimeType: 'text/plain', build: () => Buffer.from(ARTICLE_TEXT, 'utf8'), contains: ['Photosynthesis is the process', 'Without this process'] },
    { name: 'plants.md', mimeType: 'text/markdown', build: () => Buffer.from(`# Plants\n\n${ARTICLE_TEXT}\n\n- leaves\n- roots\n`, 'utf8'), contains: ['Photosynthesis is the process', '- roots'] },
    { name: 'TURKCE.TXT', mimeType: 'text/plain', build: () => Buffer.from('Çocuklar okula gidiyor ve öğretmenler ders anlatıyor. ' + ARTICLE_TEXT, 'utf8'), contains: ['Çocuklar okula', 'Without this process'] },
  ]

  for (const file of READABLE) {
    test(`${file.name} is read in the browser and its text goes into the request`, async ({ page, mockGenerate }) => {
      const generate = await mockGenerate(SAMPLE_QUIZ)
      await openFileTab(page)
      await upload(page, file.name, file.mimeType, file.build())

      await expect(page.getByText(file.name, { exact: true })).toBeVisible()
      await expect(page.getByText(/ · \d+ words$/)).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)

      await generateButton(page).click()
      await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
      const [payload] = generate.requests() as [{ text: string }]
      for (const part of file.contains) expect(payload.text).toContain(part)
    })
  }

  test('preview, edit as text and remove', async ({ page }) => {
    await openFileTab(page)
    await upload(page, 'plants.txt', 'text/plain', Buffer.from(ARTICLE_TEXT, 'utf8'))
    await expect(page.getByText(`${ARTICLE_WORDS} words`)).toBeVisible()

    await page.getByRole('button', { name: 'Show preview' }).click()
    await expect(page.getByText('Chlorophyll inside the leaves', { exact: false }).last()).toBeVisible()
    await page.getByRole('button', { name: 'Hide preview' }).click()
    await expect(page.getByRole('button', { name: 'Show preview' })).toBeVisible()

    await page.getByRole('button', { name: 'Edit as text' }).click()
    await expect(page.locator('#tab-text')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#quiz-content-input')).toHaveValue(ARTICLE_TEXT)

    await page.locator('#tab-file').click()
    await page.getByRole('button', { name: 'Remove file' }).click()
    await expect(page.getByText('Drag and drop a file here')).toBeVisible()
  })

  test('a file longer than 5,000 words is cut to 5,000 with a note', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await openFileTab(page)
    await upload(page, 'long.txt', 'text/plain', Buffer.from(Array.from({ length: 6000 }, () => 'word').join(' ')))
    await expect(page.getByText(/ · 5,?000 words$/)).toBeVisible()
    await expect(page.getByText('Only the first 5,000 words are used.')).toBeVisible()
    await generateButton(page).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
    const [payload] = generate.requests() as [{ text: string }]
    expect(countWords(payload.text)).toBe(5000)
  })

  test('the file chip stays after leaving the page and after a reload', async ({ page }) => {
    await openFileTab(page)
    await upload(page, 'plants.txt', 'text/plain', Buffer.from(ARTICLE_TEXT, 'utf8'))
    await expect(page.getByText('plants.txt', { exact: true })).toBeVisible()

    await navTo(page, /^Solve/)
    await navTo(page, /^Create/)
    await expect(page.getByText('plants.txt', { exact: true })).toBeVisible()

    await waitForSavedCreateDraft(page)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quelio.draft.v1') ?? '{}').activeTab)).toBe('file')
    await page.reload()
    await expect(page.getByText('plants.txt', { exact: true })).toBeVisible()
    await expect(page.getByText(`${ARTICLE_WORDS} words`)).toBeVisible()
  })

  test('the drop zone can be reached and opened with the keyboard', async ({ page }) => {
    await openFileTab(page)
    const zone = page.getByRole('button', { name: /Drag and drop a file here/ })
    // The zone can re-render while the saved draft loads and drop focus: retry focus + Enter until the chooser opens.
    let files!: FileChooser
    await expect(async () => {
      await zone.focus()
      await expect(zone).toBeFocused()
      const chooser = page.waitForEvent('filechooser', { timeout: 2_000 })
      await page.keyboard.press('Enter')
      files = await chooser
    }).toPass({ timeout: 20_000 })
    await files.setFiles({ name: 'keyboard.txt', mimeType: 'text/plain', buffer: Buffer.from(ARTICLE_TEXT) })
    await expect(page.getByText('keyboard.txt', { exact: true })).toBeVisible()
  })
})

test.describe('File tab: files that are refused', () => {
  const REFUSED: { name: string; file: string; mimeType: string; build: () => Buffer; message: string; pdfLog?: boolean }[] = [
    { name: 'corrupt PDF', file: 'broken.pdf', mimeType: 'application/pdf', build: () => Buffer.from('this is certainly not a pdf document, only some bytes'), message: "This file couldn't be read. It may be corrupted.", pdfLog: true },
    { name: 'password-protected PDF', file: 'secret.pdf', mimeType: 'application/pdf', build: () => buildPdf(ARTICLE_SENTENCES, { encrypted: true }), message: 'This PDF is password-protected. Remove the password and try again.', pdfLog: true },
    { name: 'scanned PDF without text', file: 'scan.pdf', mimeType: 'application/pdf', build: () => buildPdf([]), message: 'This looks like a scanned PDF with no selectable text', pdfLog: true },
    { name: 'corrupt DOCX', file: 'broken.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', build: () => Buffer.from('PK this is not a real zip archive'), message: "This file couldn't be read. It may be corrupted." },
    { name: 'empty file', file: 'empty.txt', mimeType: 'text/plain', build: () => Buffer.alloc(0), message: 'This file appears to be empty.' },
    { name: 'blank file (spaces only)', file: 'blank.txt', mimeType: 'text/plain', build: () => Buffer.from('   \n\n   '), message: 'This file appears to be empty.' },
    { name: 'file with too few words', file: 'short.txt', mimeType: 'text/plain', build: () => Buffer.from('Only a few words in here.'), message: "This file doesn't have enough text" },
    { name: 'unsupported type (image)', file: 'photo.png', mimeType: 'image/png', build: () => Buffer.from('not really a png'), message: "This file type isn't supported. Use a PDF, DOCX, TXT or MD file." },
    { name: 'unsupported type (old Word)', file: 'old.doc', mimeType: 'application/msword', build: () => Buffer.from('legacy'), message: "This file type isn't supported." },
    { name: 'file without extension', file: 'README', mimeType: 'text/plain', build: () => Buffer.from(ARTICLE_TEXT), message: "This file type isn't supported." },
    { name: 'file over 10 MB', file: 'huge.txt', mimeType: 'text/plain', build: () => Buffer.alloc(10 * 1024 * 1024 + 1, 'a'), message: 'This file is too large. Please use a file under 10MB.' },
  ]

  for (const refused of REFUSED) {
    test(`${refused.name}: a clear message, no quiz request, another file can be chosen`, async ({ page, mockGenerate, strict }) => {
      // pdf.js reports an unreadable PDF through the console; that is the deliberate path under test.
      if (refused.pdfLog) strict.allowConsole(/.*/)
      const generate = await mockGenerate(SAMPLE_QUIZ)
      await openFileTab(page)
      await upload(page, refused.file, refused.mimeType, refused.build())

      const alert = page.getByRole('alert')
      await expect(alert).toContainText(refused.message)
      await expect(alert.getByRole('button', { name: 'Choose another file' })).toBeVisible()

      await generateButton(page).click()
      await expect(page.getByText('Please add some content before generating a quiz.')).toBeVisible()
      expect(generate.requests()).toHaveLength(0)

      await upload(page, 'good.txt', 'text/plain', Buffer.from(ARTICLE_TEXT))
      await expect(page.getByText('good.txt', { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    })
  }

  test('typed text is not lost when a bad file is chosen on the file tab', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, ARTICLE_TEXT)
    await page.locator('#tab-file').click()
    await fileInput(page).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('x') })
    await expect(page.getByRole('alert')).toContainText("This file type isn't supported.")
    await page.locator('#tab-text').click()
    await expect(page.locator('#quiz-content-input')).toHaveValue(ARTICLE_TEXT)
  })
})

test.describe('URL tab', () => {
  const urlBox = (page: Page) => page.locator('input[type="url"]')
  const fetchButton = (page: Page) => page.getByRole('button', { name: 'Fetch' })

  async function openUrlTab(page: Page, lng = 'en') {
    await page.goto(`/?lng=${lng}`)
    await page.locator('#tab-url').click()
    await expect(urlBox(page)).toBeVisible()
  }

  test('a valid article is read, shown with its title and word count, and used for the quiz', async ({ page, mockExtractUrl, mockGenerate }) => {
    const extract = await mockExtractUrl({ title: 'How plants make food', text: ARTICLE_TEXT, wordCount: ARTICLE_WORDS, truncated: false })
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await openUrlTab(page)

    await expect(fetchButton(page)).toBeDisabled()
    await urlBox(page).fill('https://example.com/plants')
    await fetchButton(page).click()

    await expect(page.getByText('How plants make food', { exact: true })).toBeVisible()
    await expect(page.getByText(`${ARTICLE_WORDS} words`)).toBeVisible()
    expect(extract.requests()).toEqual([{ url: 'https://example.com/plants' }])

    await page.getByRole('button', { name: 'Show preview' }).click()
    await expect(page.getByText('Chlorophyll inside the leaves').last()).toBeVisible()

    await generateButton(page).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
    const [payload] = generate.requests() as [{ text: string }]
    expect(payload.text).toBe(ARTICLE_TEXT)
  })

  test('Enter fetches, editing the address clears the result, a long article carries the 5,000-word note, Edit as text moves it to the Text tab', async ({ page, mockExtractUrl }) => {
    await mockExtractUrl({ title: 'Long article', text: ARTICLE_TEXT, wordCount: 5000, truncated: true })
    await openUrlTab(page)
    await urlBox(page).fill('https://example.com/long')
    await urlBox(page).press('Enter')
    await expect(page.getByText('Long article', { exact: true })).toBeVisible()
    await expect(page.getByText('Only the first 5,000 words are used.')).toBeVisible()

    await urlBox(page).fill('https://example.com/other')
    await expect(page.getByText('Long article', { exact: true })).toHaveCount(0)

    await urlBox(page).press('Enter')
    await page.getByRole('button', { name: 'Edit as text' }).click()
    await expect(page.locator('#tab-text')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#quiz-content-input')).toHaveValue(ARTICLE_TEXT)
  })

  test('an article with too little text is read but the quiz asks for more words', async ({ page, mockExtractUrl, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await mockExtractUrl({ title: 'Tiny page', text: 'Only a handful of words live on this page.', wordCount: 9, truncated: false })
    await openUrlTab(page)
    await urlBox(page).fill('https://example.com/tiny')
    await fetchButton(page).click()
    await expect(page.getByText('Tiny page', { exact: true })).toBeVisible()
    await generateButton(page).click()
    await expect(page.getByRole('alert')).toContainText('at least 30 words')
    expect(generate.requests()).toHaveLength(0)
  })

  const FAILURES: { name: string; status: number; body: string; contentType: string; message: string; typed: string }[] = [
    { name: 'a page that does not exist (404 at the target)', status: 502, body: JSON.stringify({ error: 'unreachable' }), contentType: 'application/json', message: "Couldn't reach that page. Check the address and try again.", typed: 'https://example.com/missing' },
    { name: 'a page that is not HTML (PDF, image, JSON)', status: 502, body: JSON.stringify({ error: 'not_html' }), contentType: 'application/json', message: "That link doesn't point to a readable web page.", typed: 'https://example.com/file.pdf' },
    { name: 'a page without readable text', status: 422, body: JSON.stringify({ error: 'no_readable_text' }), contentType: 'application/json', message: "Couldn't find readable article text on that page", typed: 'https://example.com/app' },
    { name: 'an invalid address', status: 400, body: JSON.stringify({ error: 'invalid_url' }), contentType: 'application/json', message: "That doesn't look like a valid web address.", typed: 'not a web address' },
    { name: 'a private address', status: 400, body: JSON.stringify({ error: 'blocked_address' }), contentType: 'application/json', message: "This address can't be fetched for security reasons.", typed: 'http://localhost:3000/' },
    { name: 'a YouTube link', status: 400, body: JSON.stringify({ error: 'youtube_not_supported' }), contentType: 'application/json', message: "YouTube links aren't supported yet", typed: 'https://www.youtube.com/watch?v=abc' },
    { name: 'a slow page', status: 504, body: JSON.stringify({ error: 'timeout' }), contentType: 'application/json', message: 'That page took too long to respond. Please try again.', typed: 'https://example.com/slow' },
    { name: 'a redirect loop', status: 502, body: JSON.stringify({ error: 'too_many_redirects' }), contentType: 'application/json', message: 'That link redirects too many times.', typed: 'https://example.com/loop' },
    { name: 'a platform error page instead of JSON', status: 500, body: '<html>An error occurred</html>', contentType: 'text/html', message: 'Something went wrong reading that page. Please try again.', typed: 'https://example.com/boom' },
  ]

  for (const failure of FAILURES) {
    test(`${failure.name}: a clear message, the typed address stays, Try again works`, async ({ page, strict }) => {
      strict.allow(/api\/extract-url/, failure.status)
      let failing = true
      await page.route('**/api/extract-url', async (route) => {
        if (failing) await route.fulfill({ status: failure.status, contentType: failure.contentType, body: failure.body })
        else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'Recovered', text: ARTICLE_TEXT, wordCount: ARTICLE_WORDS, truncated: false }) })
      })
      await openUrlTab(page)
      await urlBox(page).fill(failure.typed)
      await fetchButton(page).click()

      await expect(page.getByRole('alert')).toContainText(failure.message)
      await expect(urlBox(page)).toHaveValue(failure.typed)
      await expect(page.getByText('Recovered')).toHaveCount(0)

      failing = false
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByText('Recovered', { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    })
  }

  test('a cut-off request shows the connection message', async ({ page }) => {
    await page.route('**/api/extract-url', (route) => route.abort('internetdisconnected'))
    await openUrlTab(page)
    await urlBox(page).fill('https://example.com/a')
    await fetchButton(page).click()
    await expect(page.getByRole('alert')).toContainText("Couldn't connect. Check your connection and try again.")
    await expect(urlBox(page)).toHaveValue('https://example.com/a')
  })

  test('while a page is being fetched the button is disabled and the loading text shows; a double click sends one request', async ({ page }) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const requests: unknown[] = []
    await page.route('**/api/extract-url', async (route) => {
      requests.push(route.request().postDataJSON())
      await gate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'Slow article', text: ARTICLE_TEXT, wordCount: ARTICLE_WORDS, truncated: false }) })
    })
    await openUrlTab(page)
    await urlBox(page).fill('https://example.com/slow-article')
    await fetchButton(page).dblclick()
    await expect(page.getByText('Fetching the page...')).toBeVisible()
    await expect(page.locator('input[type="url"] + button')).toBeDisabled()
    await expect.poll(() => requests.length).toBe(1)
    release()
    await expect(page.getByText('Slow article', { exact: true })).toBeVisible()
    expect(requests).toHaveLength(1)
  })

  test('the address is kept after leaving the page and after a reload', async ({ page }) => {
    await openUrlTab(page)
    await urlBox(page).fill('https://example.com/kept')
    await navTo(page, /^Solve/)
    await navTo(page, /^Create/)
    await expect(urlBox(page)).toHaveValue('https://example.com/kept')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quelio.draft.v1') ?? '{}').urlValue)).toBe('https://example.com/kept')
    await page.reload()
    await expect(page.locator('#tab-url')).toHaveAttribute('aria-selected', 'true')
    await expect(urlBox(page)).toHaveValue('https://example.com/kept')
  })
})
