import { test, expect } from '@playwright/test'

const TR_SAMPLE = `
Türk kahvesi, Osmanlı İmparatorluğu döneminde 16. yüzyılda yaygınlaşmış geleneksel bir kahve
pişirme yöntemidir. Kahve çekirdekleri çok ince öğütülür ve cezve adı verilen küçük bir tencerede
şekerle birlikte yavaşça pişirilir. Türk kahvesi, 2013 yılında UNESCO tarafından Somut Olmayan
Kültürel Miras Listesi'ne dahil edilmiştir. Kahve içildikten sonra fincanın tabağa kapatılıp
soğutulması ve ardından fincanın içindeki telve ile fal bakılması Türk kültüründe yaygın bir
gelenektir.
`.trim()

test('GET /api/generate returns 405', async ({ request }) => {
  const response = await request.get('/api/generate')
  expect(response.status()).toBe(405)
})

test('POST with an invalid body returns a clean error code, not a crash', async ({ request }) => {
  const response = await request.post('/api/generate', { data: { mode: 'generate' } })
  const body = await response.json()
  expect(body).toHaveProperty('error')
  expect(typeof body.error).toBe('string')
})

test('one real generation from a short Turkish paragraph returns 3 valid, grounded questions', async ({ request }) => {
  const response = await request.post('/api/generate', {
    data: {
      mode: 'generate',
      text: TR_SAMPLE,
      questionType: 'mcq',
      questionCount: '3',
      difficulty: 'medium',
      optionsCount: '4',
      outputLanguage: 'auto',
    },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  expect(Array.isArray(body.questions)).toBe(true)
  expect(body.questions).toHaveLength(3)
  for (const question of body.questions) {
    expect(question.type).toBe('mcq')
    expect(question.options).toHaveLength(4)
    expect(question.answerIndex).toBeGreaterThanOrEqual(0)
    expect(question.answerIndex).toBeLessThan(4)
    expect(question.question.length).toBeGreaterThan(0)
  }
})
