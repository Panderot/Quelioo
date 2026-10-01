import type { IncomingMessage } from 'node:http'

/** Best-effort per-IP guard on top of the client-side daily song/seconds guards (lib/songCostGuard.ts)
 * — a client can clear localStorage, an IP can't clear this. In-memory only: on Vercel's serverless
 * Node runtime this resets on a cold start and isn't shared across concurrent instances, so it's a
 * speed bump against casual abuse, not a strict distributed limiter — matching this project's
 * "keep it simple, no database" approach elsewhere. Mirrors the client's own daily caps. */

const MAX_SONGS_PER_IP_PER_DAY = 20
const MAX_SECONDS_PER_IP_PER_DAY = 300

interface IpUsage {
  date: string
  count: number
  totalSeconds: number
}

const usageByIp = new Map<string, IpUsage>()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function requestIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const fromHeader = first?.split(',')[0]?.trim()
  return fromHeader || req.socket.remoteAddress || 'unknown'
}

function currentUsage(ip: string): IpUsage {
  const existing = usageByIp.get(ip)
  const today = todayKey()
  if (existing && existing.date === today) return existing
  const fresh: IpUsage = { date: today, count: 0, totalSeconds: 0 }
  usageByIp.set(ip, fresh)
  return fresh
}

/** Call before generating audio for this IP. Returns false (and records nothing) if the IP has
 * already used up today's count or seconds budget. */
export function canRecordSongForIp(ip: string, targetSeconds: number): boolean {
  const usage = currentUsage(ip)
  return usage.count < MAX_SONGS_PER_IP_PER_DAY && usage.totalSeconds + targetSeconds <= MAX_SECONDS_PER_IP_PER_DAY
}

export function recordSongForIp(ip: string, durationSeconds: number): void {
  const usage = currentUsage(ip)
  usage.count += 1
  usage.totalSeconds += durationSeconds
}
