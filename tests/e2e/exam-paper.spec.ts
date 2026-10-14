import { strFromU8, unzipSync } from 'fflate'
import type { Page } from '@playwright/test'

import { buildExamDocx, buildExamZip, examFileName } from '../../src/lib/exam/docx'
import { buildGroup } from '../../src/lib/exam/groups'
import { detectPaperLang, examPaperLang } from '../../src/lib/exam/paperLabels'
import { lacksPrintPageNumbers } from '../../src/lib/exam/browser'
import { latexToOmml } from '../../src/lib/exam/omml'
import type { WrittenExam } from '../../src/lib/exam/types'
import { sampleExam } from '../fixtures/exam'
import { expect, test } from './fixtures'

const exam = sampleExam()

function docxFiles(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, data]) => [name, strFromU8(data)]))
}

/** Visible text of WordprocessingML: the w:t / m:t contents in order. */
function plain(xml: string): string {
  return [...xml.matchAll(/<(?:w|m):t(?: [^>]*)?>([^<]*)<\/(?:w|m):t>/g)].map((m) => m[1]).join('')
}

test.describe('LaTeX to OMML', () => {
  test('fractions, roots, scripts, symbols and unknown commands', () => {
    expect(latexToOmml('\\frac{1}{2}')).toBe(
      '<m:oMath><m:f><m:num><m:r><m:t xml:space="preserve">1</m:t></m:r></m:num><m:den><m:r><m:t xml:space="preserve">2</m:t></m:r></m:den></m:f></m:oMath>',
    )
    expect(latexToOmml('\\sqrt{x}')).toContain('<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>')
    expect(latexToOmml('\\sqrt[3]{x}')).toContain('<m:deg><m:r><m:t xml:space="preserve">3</m:t></m:r></m:deg>')
    expect(latexToOmml('x^{2}+y_1')).toContain('<m:sSup>')
    expect(latexToOmml('x^2_i')).toContain('<m:sSubSup>')
    expect(plain(latexToOmml('a \\leq b \\cdot \\pi \\to \\infty'))).toBe('a≤b·π→∞')
    expect(latexToOmml('\\sum_{i=1}^{n} i')).toContain('<m:nary><m:naryPr><m:chr m:val="∑"/>')
    expect(latexToOmml('\\int_0^1 x')).toContain('m:val="∫"')
    expect(latexToOmml('\\left( a+b \\right)')).toContain('<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr>')
    expect(latexToOmml('\\sin x')).toContain('<m:sty m:val="p"/>')
    expect(latexToOmml('\\text{cm}^2')).toContain('<m:sSup>')
    expect(latexToOmml('\\vec{v}')).toContain('<m:acc>')
    expect(latexToOmml('\\overline{AB}')).toContain('<m:bar>')
    expect(latexToOmml('a<b & c')).toContain('a&lt;b&amp;c')
    expect(plain(latexToOmml('\\madeup{x} {'))).toContain('madeup')
    expect(() => latexToOmml('\\frac{1 \\left( }}} ^ _ \\')).not.toThrow()
  })
})

