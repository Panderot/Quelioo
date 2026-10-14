import type { IncomingMessage } from 'node:http'

export function requestIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const fromHeader = first?.split(',')[0]?.trim()
  return fromHeader || req.socket.remoteAddress || 'unknown'
}
