/** Text formats for flashcards: bulk paste (tab, ";", " | ", " - ") and two-column CSV (Excel, Sheets, Quizlet, Anki). */

export const MAX_FRONT_CHARS = 300
export const MAX_BACK_CHARS = 600
export const MAX_DECK_NAME_CHARS = 80
export const MAX_DECK_DESCRIPTION_CHARS = 160

type ParsedLineError = 'no_separator' | 'empty_side' | 'too_long'

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

// --- Delimited text ----------------------------------------------------------------------------

interface RawRow {
  cells: string[]
  line: number
  raw: string
}

/** Quote-aware delimited rows (RFC 4180 style). Rows remember their 1-based start line and source text.
 * Returns null when a quote is never closed, so the caller can retry with quotes off. */
function splitDelimited(text: string, delimiter: string, allowQuotes: boolean): RawRow[] | null {
  const rows: RawRow[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let rowLine = 1
  let rowStart = 0
  const endRow = (end: number) => {
    row.push(field)
    rows.push({ cells: row, line: rowLine, raw: text.slice(rowStart, end).replace(/[\r\n]+$/, '') })
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
    } else if (allowQuotes && char === '"' && field === '') inQuotes = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      const end = i
      if (char === '\r' && text[i + 1] === '\n') i++
      endRow(end)
      line++
      rowLine = line
      rowStart = i + 1
    } else field += char
  }
  if (inQuotes) return null
  if (field !== '' || row.length > 0) endRow(text.length)
  return rows.filter(({ cells }) => cells.some((cell) => cell.trim() !== ''))
}

function trimTrailingEmptyCells(cells: string[]): string[] {
  let end = cells.length
  while (end > 2 && cells[end - 1].trim() === '') end--
  return cells.slice(0, end)
}

// --- Bulk paste --------------------------------------------------------------------------------

type BulkSeparator = 'tab' | 'semicolon' | 'pipe' | 'dash'
/** Tie-break order when several separators split the same number of lines. */
const BULK_SEPARATORS: BulkSeparator[] = ['tab', 'pipe', 'semicolon', 'dash']
const BULK_JOINERS: Record<BulkSeparator, string> = { tab: '\t', semicolon: ';', pipe: ' | ', dash: ' - ' }

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).replace(/""/g, '"') : trimmed
}

/** Rows split by one separator. Tab and ";" are quote-aware (spreadsheets quote cells with line breaks);
 * " | " and " - " (also en/em dash, spaces on both sides) split each line. Commas and colons never split. */
function rowsFor(text: string, separator: BulkSeparator): RawRow[] {
  if (separator === 'tab' || separator === 'semicolon') {
    const delimiter = separator === 'tab' ? '\t' : ';'
    return splitDelimited(text, delimiter, true) ?? splitDelimited(text, delimiter, false) ?? []
  }
  const pattern = separator === 'pipe' ? / \| / : / [-–—] /
  const rows: RawRow[] = []
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    if (!raw.trim()) return
    rows.push({ cells: raw.split(pattern).map(stripWrappingQuotes), line: index + 1, raw })
  })
  return rows
}

export interface BulkParse {
  lines: ParsedLine[]
  /** The separator used for the whole paste; null when no line could be split. */
  separator: BulkSeparator | null
}

/** One card per non-empty line. A single separator is chosen for the whole paste: the one that splits the
 * most lines into exactly two parts. A line the chosen separator cannot split tries the others before failing. */
export function parseBulk(input: string): BulkParse {
  // Spreadsheets and web pages paste non-breaking spaces around separators; they count as plain spaces.
  const text = input.replace(/^\uFEFF/, '').replace(/[\u00A0\u2007\u202F]/g, ' ')
  const candidates = BULK_SEPARATORS.map((separator) => {
    const rows = rowsFor(text, separator)
    // Exactly two parts is the clearest signal; a third spreadsheet column (ignored later) still counts as a split.
    const score = rows.reduce((sum, { cells }) => {
      const parts = trimTrailingEmptyCells(cells).length
      return sum + (parts === 2 ? 2 : parts > 2 ? 1 : 0)
    }, 0)
    return { separator, rows, score }
  })
  const best = candidates.reduce((top, entry) => (entry.score > top.score ? entry : top), candidates[0])
  if (best.score === 0) {
    const lines: ParsedLine[] = []
    text.split(/\r\n|\r|\n/).forEach((raw, index) => {
      if (raw.trim()) lines.push({ line: index + 1, raw, front: raw.trim(), back: '', error: 'no_separator' })
    })
    return { lines, separator: null }
  }
  const split = (separator: BulkSeparator, cells: string[]) => {
    const parts = trimTrailingEmptyCells(cells)
    if (parts.length < 2) return null
    // Spreadsheet extras (a third column) are dropped; text separators keep the rest of the line as the back.
    return { front: parts[0].trim(), back: (separator === 'tab' ? parts[1] : parts.slice(1).join(BULK_JOINERS[separator])).trim() }
  }
  const lines = best.rows.map(({ cells, line, raw }): ParsedLine => {
    let sides = split(best.separator, cells)
    if (!sides) {
      for (const other of candidates) {
        if (other.separator === best.separator) continue
        const row = other.rows.find((candidate) => candidate.line === line)
        sides = row ? split(other.separator, row.cells) : null
        if (sides) break
      }
    }
    if (!sides) return { line, raw, front: raw.trim(), back: '', error: 'no_separator' }
    return { line, raw, front: sides.front, back: sides.back, error: validate(sides.front, sides.back) }
  })
  return { lines, separator: best.separator }
}