test.describe('Word output', () => {
  test('exam paper: text, points, Turkish letters, tables, footer fields, well-formed XML', async ({ page }) => {
    const files = docxFiles(await buildExamDocx(exam, 'exam', 'A'))
    expect(Object.keys(files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/footer1.xml', 'word/settings.xml', 'word/styles.xml'].sort(),
    )
    const document = files['word/document.xml']
    const text = plain(document)
    for (const expected of [
      '2026-2027 EĞİTİM ÖĞRETİM YILI',
      'ATATÜRK ANADOLU LİSESİ',
      '10/B SINIFI BİYOLOJİ DERSİ 1. DÖNEM 1. YAZILI SINAVI',
      'Ad Soyad:',
      'A GRUBU',
      '(10 puan)',
      '(5 puan)',
      '(3 puan)',
      '(2 puan)',
      'Süre: 40 dakika',
      'Her sorunun puanı yanında yazılıdır.',
      'Fotosentezin ışığa bağımlı',
      'Çekirdek',
      'Başarılar dilerim.',
      'Ayşe Çelik, Ders Öğretmeni',
      '( D ) ( Y )',
      'Toplam',
    ]) {
      expect(text, expected).toContain(expected)
    }
    for (const question of buildGroup(exam, 'A')) expect(text).toContain(`[${question.id}] (${question.points} puan)`)
    expect(files['word/styles.xml']).toContain('w:lang w:val="tr-TR"')
    expect(document).toContain('<m:oMath>')
    expect(document).toContain('<m:f>')
    expect(document).toContain('<w:cantSplit/>')
    expect(document).toContain('<w:keepNext/>')
    expect(document).toContain('<w:pgSz w:w="11906" w:h="16838"/>')
    expect(files['word/footer1.xml']).toContain('PAGE')
    expect(files['word/footer1.xml']).toContain('NUMPAGES')
    expect(files['word/footer1.xml']).toContain('Quelio ile hazırlandı')

    await page.setContent('<body></body>')
    const broken = await page.evaluate(
      (parts) =>
        Object.entries(parts)
          .filter(([, xml]) => new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length > 0)
          .map(([name]) => name),
      files,
    )
    expect(broken).toEqual([])
  })

  test('group B paper and the answer key: mapping, rubric, topic table, page break between keys', async () => {
    const paperB = plain(docxFiles(await buildExamDocx(exam, 'exam', 'B'))['word/document.xml'])
    expect(paperB).toContain('B GRUBU')
    const key = docxFiles(await buildExamDocx(exam, 'key', 'both'))['word/document.xml']
    const text = plain(key)
    // The key opens with the header of the exam (school, year, class, course, exam number, group), then "CEVAP ANAHTARI".
    for (const expected of ['A GRUBU', 'B GRUBU', 'ATATÜRK ANADOLU LİSESİ', '10/B SINIFI BİYOLOJİ DERSİ 1. DÖNEM 1. YAZILI SINAVI', 'CEVAP ANAHTARI']) expect(text, expected).toContain(expected)
    expect((text.match(/CEVAP ANAHTARI/g) ?? []).length).toBe(2)
    expect(text).toMatch(/B \d+\. soru = A \d+\. soru/)
    expect(text).toContain('Beklenen cevap')
    expect(text).toContain('Tilakoit zarını belirtir')
    for (const expected of ['Konu-soru dağılım tablosu', 'Belirtke tablosu', 'Konu / kazanım', 'Soru numaraları', 'Soru sayısı', 'Hatırlama', 'Değerlendirme', 'Yaratma']) expect(text, expected).toContain(expected)
    const breakAt = key.indexOf('<w:br w:type="page"/>')
    expect(breakAt).toBeGreaterThan(plain(key).indexOf('A GRUBU') > -1 ? key.indexOf('A GRUBU') : 0)
    expect(breakAt).toBeLessThan(key.lastIndexOf('B GRUBU'))
  })

  test('file names and the zip', async () => {
    expect(examFileName(exam, 'exam', 'A')).toBe('Biyoloji-10-Sinif-Yazili-A-Grubu.docx')
    expect(examFileName(exam, 'key', 'B')).toBe('Biyoloji-10-Sinif-Yazili-B-Grubu-Cevap-Anahtari.docx')
    const names = Object.keys(unzipSync(await buildExamZip(exam))).sort()
    expect(names).toEqual([
      'Biyoloji-10-Sinif-Yazili-A-Grubu-Cevap-Anahtari.docx',
      'Biyoloji-10-Sinif-Yazili-A-Grubu.docx',
      'Biyoloji-10-Sinif-Yazili-B-Grubu-Cevap-Anahtari.docx',
      'Biyoloji-10-Sinif-Yazili-B-Grubu.docx',
    ])
  })
})

async function pdfPages(pdf: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useWorkerFetch: false, isEvalSupported: false }).promise
  const pages: string[] = []
  for (let index = 1; index <= doc.numPages; index += 1) {
    const content = await (await doc.getPage(index)).getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' '))
  }
  await doc.destroy()
  return pages
}

async function printToPdf(page: Page, query: string, target: WrittenExam = exam): Promise<string[]> {
  await page.addInitScript((seed) => localStorage.setItem('quelio.exams.v1', JSON.stringify([seed])), target)
  await page.goto(`/exams/${target.id}/print${query}`)
  await expect(page.locator('[data-purpose="exam-paper"]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('[data-purpose="exam-print-toolbar"]')).toBeHidden()
  return pdfPages(await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }))
}

