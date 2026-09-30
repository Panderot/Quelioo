import { MIN_QUIZ_WORDS } from './textStats'
import { countWords } from './textStats'

export type FileErrorCode = 'unsupported_type' | 'too_large' | 'password_protected' | 'no_text' | 'corrupt' | 'empty' | 'too_short'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
const STOP_EXTRACTING_AT_WORDS = 6000
const TRUNCATE_TO_WORDS = 5000

const ACCEPTED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md'])

export interface ExtractedFile {
  text: string
  wordCount: number
  truncated: boolean
}

export class FileExtractionError extends Error {
  code: FileErrorCode

  constructor(code: FileErrorCode) {
    super(code)
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match ? match[1].toLowerCase() : ''
}

function isPdfPasswordError(error: unknown): boolean {
  if (!isRecord(error)) return false
  if (error.name === 'PasswordException') return true
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  return message.includes('password')
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = await file.arrayBuffer()

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  try {
    doc = await pdfjs.getDocument({ data }).promise
  } catch (error) {
    if (isPdfPasswordError(error)) throw new FileExtractionError('password_protected')
    throw new FileExtractionError('corrupt')
  }

  const parts: string[] = []
  let wordsSoFar = 0
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
      parts.push(pageText)
      wordsSoFar += countWords(pageText)
      if (wordsSoFar >= STOP_EXTRACTING_AT_WORDS) break
    }
  } catch {
    if (parts.length === 0) throw new FileExtractionError('corrupt')
  }

  return parts.join('\n\n')
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  try {
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  } catch {
    throw new FileExtractionError('corrupt')
  }
}

async function extractPlainText(file: File): Promise<string> {
  try {
    return await file.text()
  } catch {
    throw new FileExtractionError('corrupt')
  }
}

/**
 * Extracts text from an uploaded file entirely in the browser (never uploaded to a server).
 * Throws FileExtractionError with a code the UI maps to a localized message.
 */
export async function extractTextFromFile(file: File): Promise<ExtractedFile> {
  if (file.size === 0) throw new FileExtractionError('empty')
  if (file.size > MAX_FILE_BYTES) throw new FileExtractionError('too_large')

  const extension = getExtension(file.name)
  if (extension === 'doc') throw new FileExtractionError('unsupported_type')
  if (!ACCEPTED_EXTENSIONS.has(extension)) throw new FileExtractionError('unsupported_type')

  let rawText: string
  if (extension === 'pdf') {
    rawText = await extractPdfText(file)
  } else if (extension === 'docx') {
    rawText = await extractDocxText(file)
  } else {
    rawText = await extractPlainText(file)
  }

  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new FileExtractionError(extension === 'pdf' ? 'no_text' : 'empty')
  }

  const wordCount = countWords(trimmed)
  if (wordCount < MIN_QUIZ_WORDS) {
    throw new FileExtractionError('too_short')
  }

  if (wordCount <= TRUNCATE_TO_WORDS) {
    return { text: trimmed, wordCount, truncated: false }
  }

  const words = trimmed.split(/\s+/)
  const text = words.slice(0, TRUNCATE_TO_WORDS).join(' ')
  return { text, wordCount: countWords(text), truncated: true }
}
