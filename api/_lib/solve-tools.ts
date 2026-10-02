import type { IncomingMessage, ServerResponse } from 'node:http'

import { anotherWayRequestHandler } from './another-way.js'
import { checkWorkRequestHandler } from './check-work.js'
import { explainStepRequestHandler } from './explain-step.js'
import { similarRequestHandler } from './similar.js'

/** One Vercel function for the Solve helpers (Hobby allows 12 functions per deployment).
 * vercel.json rewrites /api/similar, /api/another-way, /api/explain-step and /api/check-work to
 * /api/solve-tools?action=<name>, so clients keep their URLs and each handler runs unchanged. */
const HANDLERS: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
  similar: similarRequestHandler,
  'another-way': anotherWayRequestHandler,
  'explain-step': explainStepRequestHandler,
  'check-work': checkWorkRequestHandler,
}

export async function solveToolsRequestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const action = new URL(req.url ?? '/', 'http://localhost').searchParams.get('action') ?? ''
  const handler = Object.hasOwn(HANDLERS, action) ? HANDLERS[action] : undefined
  if (!handler) {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'bad_type' }))
    return
  }
  await handler(req, res)
}
