import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

import { analyzeCsv, cardKey, cardsToCsv, csvToCards, decodeCsvBytes, parseBulk, planBulkAdd } from '../../src/lib/flashcardText'

// Pure unit tests (no browser): bulk paste parser, CSV formats, encodings and the export round trip.
const dir = 'tests/fixtures/cards/import'
const read = (name: string) => decodeCsvBytes(readFileSync(`${dir}/${name}`))

const EXPECTED = [
  { front: 'Şapka Kanunu ne zaman çıkarıldı?', back: '25 Kasım 1925' },
  { front: 'Işığın kırılması nedir?', back: 'Işığın bir ortamdan diğerine geçerken yön değiştirmesi.' },
  { front: 'İkincil gökkuşağında renkler hangi sırada?', back: 'Ters sırada, kırmızı içte; "ters" denir, çünkü ışık iki kez yansır.' },
]

test.describe('bulk paste parser', () => {
  const pairs = (text: string) => parseBulk(text).lines.map((line) => [line.front, line.back, line.error])

  test('tab, semicolon, pipe and spaced dashes; CRLF; empty lines skipped', () => {
    expect(pairs('kedi\tcat\r\n\r\nköpek\tdog\r\n')).toEqual([['kedi', 'cat', null], ['köpek', 'dog', null]])
    expect(pairs('kedi ; cat\nköpek;dog')).toEqual([['kedi', 'cat', null], ['köpek', 'dog', null]])
    expect(pairs('kedi | cat\nköpek | dog')).toEqual([['kedi', 'cat', null], ['köpek', 'dog', null]])
    for (const dash of ['-', '–', '—']) expect(pairs(`kedi ${dash} cat\nköpek ${dash} dog`), dash).toEqual([['kedi', 'cat', null], ['köpek', 'dog', null]])
    expect(parseBulk('a - b\nc - d').separator).toBe('dash')
  })

  test('commas, colons and unspaced hyphens never split', () => {
    expect(parseBulk('kedi, cat\nköpek: dog\nkara-kedi').lines.every((line) => line.error === 'no_separator')).toBe(true)
    expect(pairs('Ankara - başkent, 1923\nİzmir - liman, Ege')).toEqual([['Ankara', 'başkent, 1923', null], ['İzmir', 'liman, Ege', null]])
    expect(pairs('kara-kedi ; black-cat')).toEqual([['kara-kedi', 'black-cat', null]])
  })

  test('the separator that splits most lines wins; a line it cannot split tries the others', () => {
    expect(parseBulk('a ; b - c\nd ; e\nf ; g').separator).toBe('semicolon')
    expect(pairs('a ; b\nc | d')).toEqual([['a', 'b', null], ['c', 'd', null]])
    expect(pairs('x\ty\nz\tw')).toEqual([['x', 'y', null], ['z', 'w', null]])
  })

  test('spreadsheet paste: quoted cells with line breaks and escaped quotes, extra columns dropped', () => {
    const pasted = '"Satır 1\nSatır 2"\tCevap\r\n"İki ""tırnak"""\tB\textra\r\n'
    expect(pairs(pasted)).toEqual([['Satır 1\nSatır 2', 'Cevap', null], ['İki "tırnak"', 'B', null]])
    expect(pairs('"a ; b" ; c')).toEqual([['a ; b', 'c', null]])
    // An unclosed quote must not swallow the rest of the paste.
    expect(pairs('"open\tx\ny\tz')).toEqual([['"open', 'x', null], ['y', 'z', null]])
  })

  test('Excel / Sheets paste: every row with a third column, trailing empty cells, CRLF or LF, non-breaking spaces', () => {
    const cards = [['Mitokondri', 'Enerji santrali', null], ['Ribozom', 'Protein sentezler', null]]
    expect(pairs('Mitokondri\tEnerji santrali\tnot\r\nRibozom\tProtein sentezler\tnot\r\n')).toEqual(cards)
    expect(pairs('Mitokondri\tEnerji santrali\t\r\nRibozom\tProtein sentezler\t\r\n')).toEqual(cards)
    expect(pairs('Mitokondri\tEnerji santrali\nRibozom\tProtein sentezler\n')).toEqual(cards)
    expect(pairs('Mitokondri - Enerji santrali\r\nRibozom - Protein sentezler')).toEqual(cards)
  })

  test('errors carry the line number and reason; valid lines can still be added', () => {
    const { lines } = parseBulk('a ; b\nnoseparator\n ; c\nd ; \n' + 'x'.repeat(301) + ' ; long')
    expect(lines.map((line) => [line.line, line.error])).toEqual([[1, null], [2, 'no_separator'], [3, 'empty_side'], [4, 'empty_side'], [5, 'too_long']])
  })

  test('cards already in the deck and repeats inside the paste are skipped and counted', () => {
    const { lines } = parseBulk('Kedi ; cat\nkedi  ;  CAT\nköpek ; dog\nkuş ; bird')
    const plan = planBulkAdd(lines, new Set([cardKey('köpek', 'dog')]))
    expect(plan.cards).toEqual([{ front: 'Kedi', back: 'cat' }, { front: 'kuş', back: 'bird' }])
    expect(plan.duplicates).toBe(2)
    // Same front, different back is a different card.
    expect(planBulkAdd(parseBulk('kedi ; cat\nkedi ; feline').lines, new Set()).cards).toHaveLength(2)
  })
})

