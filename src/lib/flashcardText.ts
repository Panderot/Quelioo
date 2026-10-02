/** Text formats for flashcards: bulk paste ("front ; back" / "front<TAB>back") and two-column CSV. */

export const MAX_FRONT_CHARS = 300
export const MAX_BACK_CHARS = 600
export const MAX_DECK_NAME_CHARS = 80
export const MAX_DECK_DESCRIPTION_CHARS = 160

export type ParsedLineError = 'no_separator' | 'empty_side' | 'too_long'

export interface ParsedLine {
  line: number
  raw: string
  front: string
  back: string
  error: ParsedLineError | null
}

function validate(front: string, back: string): ParsedLineError | null {
  if (!front || !back) return 'empty_side'
  if (front.length > MAX_FRONT_CHARS || back.length > MAX_BACK_CHARS) return 'too_long'
  return null
}

/** One card per non-empty line. A tab wins over ";" so a semicolon can appear inside tab-separated text. */
export function parseBulkLines(text: string): ParsedLine[] {
  const result: ParsedLine[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return
    const separator = raw.includes('\t') ? '\t' : raw.includes(';') ? ';' : null
    if (separator === null) {
      result.push({ line: index + 1, raw, front: raw.trim(), back: '', error: 'no_separator' })
      return
    }
    const cut = raw.indexOf(separator)
    const front = raw.slice(0, cut).trim()
    const back = raw.slice(cut + 1).trim()
    result.push({ line: index + 1, raw, front, back, error: validate(front, back) })
  })
  return result
}

/** Front text normalized for duplicate detection. */
export function normalizeFront(front: string): string {
  return front.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/** Ids of cards whose front repeats another card's front in the same deck. */
export function duplicateFrontIds(cards: { id: string; front: string }[]): Set<string> {
  const byFront = new Map<string, string[]>()
  for (const card of cards) {
    const key = normalizeFront(card.front)
    if (!key) continue
    byFront.set(key, [...(byFront.get(key) ?? []), card.id])
  }
  const duplicates = new Set<string>()
  for (const ids of byFront.values()) if (ids.length > 1) ids.forEach((id) => duplicates.add(id))
  return duplicates
}

// --- CSV ---------------------------------------------------------------------------------------

const CSV_HEADER = ['front', 'back']

function escapeCsvField(value: string): string {
  return /[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** UTF-8 CSV with a BOM (so Excel shows Turkish/Armenian letters) and a front,back header. */
export function cardsToCsv(cards: { front: string; back: string }[]): string {
  const rows = [CSV_HEADER, ...cards.map((card) => [card.front, card.back])]
  return '\uFEFF' + rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n') + '\r\n'
}

/** Guesses "," or ";" (Excel in Turkish locales writes ";") from the first line, ignoring quoted text. */
function detectDelimiter(text: string): ',' | ';' {
  let inQuotes = false
  let commas = 0
  let semicolons = 0
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && (char === '\n' || char === '\r')) break
    else if (!inQuotes && char === ',') commas++
    else if (!inQuotes && char === ';') semicolons++
  }
  return semicolons > commas ? ';' : ','
}

/** RFC 4180 parser: quoted fields, doubled quotes, delimiters and newlines inside quotes, CRLF. */
export function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') inQuotes = false
      else field += char
    } else if (char === '"' && field === '') inQuotes = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

export interface CsvImport {
  cards: { front: string; back: string }[]
  skipped: number
}

/** First two columns become front/back; an optional front,back header row is skipped. */
export function csvToCards(input: string): CsvImport {
  const rows = parseCsvRows(input)
  const first = rows[0]
  if (first && first[0]?.trim().toLowerCase() === CSV_HEADER[0] && first[1]?.trim().toLowerCase() === CSV_HEADER[1]) rows.shift()
  const cards: { front: string; back: string }[] = []
  let skipped = 0
  for (const cells of rows) {
    const front = (cells[0] ?? '').trim()
    const back = (cells[1] ?? '').trim()
    if (validate(front, back)) skipped++
    else cards.push({ front, back })
  }
  return { cards, skipped }
}