test.describe('Print view to PDF', () => {
  test('paper A: header, points, page numbers, no question split across pages', async ({ page }) => {
    const pages = await printToPdf(page, '?part=exam&group=A')
    const all = pages.join(' ')
    expect(pages.length).toBeGreaterThanOrEqual(3)
    for (const expected of [
      '2026-2027 EĞİTİM ÖĞRETİM YILI',
      'ATATÜRK ANADOLU LİSESİ',
      '10/B SINIFI BİYOLOJİ DERSİ 1. DÖNEM 1. YAZILI SINAVI',
      'Ad Soyad:',
      'A GRUBU',
      'ğüşıöçİ',
      'Başarılar dilerim.',
      'Ayşe Çelik, Ders Öğretmeni',
      'Quelio ile hazırlandı',
    ]) {
      expect(all, expected).toContain(expected)
    }
    pages.forEach((text, index) => expect(text, `page ${index + 1}`).toContain(`Sayfa ${index + 1} / ${pages.length}`))

    for (const question of buildGroup(exam, 'A')) {
      const tag = `[${question.id}]`
      const holder = pages.findIndex((text) => text.includes(tag))
      expect(holder, `${tag} on a page`).toBeGreaterThanOrEqual(0)
      const text = pages[holder]
      const from = text.indexOf(tag)
      const next = text.indexOf('[', from + 1)
      const block = text.slice(from, next === -1 ? undefined : next)
      expect(block, `${tag} keeps its points`).toContain(`(${question.points} puan)`)
      expect(text.slice(Math.max(0, from - 700), from), `${tag} keeps its number`).toMatch(new RegExp(`(^|\\s)${question.number}\\. `))
      if (question.type === 'mcq') expect(block, `${tag} keeps its last option`).toContain('D)')
      if (question.type === 'matching') expect(block, `${tag} keeps its last pair`).toContain('4. Çekirdek')
      if (question.type === 'true-false') expect(block).toContain('( D ) ( Y )')
    }
    await page.screenshot({ path: 'test-results/exam-print-view.png' })
  })

  test('answer key for both groups', async ({ page }) => {
    const pages = await printToPdf(page, '?part=key&group=both')
    const all = pages.join(' ')
    for (const expected of ['CEVAP ANAHTARI', 'A GRUBU', 'B GRUBU', 'ATATÜRK ANADOLU LİSESİ', '10/B SINIFI BİYOLOJİ DERSİ']) expect(all, expected).toContain(expected)
    expect(all).toMatch(/B \d+\. soru = A \d+\. soru/)
    for (const expected of ['Konu-soru dağılım tablosu', 'Belirtke tablosu', 'Konu / kazanım', 'Soru numaraları', 'Örnek cevap', 'Beklenen cevap']) expect(all, expected).toContain(expected)
    expect(all).toContain('Tilakoit zarını belirtir')
    pages.forEach((text, index) => expect(text).toContain(`Sayfa ${index + 1} / ${pages.length}`))
  })
})

test.describe('Print view settings (B10)', () => {
  test('footer off: the brand is gone, the page numbers stay; tables off: no tables in the key; groups off: one key', async ({ page }) => {
    const plain = { ...exam, settings: { ...exam.settings, footer: false, topicTable: false, groups: false } }
    const paper = (await printToPdf(page, '?part=exam&group=A', plain)).join(' ')
    expect(paper).not.toContain('Quelio ile hazırlandı')
    expect(paper).toContain('Sayfa 1 /')
    expect(paper).not.toContain('A GRUBU')
    const key = (await printToPdf(page, '?part=key&group=both', plain)).join(' ')
    expect(key).toContain('CEVAP ANAHTARI')
    expect(key).not.toContain('Belirtke tablosu')
    expect(key).not.toContain('Konu-soru dağılım tablosu')
    expect(key).not.toContain('B GRUBU')
    expect((key.match(/CEVAP ANAHTARI/g) ?? []).length).toBe(1)
  })

  test('no time: the header has no time line; with a time it shows "Süre: 40 dakika"', async ({ page }) => {
    const none = (await printToPdf(page, '?part=exam&group=A', { ...exam, settings: { ...exam.settings, durationMinutes: null } })).join(' ')
    expect(none).not.toContain('Süre')
    const some = (await printToPdf(page, '?part=exam&group=A')).join(' ')
    expect(some).toContain('Süre: 40 dakika')
  })
})