test.describe('CSV import formats', () => {
  for (const name of ['excel-tr-utf8-bom.csv', 'excel-windows-1254.csv', 'google-sheets-comma.csv', 'libreoffice-quoted.csv', 'quizlet-tab.txt', 'excel-unicode-utf16.txt']) {
    test(`${name} imports the same three cards`, () => {
      const result = analyzeCsv(read(name))
      expect(result.error).toBeNull()
      expect(result.cards).toEqual(EXPECTED)
      expect(result.skipped + result.duplicates + result.extraColumns).toBe(0)
    })
  }

  test('Windows-1254 is decoded, never shown as mojibake', () => {
    const text = read('excel-windows-1254.csv')
    expect(text).toContain('Şapka Kanunu ne zaman çıkarıldı?')
    expect(text).not.toMatch(/Ã|Ä|Å|�/)
    expect(decodeCsvBytes(new Uint8Array([0x50, 0xfd, 0xfe, 0xf0, 0xdd, 0xde, 0xd0]))).toBe('PışğİŞĞ')
  })

  test('Anki export: header lines skipped, simple HTML stripped, third column ignored and reported', () => {
    const result = analyzeCsv(read('anki-export.txt'))
    expect(result.error).toBeNull()
    expect(result.cards).toEqual([
      { front: 'Şapka Kanunu ne zaman çıkarıldı?', back: '25 Kasım 1925' },
      { front: 'Işığın kırılması nedir?', back: 'Işığın bir ortamdan diğerine geçerken\nyön değiştirmesi.' },
      { front: 'Gökkuşağı için güneş nerede olmalı?', back: 'Gözlemcinin arkasında' },
    ])
    expect(result.extraColumns).toBe(1)
  })

  test('quoted fields keep line breaks, separators and escaped quotes', () => {
    expect(analyzeCsv(read('multiline-quoted.csv')).cards).toEqual([
      { front: 'Satır 1\r\nSatır 2', back: 'Cevap, virgüllü "tırnaklı"' },
      { front: 'Tek satır', back: 'İki\nsatır' },
    ])
  })

  test('extra columns are ignored and counted; padded empty rows and whitespace are tolerated', () => {
    const result = analyzeCsv(read('extra-columns-no-header.csv'))
    expect(result.cards).toEqual([{ front: 'elma', back: 'apple' }, { front: 'kitap', back: 'book' }])
    expect(result.extraColumns).toBe(1)
  })

  test('English term,definition headers (any case) and trailing empty rows', () => {
    expect(csvToCards(read('term-definition.csv')).cards).toEqual([{ front: 'refraction', back: 'Bending of light' }, { front: 'spectrum', back: 'Range of colours' }])
    for (const header of ['TERM,DEFINITION', 'Terim;Tanım', 'TERİM;TANIM', 'Kavram;Anlam', 'question,answer']) {
      const delimiter = header.includes(';') ? ';' : ','
      expect(csvToCards(`${header}\nx${delimiter}y\n`).cards, header).toEqual([{ front: 'x', back: 'y' }])
    }
  })

  test('row errors keep the file line number', () => {
    expect(csvToCards('a;b\nc;d\nonly one\n').error).toEqual({ code: 'columns', line: 3 })
    expect(csvToCards('#separator:tab\n#html:true\nx\ty\nlonely\n').error).toEqual({ code: 'columns', line: 4 })
  })

  test('a comma inside content does not hide the real delimiter', () => {
    expect(csvToCards('Soru,Cevap\nx,y; z\n').cards).toEqual([{ front: 'x', back: 'y; z' }])
    expect(csvToCards('Ön;Arka\nkedi, evcil;cat, pet\n').cards).toEqual([{ front: 'kedi, evcil', back: 'cat, pet' }])
  })
})

test.describe('CSV export', () => {
  const tricky = [
    { front: 'Şapka Kanunu', back: '25 Kasım 1925' },
    { front: 'Բարեւ', back: 'Merhaba, "selam"; hello' },
    { front: 'çok\nsatırlı', back: 'ığüşöç İĞÜŞÖÇ' },
    { front: '#hashtag', back: '=1+1' },
    { front: ' boşluklu ', back: 'a\tb' },
  ]

  test('opens in Turkish Excel (BOM, semicolon, CRLF) and re-imports to identical cards', () => {
    const csv = cardsToCsv(tricky)
    expect(csv.startsWith('﻿front;back\r\n')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    const again = csvToCards(csv)
    expect(again.error).toBeNull()
    expect(again.cards).toEqual(tricky.map((card) => ({ front: card.front.trim(), back: card.back })))
  })

  test('every fixture survives export then import', () => {
    for (const name of ['excel-tr-utf8-bom.csv', 'excel-windows-1254.csv', 'google-sheets-comma.csv', 'libreoffice-quoted.csv', 'quizlet-tab.txt', 'multiline-quoted.csv', 'term-definition.csv']) {
      const cards = analyzeCsv(read(name)).cards
      expect(csvToCards(cardsToCsv(cards)).cards, name).toEqual(cards)
    }
  })
})
