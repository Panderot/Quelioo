import type { IncomingMessage } from 'node:http'

import { getAuthClient, isAuthConfigured } from './supabase-server.js'

export interface AuthenticatedUser {
  id: string
  email: string | null
}

export type AuthResult = { status: 'ok'; user: AuthenticatedUser } | { status: 'unauthorized' } | { status: 'unavailable' }

const MAX_TOKEN_CHARS = 4096

export function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  const value = Array.isArray(header) ? header[0] : header
  const match = typeof value === 'string' ? /^Bearer\s+(\S+)$/i.exec(value.trim()) : null
  return match && match[1].length <= MAX_TOKEN_CHARS ? match[1] : null
}

/** Verifies the request's Supabase access token (signature, expiry, issuer). Fails closed: with no
 * Supabase settings the answer is 'unavailable', never "allowed". */
export async function authenticate(req: IncomingMessage): Promise<AuthResult> {
  if (!isAuthConfigured()) return { status: 'unavailable' }
  const token = bearerToken(req)
  if (!token) return { status: 'unauthorized' }
  try {
    const { data, error } = await getAuthClient().auth.getClaims(token)
    const claims = data?.claims
    if (error || !claims || typeof claims.sub !== 'string' || claims.role !== 'authenticated') return { status: 'unauthorized' }
    return { status: 'ok', user: { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null } }
  } catch {
    return { status: 'unauthorized' }
  }
}

/** Like authenticate, but also asks the Auth server, so a deleted account or a revoked session is refused at once (account deletion, data export). */
export async function authenticateStrict(req: IncomingMessage): Promise<AuthResult> {
  if (!isAuthConfigured()) return { status: 'unavailable' }
  const token = bearerToken(req)
  if (!token) return { status: 'unauthorized' }
  try {
    const { data, error } = await getAuthClient().auth.getUser(token)
    if (error || !data.user) return { status: 'unauthorized' }
    return { status: 'ok', user: { id: data.user.id, email: data.user.email ?? null } }
  } catch {
    return { status: 'unauthorized' }
  }
}
