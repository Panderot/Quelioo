import type { IncomingMessage, ServerResponse } from 'node:http'

import { authenticate } from './auth.js'
import { runWithRequestContext } from './request-context.js'
import type { RequestContext } from './request-context.js'
import { flushUsage } from './usage.js'
import { createUserRateLimit } from './user-rate-limit.js'

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** AI requests allowed per account per minute. */
export const AI_REQUESTS_PER_MINUTE = 20

const limiter = createUserRateLimit(AI_REQUESTS_PER_MINUTE)

function sendError(res: ServerResponse, status: number, error: string) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error }))
}

/** What the call is for, named in usage_events: the endpoint, or the Solve helper behind /api/solve-tools. */
export function featureOf(req: IncomingMessage): string {
  // Dev middleware strips its mount path from req.url; originalUrl keeps the full one.
  const url = new URL((req as { originalUrl?: string }).originalUrl ?? req.url ?? '/', 'http://localhost')
  const name = url.pathname.split('/').filter(Boolean).pop() ?? 'unknown'
  return name === 'solve-tools' ? (url.searchParams.get('action') ?? name) : name
}

/** Wraps an /api handler so POSTs need a signed-in account: no valid access token means 401 and the
 * handler (and so every provider call) never runs. Authenticated requests are rate limited per
 * account, and the usage the handler collects is written to usage_events before the response ends.
 * GET (status checks) and other methods pass through untouched. */
export function withAuth(handler: RequestHandler): RequestHandler {
  return async (req, res) => {
    if (req.method !== 'POST') {
      await handler(req, res)
      return
    }
    const auth = await authenticate(req)
    if (auth.status === 'unavailable') {
      sendError(res, 503, 'auth_unavailable')
      return
    }
    if (auth.status !== 'ok') {
      sendError(res, 401, 'unauthorized')
      return
    }
    if (!limiter.take(auth.user.id)) {
      res.setHeader('retry-after', '30')
      sendError(res, 429, 'rate_limited')
      return
    }

    const context: RequestContext = { userId: auth.user.id, feature: featureOf(req), events: [] }
    // The usage rows are written first, then the response really ends.
    const end = res.end.bind(res) as (...args: unknown[]) => ServerResponse
    res.end = ((...args: unknown[]) => {
      void flushUsage(context).finally(() => end(...args))
      return res
    }) as typeof res.end
    await runWithRequestContext(context, () => handler(req, res))
  }
}
