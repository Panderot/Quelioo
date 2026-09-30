export type ExtractUrlErrorCode =
  | 'invalid_url'
  | 'blocked_address'
  | 'unreachable'
  | 'timeout'
  | 'not_html'
  | 'no_readable_text'
  | 'youtube_not_supported'
  | 'too_many_redirects'
  | 'network'
  | 'parse'

export interface ExtractUrlResult {
  title: string
  text: string
  wordCount: number
  truncated: boolean
}

const ERROR_CODES: ReadonlySet<string> = new Set([
  'invalid_url',
  'blocked_address',
  'unreachable',
  'timeout',
  'not_html',
  'no_readable_text',
  'youtube_not_supported',
  'too_many_redirects',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorCode(value: unknown): value is ExtractUrlErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

export class ExtractUrlApiError extends Error {
  code: ExtractUrlErrorCode

  constructor(code: ExtractUrlErrorCode) {
    super(code)
    this.code = code
  }
}

export async function extractUrlText(url: string, signal?: AbortSignal): Promise<ExtractUrlResult> {
  let response: Response
  try {
    response = await fetch('/api/extract-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ExtractUrlApiError('network')
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new ExtractUrlApiError('parse')
  }

  if (!isRecord(json)) throw new ExtractUrlApiError('parse')
  if ('error' in json) throw new ExtractUrlApiError(isErrorCode(json.error) ? json.error : 'unreachable')

  if (
    typeof json.title !== 'string' ||
    typeof json.text !== 'string' ||
    typeof json.wordCount !== 'number' ||
    typeof json.truncated !== 'boolean'
  ) {
    throw new ExtractUrlApiError('parse')
  }

  return { title: json.title, text: json.text, wordCount: json.wordCount, truncated: json.truncated }
}