test('the print page says so when the exam does not exist', async ({ page }) => {
  await page.goto('/exams/00000000-0000-4000-8000-000000000000/print')
  await expect(page.getByRole('alert')).toBeVisible()
})

/** Same exam printed in another label language; the questions themselves stay as they are. */
const inLanguage = (outputLanguage: string): WrittenExam => ({ ...exam, settings: { ...exam.settings, outputLanguage } })

test.describe('Paper labels follow the exam output language', () => {
  test('which language: TR, EN, HYW as chosen, any other language prints English, auto reads the text', () => {
    expect(examPaperLang(inLanguage('tr'))).toBe('tr')
    expect(examPaperLang(inLanguage('en'))).toBe('en')
    expect(examPaperLang(inLanguage('hyw'))).toBe('hyw')
    expect(examPaperLang(inLanguage('de'))).toBe('en')
    expect(examPaperLang(inLanguage('hy'))).toBe('en')
    expect(examPaperLang(inLanguage('auto'))).toBe('tr')
    expect(detectPaperLang('The cell membrane controls what enters the cell.')).toBe('en')
    expect(detectPaperLang('Բջջաթաղանթը կը վերահսկէ։')).toBe('hyw')
    expect(detectPaperLang('Hücre zarı maddelerin geçişini düzenler.')).toBe('tr')
  })

  test('Word paper and key in English carry no Turkish labels', async () => {
    const en = inLanguage('en')
    const paper = plain(docxFiles(await buildExamDocx(en, 'exam', 'B'))['word/document.xml'])
    for (const label of ['Name:', 'Class:', 'No:', 'Score:', 'GROUP B', 'Time: 40 minutes', 'Good luck.', 'Ayşe Çelik, Teacher', 'Total', 'Q1']) expect(paper, label).toContain(label)
    for (const turkish of ['Ad Soyad', 'Sınıf', 'Puan', 'GRUBU', 'Süre', 'Başarılar dilerim', 'Ders Öğretmeni', 'Toplam']) expect(paper, turkish).not.toContain(turkish)
    expect(paper).toMatch(/\(\d+ points?\)/)
    const files = docxFiles(await buildExamDocx(en, 'exam', 'A'))
    expect(plain(files['word/footer1.xml'])).toContain('Page 1 / 1')
    expect(files['word/styles.xml']).toContain('w:lang w:val="en-US"')
    const key = plain(docxFiles(await buildExamDocx(en, 'key', 'both'))['word/document.xml'])
    for (const label of ['ANSWER KEY', 'GROUP A', 'GROUP B', 'Expected answer', 'Sample answer', 'Topic distribution', 'Table of specifications', 'Topic / outcome', 'Question numbers', 'Remember', 'Create']) expect(key, label).toContain(label)
    expect(key).toMatch(/B question \d+ = A question \d+/)
    for (const turkish of ['CEVAP ANAHTARI', 'Beklenen cevap', 'Örnek cevap', 'Soru numaraları', 'Konu / kazanım', 'Hatırlama']) expect(key, turkish).not.toContain(turkish)
  })

  test('Word paper in Western Armenian', async () => {
    const hyw = inLanguage('hyw')
    const paper = plain(docxFiles(await buildExamDocx(hyw, 'exam', 'A'))['word/document.xml'])
    for (const label of ['Անուն Մականուն:', 'Դասարան:', 'Նիշ:', 'Յաջողութիւն կը մաղթեմ։', 'Ընդամէնը', 'Ayşe Çelik, Դասի ուսուցիչ']) expect(paper, label).toContain(label)
    expect(paper).toMatch(/\(\d+ նիշ\)/)
    expect(paper).not.toContain('Ad Soyad')
    const files = docxFiles(await buildExamDocx(hyw, 'exam', 'A'))
    expect(plain(files['word/footer1.xml'])).toContain('Էջ 1 / 1')
    const key = plain(docxFiles(await buildExamDocx(hyw, 'key', 'both'))['word/document.xml'])
    expect(key).toContain('ՊԱՏԱՍԽԱՆԱԳԻՐ')
    expect(key).toContain('ԽՈՒՄԲ A')
    expect(key).toContain('Հարցերու թիւեր')
    expect(key).toContain('Յիշել')
  })

  test('print view in English: header boxes, key, page numbers, brand', async ({ page }) => {
    const pages = await printToPdf(page, '?part=exam&group=A', inLanguage('en'))
    const all = pages.join(' ')
    for (const label of ['ACADEMIC YEAR', 'Name:', 'Score:', 'GROUP A', 'Good luck.', 'Ayşe Çelik, Teacher', 'Made with Quelio']) expect(all, label).toContain(label)
    for (const turkish of ['EĞİTİM ÖĞRETİM', 'Ad Soyad', 'Başarılar dilerim', 'Ders Öğretmeni', 'hazırlandı']) expect(all, turkish).not.toContain(turkish)
    pages.forEach((text, index) => expect(text).toContain(`Page ${index + 1} / ${pages.length}`))
    expect(all).toMatch(/\(\d+ points?\)/)
  })

  test('print view answer key in English and Western Armenian', async ({ page }) => {
    const en = (await printToPdf(page, '?part=key&group=both', inLanguage('en'))).join(' ')
    for (const label of ['ANSWER KEY', 'GROUP A', 'Topic / outcome', 'Question numbers', 'Table of specifications', 'Points']) expect(en, label).toContain(label)
    expect(en).not.toContain('CEVAP ANAHTARI')
    const hyw = (await printToPdf(page, '?part=key&group=both', inLanguage('hyw'))).join(' ')
    expect(hyw).toContain('ՊԱՏԱՍԽԱՆԱԳԻՐ')
    // The PDF text layer may split a word into letters on another platform's fonts ("ն ի շ"), so compare without whitespace.
    expect(hyw.replace(/\s+/g, '')).toContain('Նիշ')
  })
})