export function parseBulkLines(text: string): ParsedLine[] {
  return parseBulk(text).lines
}

/** Front and back normalized together: a card already in the deck with the same sides is a duplicate. */
export function cardKey(front: string, back: string): string {
  return `${normalizeFront(front)}\u0000${normalizeFront(back)}`
}

/** Valid lines to add; lines repeating a deck card (or an earlier line) are left out and counted. */
export function planBulkAdd(lines: ParsedLine[], existingKeys: Set<string>): { cards: { front: string; back: string }[]; duplicates: number } {
  const seen = new Set(existingKeys)
  const cards: { front: string; back: string }[] = []
  let duplicates = 0
  for (const line of lines) {
    if (line.error) continue
    const key = cardKey(line.front, line.back)
    if (seen.has(key)) duplicates++
    else {
      seen.add(key)
      cards.push({ front: line.front, back: line.back })
    }
  }
  return { cards, duplicates }
}

// --- CSV ---------------------------------------------------------------------------------------

const CSV_HEADER = ['front', 'back']

function escapeCsvField(value: string): string {
  return /[",;\r\n]/.test(value) || value !== value.trim() || value.startsWith('#') ? `"${value.replace(/"/g, '""')}"` : value
}

/** UTF-8 CSV with a BOM and ";" (what Turkish Excel opens correctly), CRLF rows and a front;back header.
 * csvToCards reads it back to identical cards. */
export function cardsToCsv(cards: { front: string; back: string }[]): string {
  const rows = [CSV_HEADER, ...cards.map((card) => [card.front, card.back])]
  return '\uFEFF' + rows.map((row) => row.map(escapeCsvField).join(';')).join('\r\n') + '\r\n'
}

/** Bytes of a CSV file to text. UTF-8 (with or without BOM) and UTF-16 (Excel "Unicode text") are read as
 * they are; a file that is not valid UTF-8 is Windows-1254 (Excel "CSV" on Turkish Windows), so ş ğ ı İ ö ü ç stay correct. */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data)
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return new TextDecoder('windows-1254').decode(data)
  }
}

type CsvDelimiter = ',' | ';' | '\t' | '|'
const DELIMITER_ORDER: CsvDelimiter[] = ['\t', ';', ',', '|']

/** Per-line count of a delimiter outside quotes, for the first few lines. */
function delimiterCounts(text: string, delimiter: CsvDelimiter): number[] {
  const counts: number[] = []
  let inQuotes = false
  let count = 0
  let empty = true
  for (const char of text) {
    if (char === '"') {
      inQuotes = !inQuotes
      empty = false
    } else if (!inQuotes && (char === '\n' || char === '\r')) {
      if (!empty) {
        counts.push(count)
        if (counts.length >= 12) return counts
      }
      count = 0
      empty = true
    } else {
      if (!/\s/.test(char)) empty = false
      if (!inQuotes && char === delimiter) count++
    }
  }
  if (!empty) counts.push(count)
  return counts
}

/** Anki writes "#separator:tab" (or semicolon, comma, pipe) in its header lines. */
function declaredDelimiter(headerLines: string[]): CsvDelimiter | null {
  for (const header of headerLines) {
    const match = /^#separator:\s*(\S+)/i.exec(header)
    if (!match) continue
    const value = match[1].toLowerCase()
    if (value === 'tab') return '\t'
    if (value === 'semicolon' || value === ';') return ';'
    if (value === 'comma' || value === ',') return ','
    if (value === 'pipe' || value === '|') return '|'
  }
  return null
}

/** Picks the delimiter that appears exactly once on most of the first lines (a two-column file), then the one
 * on most lines; ties go to tab, ";", ",". Delimiters inside quoted text don't count. */
function detectDelimiter(text: string): CsvDelimiter {
  // A known header row (front,back / ön;arka ...) names the delimiter exactly, whatever the content holds.
  const firstLine = text.split(/\r\n|\r|\n/).find((line) => line.trim() !== '') ?? ''
  for (const delimiter of DELIMITER_ORDER) {
    const cells = splitDelimited(firstLine, delimiter, true)?.[0]?.cells
    if (cells && isHeaderRow(cells)) return delimiter
  }
  let best: CsvDelimiter = ','
  let bestScore = -1
  for (const delimiter of DELIMITER_ORDER) {
    const counts = delimiterCounts(text, delimiter)
    const score = counts.filter((count) => count === 1).length * 2 + counts.filter((count) => count > 1).length
    if (score > bestScore) {
      best = delimiter
      bestScore = score
    }
  }
  return best
}

/** Leading "#..." lines (Anki file headers) are removed; blank lines take their place so line numbers stay true. */
function splitHeaderLines(text: string): { headers: string[]; body: string } {
  const lines = text.split(/\r\n|\r|\n/)
  let count = 0
  while (count < lines.length && lines[count].startsWith('#')) count++
  if (count === 0) return { headers: [], body: text }
  return { headers: lines.slice(0, count), body: '\n'.repeat(count) + lines.slice(count).join('\n') }
}

/** RFC 4180 parser: quoted fields, doubled quotes, delimiters and newlines inside quotes, CRLF. The delimiter
 * (tab, ";", ",", "|") is detected. Each row carries the 1-based line where it starts. */
function parseCsvRowsWithLines(input: string): { cells: string[]; line: number }[] {
  const { headers, body } = splitHeaderLines(input.replace(/^\uFEFF/, ''))
  const delimiter = declaredDelimiter(headers) ?? detectDelimiter(body)
  const rows = splitDelimited(body, delimiter, true) ?? splitDelimited(body, delimiter, false) ?? []
  return rows.map(({ cells, line }) => ({ cells, line }))
}

export function parseCsvRows(input: string): string[][] {
  return parseCsvRowsWithLines(input).map(({ cells }) => cells)
}

export const MAX_IMPORT_CARDS = 500

type CsvErrorCode = 'empty' | 'columns' | 'too_many'

export interface CsvImport {
  cards: { front: string; back: string }[]
  /** Rows with an empty or too long side. */
  skipped: number
  /** Rows whose front repeats an earlier row or an existing card. */
  duplicates: number
  /** A problem that stops the whole import; `line` is the 1-based file line it was found on. */
  error: { code: CsvErrorCode; line?: number } | null
}

export interface CsvAnalysis extends CsvImport {
  /** Columns beyond the first two on the widest row; they are ignored. */
  extraColumns: number
}

const FRONT_HEADERS = ['front', 'ön', 'ön yüz', 'on yuz', 'soru', 'question', 'term', 'terim', 'kavram', 'word', 'kelime', 'sözcük']
const BACK_HEADERS = ['back', 'arka', 'arka yüz', 'arka yuz', 'cevap', 'answer', 'definition', 'tanım', 'tanim', 'anlam', 'meaning', 'translation', 'çeviri']

function lowerBoth(value: string): string[] {
  const trimmed = value.trim()
  return [trimmed.toLocaleLowerCase('tr'), trimmed.toLocaleLowerCase('en')]
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false
  return lowerBoth(cells[0]).some((value) => FRONT_HEADERS.includes(value)) && lowerBoth(cells[1]).some((value) => BACK_HEADERS.includes(value))
}

const HTML_TAGS = /<\/?(?:br|div|p|span|b|i|u|strong|em|font|sub|sup|img)\b[^>]*>/gi
const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/** Anki exports keep simple HTML: <br> becomes a line break, other tags and entities are removed. */
function stripSimpleHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(HTML_TAGS, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])
}

/** Two columns become front/back; more columns are ignored (counted in `extraColumns`). A header such as
 * front,back / ön,arka / soru,cevap / term,definition / terim,tanım is optional (any case).
 * `existingFronts` are normalized fronts already in the deck; exact repeats are left out. */
export function analyzeCsv(input: string, existingFronts: Set<string> = new Set()): CsvAnalysis {
  const fail = (code: CsvErrorCode, line?: number): CsvAnalysis => ({ cards: [], skipped: 0, duplicates: 0, error: { code, line }, extraColumns: 0 })
  const hasHtml = /<\/?(?:br|div|p|span|b|i|u|strong|em|font)\b|&nbsp;/i.test(input)
  const rows = parseCsvRowsWithLines(input).map(({ cells, line }) => ({
    cells: trimTrailingEmptyCells(cells).map((cell) => (hasHtml ? stripSimpleHtml(cell) : cell)),
    line,
  }))
  if (rows.length > 0 && isHeaderRow(rows[0].cells)) rows.shift()
  if (rows.length === 0) return fail('empty')
  const wrong = rows.find(({ cells }) => cells.length < 2)
  if (wrong) return fail('columns', wrong.line)
  const extraColumns = Math.max(0, ...rows.map(({ cells }) => cells.length - 2))
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
  return { cards, skipped, duplicates, error: null, extraColumns }
}

export function csvToCards(input: string, existingFronts: Set<string> = new Set()): CsvImport {
  const { cards, skipped, duplicates, error } = analyzeCsv(input, existingFronts)
  return { cards, skipped, duplicates, error }
}
