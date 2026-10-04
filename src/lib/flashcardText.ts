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

/** RFC 4180 parser: quoted fields, doubled quotes, delimiters and newlines inside quotes, CRLF.
 * Each row carries the 1-based line where it starts, so errors can point at the file. */
export function parseCsvRowsWithLines(input: string): { cells: string[]; line: number }[] {
  const text = input.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(text)
  const rows: { cells: string[]; line: number }[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let rowLine = 1
  const endRow = () => {
    row.push(field)
    rows.push({ cells: row, line: rowLine })
    row = []
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') inQuotes = false
      else {
        if (char === '\n') line++
        field += char
      }
    } else if (char === '"' && field === '') inQuotes = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      endRow()
      line++
      rowLine = line
    } else field += char
  }
  if (field !== '' || row.length > 0) endRow()
  return rows.filter(({ cells }) => cells.some((cell) => cell.trim() !== ''))
}

export function parseCsvRows(input: string): string[][] {
  return parseCsvRowsWithLines(input).map(({ cells }) => cells)
}

export const MAX_IMPORT_CARDS = 500

export type CsvErrorCode = 'empty' | 'columns' | 'too_many'

export interface CsvImport {
  cards: { front: string; back: string }[]
  /** Rows with an empty or too long side. */
  skipped: number
  /** Rows whose front repeats an earlier row or an existing card. */
  duplicates: number
  /** A problem that stops the whole import; `line` is the 1-based file line it was found on. */
  error: { code: CsvErrorCode; line?: number } | null
}

const FRONT_HEADERS = ['front', 'ön', 'soru', 'question']
const BACK_HEADERS = ['back', 'arka', 'cevap', 'answer']

/** Trailing empty cells (Excel pads rows) don't count as columns. */
function trimTrailingEmpty(cells: string[]): string[] {
  let end = cells.length
  while (end > 2 && cells[end - 1].trim() === '') end--
  return cells.slice(0, end)
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length !== 2) return false
  const [front, back] = cells.map((cell) => cell.trim().toLowerCase())
  return FRONT_HEADERS.includes(front) && BACK_HEADERS.includes(back)
}

/** Two columns become front/back. A front,back / ön,arka / soru,cevap header is optional (any case).
 * `existingFronts` are normalized fronts already in the deck; exact repeats are left out. */
export function csvToCards(input: string, existingFronts: Set<string> = new Set()): CsvImport {
  const fail = (code: CsvErrorCode, line?: number): CsvImport => ({ cards: [], skipped: 0, duplicates: 0, error: { code, line } })
  const rows = parseCsvRowsWithLines(input).map(({ cells, line }) => ({ cells: trimTrailingEmpty(cells), line }))
  if (rows.length > 0 && isHeaderRow(rows[0].cells)) rows.shift()
  if (rows.length === 0) return fail('empty')
  const wrong = rows.find(({ cells }) => cells.length !== 2)
  if (wrong) return fail('columns', wrong.line)
  const seen = new Set(existingFronts)
  const cards: { front: string; back: string }[] = []
  let skipped = 0
  let duplicates = 0
  for (const { cells } of rows) {
    const front = cells[0].trim()
    const back = cells[1].trim()
    if (validate(front, back)) skipped++
    else if (seen.has(normalizeFront(front))) duplicates++
    else {
      seen.add(normalizeFront(front))
      cards.push({ front, back })
    }
  }
  if (cards.length > MAX_IMPORT_CARDS) return fail('too_many', rows[MAX_IMPORT_CARDS].line)
  return { cards, skipped, duplicates, error: null }
}