test.describe('Page-number note for browsers that cannot print them', () => {
  const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'
  const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
  const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1'
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  const EDGE = `${CHROME} Edg/126.0.0.0`

  test('user agent check', () => {
    expect(lacksPrintPageNumbers(FIREFOX)).toBe(true)
    expect(lacksPrintPageNumbers(SAFARI)).toBe(true)
    expect(lacksPrintPageNumbers(IOS_CHROME)).toBe(true)
    expect(lacksPrintPageNumbers(CHROME)).toBe(false)
    expect(lacksPrintPageNumbers(EDGE)).toBe(false)
  })

  for (const [name, userAgent, note] of [
    ['Firefox', FIREFOX, true],
    ['Safari', SAFARI, true],
    ['Chrome', CHROME, false],
  ] as const) {
    test.describe(name, () => {
      test.use({ userAgent })

      test(`note ${note ? 'shown' : 'not shown'} on screen and never printed`, async ({ page }) => {
        await page.addInitScript((seed) => localStorage.setItem('quelio.exams.v1', JSON.stringify([seed])), exam)
        await page.goto(`/exams/${exam.id}/print?part=exam&group=A&lng=tr`)
        await expect(page.locator('[data-purpose="exam-paper"]')).toBeVisible()
        const noteBox = page.locator('[data-purpose="exam-print-note"]')
        if (note) {
          await expect(noteBox).toHaveText("Sayfa numaraları için Chrome veya Edge'den yazdır.")
          await page.emulateMedia({ media: 'print' })
          await expect(noteBox).toBeHidden()
        } else {
          await expect(noteBox).toHaveCount(0)
        }
      })
    })
  }

  test('the note is translated (TR, EN, HYW)', async ({ browser }) => {
    const notes: Record<string, string> = {
      tr: "Sayfa numaraları için Chrome veya Edge'den yazdır.",
      en: 'For page numbers, print from Chrome or Edge.',
      hyw: 'Էջերու թիւերուն համար տպէ Chrome-ով կամ Edge-ով։',
    }
    for (const [lng, text] of Object.entries(notes)) {
      const context = await browser.newContext({ userAgent: FIREFOX })
      const page = await context.newPage()
      await page.addInitScript((seed) => localStorage.setItem('quelio.exams.v1', JSON.stringify([seed])), exam)
      await page.goto(`/exams/${exam.id}/print?part=exam&group=A&lng=${lng}`)
      await expect(page.locator('[data-purpose="exam-print-note"]')).toHaveText(text)
      await context.close()
    }
  })
})
