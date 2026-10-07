import { isFakeBackend, supabase } from '../supabase'
import { getAccessToken } from './authStore'

export const RATE_LIMITED_EVENT = 'quelio:rate-limited'

async function send(input: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

/** fetch for Quelio's own /api endpoints that need an account: adds `Authorization: Bearer <token>`.
 * A 401 (token expired between the check and the call) is retried once with a freshly refreshed
 * session; a 429 raises RATE_LIMITED_EVENT so one global notice says "too many requests". */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let response = await send(input, init)
  if (response.status === 401 && !isFakeBackend) {
    const { data } = await supabase.auth.refreshSession()
    if (data.session) response = await send(input, init)
  }
  if (response.status === 429) window.dispatchEvent(new Event(RATE_LIMITED_EVENT))
  return response
}
