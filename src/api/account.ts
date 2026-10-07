import { apiFetch } from '../lib/auth/apiFetch'
import { isFakeBackend } from '../lib/supabase'

/** Client for /api/account: everything that needs the server's secret key (full data export, account
 * deletion with all rows and files, the owner's usage summary). The browser never holds that key. */

export type AccountErrorCode = 'unauthorized' | 'forbidden' | 'bad_request' | 'rate_limited' | 'server' | 'network'

export class AccountApiError extends Error {
  code: AccountErrorCode

  constructor(code: AccountErrorCode) {
    super(code)
    this.code = code
  }
}

async function call(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await apiFetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  } catch {
    throw new AccountApiError('network')
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // A non-JSON error page; handled by the status below.
  }
  if (!response.ok) {
    const code = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : 'server'
    const known: AccountErrorCode[] = ['unauthorized', 'forbidden', 'bad_request', 'rate_limited']
    throw new AccountApiError(known.includes(code as AccountErrorCode) ? (code as AccountErrorCode) : 'server')
  }
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

/** Everything the signed-in user owns, as one JSON document (files as short-lived download links). */
export async function exportMyData(): Promise<Record<string, unknown>> {
  if (isFakeBackend) return { exportedAt: new Date().toISOString(), account: { id: 'e2e-user' } }
  return call({ action: 'export' })
}

/** Deletes the account, every row and every stored file; `confirmEmail` must match the account email. */
export async function deleteMyAccount(confirmEmail: string): Promise<void> {
  await call({ action: 'delete', confirm: confirmEmail })
}

export interface UsageSummary {
  month: string
  totalUsd: number
  byFeature: { feature: string; costUsd: number; count: number }[]
}

/** Admin only: this month's AI spend. Rejects with 'forbidden' for everyone else. */
export async function fetchUsageSummary(): Promise<UsageSummary> {
  if (isFakeBackend) return { month: new Date().toISOString().slice(0, 7), totalUsd: 0, byFeature: [] }
  const body = await call({ action: 'usage' })
  return body as unknown as UsageSummary
}
