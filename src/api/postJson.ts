/** Error thrown by the Solve add-on clients (similar problem, another way): `code` maps to a localized message. */
export class SolveExtraApiError<C extends string> extends Error {
  code: C | 'network' | 'parse' | 'upstream'

  constructor(code: C | 'network' | 'parse' | 'upstream') {
    super(code)
    this.code = code
  }
}

/** POSTs JSON and returns the parsed body; server `{error}` bodies become SolveExtraApiError(code). */
export async function postJson<C extends string>(url: string, payload: unknown, knownErrors: ReadonlySet<string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new SolveExtraApiError<C>('network')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new SolveExtraApiError<C>('parse')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new SolveExtraApiError<C>('parse')
  const record = body as Record<string, unknown>
  if ('error' in record) {
    throw new SolveExtraApiError<C>(typeof record.error === 'string' && knownErrors.has(record.error) ? (record.error as C) : 'upstream')
  }
  return record
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}
