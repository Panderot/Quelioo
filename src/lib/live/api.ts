import { apiFetch } from '../auth/apiFetch'
import type { LiveJoinError, LiveRankRow, LiveSettings, LiveState, LiveSummary, LiveGameInfo } from './core'

/** Browser side of /api/live. Teacher calls carry the account token (apiFetch); student calls carry the player token
 * the server handed out at join and never an account. */

export class LiveApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Not JSON (an HTML error page from a proxy): treated as a generic failure below.
  }
  if (!response.ok) {
    const code = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : 'server_error'
    throw new LiveApiError(response.status, code)
  }
  return body as T
}

const url = (action: string, query: Record<string, string> = {}) => `/api/live?${new URLSearchParams({ action, ...query })}`

async function hostGet<T>(action: string, query: Record<string, string>): Promise<T> {
  return parse<T>(await apiFetch(url(action, query)))
}

async function hostPost<T>(action: string, body: unknown): Promise<T> {
  return parse<T>(await apiFetch(url(action), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
}

async function playerRequest<T>(action: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('x-live-token', token)
  if (init.body) headers.set('content-type', 'application/json')
  return parse<T>(await fetch(url(action), { ...init, headers }))
}

// --- Teacher ---------------------------------------------------------------------------------------------------

export const createLiveGame = (quizId: string, settings: LiveSettings) => hostPost<{ id: string; code: string }>('create', { quizId, settings })

export const fetchHostState = (id: string) => hostGet<LiveState>('host-state', { id })

export const sendHostCommand = (id: string, command: string, extra: Record<string, unknown> = {}) => hostPost<LiveState>('command', { id, command, ...extra })

export interface LiveResultsResponse {
  game: LiveGameInfo
  createdAt: string
  finishedAt: string | null
  summary: LiveSummary | null
  ranking: LiveRankRow[] | null
  rankingPurged: boolean
}

export const fetchLiveResults = (id: string) => hostGet<LiveResultsResponse>('results', { id })

// --- Student ---------------------------------------------------------------------------------------------------

export const checkLiveCode = (code: string) => playerRequest<{ ok: boolean; problem: LiveJoinError | null; quizTitle: string }>('check', null, { method: 'POST', body: JSON.stringify({ code }) })

export const joinLiveGame = (code: string, nickname: string, token?: string) =>
  playerRequest<{ token: string; state: LiveState }>('join', null, { method: 'POST', body: JSON.stringify({ code, nickname, token }) })

export const fetchPlayerState = (token: string) => playerRequest<LiveState>('state', token)

export const sendLiveAnswer = (token: string, index: number, answer: number[]) => playerRequest<{ ok: true }>('answer', token, { method: 'POST', body: JSON.stringify({ index, answer }) })
