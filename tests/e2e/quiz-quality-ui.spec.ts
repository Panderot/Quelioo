import { test, expect } from './fixtures'
import { fillText } from './helpers'
import type { ArchiveEntry } from '../../src/lib/archive'

// Mocked UI checks for quiz quality: the "supports about n questions" note (en/tr/hyw), fair Turkish
// fill-in checking, the source-hash avoid list from the Archive, regenerate-one context and older
// Archive entries without acceptedAnswers / sourceHash.

const TR_TEXT =
  'Fotosentez, yeşil bitkilerin ışık enerjisini kullanarak besin üretmesidir. Bitki suyu kökleriyle topraktan emer. Karbondioksit yapraklardaki stomalardan girer. Klorofil, ışığı soğuran yeşil pigmenttir ve kloroplast adı verilen organellerde bulunur. Üretilen glikoz, bitkinin enerji kaynağıdır.'

const fillQuestion = (id: string, question: string, answer: string, acceptableAnswers?: string[]) => ({
  id,
  type: 'fill-blanks',
  question,
  explanation: '',
  answer,
  ...(acceptableAnswers ? { acceptableAnswers } : {}),
})

const TR_QUIZ = {
  title: 'Fotosentez',
  questions: [
    fillQuestion('f1', 'Klorofil, bitki hücresinde ___ bulunur.', 'organellerde', ['organellerde']),
    fillQuestion('f2', 'Yeşil pigmentin en çok soğurduğu enerji türü: ___', 'Işık', ['Işık']),
  ],
  requestedCount: 10,
  incomplete: false,
  supportedCount: 2,
}

function card(page: import('@playwright/test').Page, index: number) {
  return page.locator('[data-purpose="question-card"]').nth(index)
}

async function check(page: import('@playwright/test').Page, index: number, value: string, labels: { answer: string; check: string }) {
  const target = card(page, index)
  await target.getByRole('textbox', { name: labels.answer }).fill(value)
  await target.getByRole('button', { name: labels.check }).click()
}

test('Turkish @mobile: supported-count note, fair fill-in checking and the source-hash avoid list', async ({ page, mockGenerate, seedArchive }) => {
  const older: ArchiveEntry = {
    id: 'older-no-hash',
    title: 'Eski quiz',
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'text',
    questionType: 'fill-blanks',
    difficulty: 'easy',
    questionCount: '3',
    optionsCount: null,
    outputLanguage: 'tr',
    sourceText: `  ${TR_TEXT.replace(/\. /g, '.\n')}  `,
    quiz: { title: 'Eski quiz', questions: [fillQuestion('o1', 'Bitki suyu ___ topraktan emer.', 'kökleriyle')] as never },
  }
  await seedArchive([older])
  const generate = await mockGenerate(TR_QUIZ)
  await page.goto('/?lng=tr')
  await fillText(page, TR_TEXT)
  await page.getByRole('button', { name: 'Quiz Oluştur' }).click()

  await expect(page.getByTestId('supported-note')).toHaveText('Bu metin yaklaşık 2 iyi soru çıkarmaya yetiyor.')
  // The older quiz from the same text (matched by hash, even without a stored hash) is sent as DATA.
  expect((generate.requests()[0] as { avoidQuestions: string[] }).avoidQuestions).toEqual(['Bitki suyu ___ topraktan emer.'])

  const labels = { answer: 'Cevabın', check: 'Cevabı kontrol et' }
  await check(page, 0, 'organel', labels)
  await expect(card(page, 0).getByText('Doğru!')).toBeVisible()
  await check(page, 0, 'kalem', labels)
  await expect(card(page, 0).getByText('Henüz değil. Tekrar dene.')).toBeVisible()
  await check(page, 1, 'isik', labels)
  await expect(card(page, 1).getByText('Doğru!')).toBeVisible()
  await check(page, 1, '  ışık . ', labels)
  await expect(card(page, 1).getByText('Doğru!')).toBeVisible()

  // The new Archive entry stores the source hash.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('quelio.archive.v1') ?? '[]') as { id: string; sourceHash?: string }[])
  expect(stored.find((entry) => entry.id !== 'older-no-hash')?.sourceHash).toMatch(/^[0-9a-z]+$/)

  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(hasHorizontalScroll).toBe(false)
})

for (const [lang, generateLabel, note] of [
  ['en', 'Generate Quiz', 'This text supports about 2 good questions.'],
  ['hyw', 'Ստեղծել քուիզ', 'Այս բնագիրը կը բաւէ մօտաւորապէս 2 լաւ հարցումի։'],
] as const) {
  test(`${lang}: the supported-count note is localized`, async ({ page, mockGenerate }) => {
    await mockGenerate(TR_QUIZ)
    await page.goto(`/?lng=${lang}`)
    await fillText(page, TR_TEXT)
    await page.getByRole('button', { name: generateLabel }).click()
    await expect(page.getByTestId('supported-note')).toHaveText(note)
  })
}

test('no note when the text supports the requested count', async ({ page, mockGenerate }) => {
  await mockGenerate({ ...TR_QUIZ, supportedCount: undefined, requestedCount: 2 })
  await page.goto('/?lng=en')
  await fillText(page, TR_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(card(page, 0)).toBeVisible()
  await expect(page.getByTestId('supported-note')).toHaveCount(0)
})

test('regenerate-one sends the other questions with their answers', async ({ page, mockGenerate }) => {
  const generate = await mockGenerate(TR_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, TR_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await page.unroute('**/api/generate')
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/generate', async (route) => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ question: fillQuestion('n1', 'Bitkinin enerji kaynağı olan şeker: ___', 'glikoz', ['glikoz']) }) })
  })
  expect(generate.requests()).toHaveLength(1)
  await card(page, 0).getByRole('button', { name: 'Regenerate' }).click()
  await expect(card(page, 0).getByText('Bitkinin enerji kaynağı olan şeker')).toBeVisible()
  expect(requests[0]).toMatchObject({
    mode: 'regenerate_one',
    otherQuestions: [{ question: 'Yeşil pigmentin en çok soğurduğu enerji türü: ___', answer: 'Işık', type: 'fill-blanks' }],
  })
})

test('older Archive entries without acceptedAnswers still check fairly', async ({ page, seedArchive }) => {
  await seedArchive([
    {
      id: 'legacy-fill',
      title: 'Eski',
      createdAt: '2025-06-01T00:00:00.000Z',
      source: 'text',
      questionType: 'fill-blanks',
      difficulty: 'easy',
      questionCount: '1',
      optionsCount: null,
      outputLanguage: 'tr',
      sourceText: TR_TEXT,
      quiz: { title: 'Eski', questions: [fillQuestion('l1', 'Bitki suyu ___ topraktan emer.', 'kökleriyle')] as never },
    },
  ])
  await page.goto('/archive/legacy-fill?lng=tr')
  const labels = { answer: 'Cevabın', check: 'Cevabı kontrol et' }
  await check(page, 0, 'kök', labels)
  await expect(card(page, 0).getByText('Doğru!')).toBeVisible()
  await check(page, 0, 'kalem', labels)
  await expect(card(page, 0).getByText('Henüz değil. Tekrar dene.')).toBeVisible()
})
