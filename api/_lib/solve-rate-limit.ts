/** Best-effort per-IP guard on Solve, mirroring song-rate-limit.ts's in-memory approach: resets on
 * a cold start and isn't shared across concurrent instances, so it's a speed bump against casual
 * abuse (unattended scripts hammering the vision endpoint), not a strict distributed limiter. */

const MAX_SOLVES_PER_IP_PER_HOUR = 20
const WINDOW_MS = 60 * 60 * 1000

interface IpUsage {
  windowStart: number
  count: number
}

const usageByIp = new Map<string, IpUsage>()

function currentUsage(ip: string): IpUsage {
  const existing = usageByIp.get(ip)
  const now = Date.now()
  if (existing && now - existing.windowStart < WINDOW_MS) return existing
  const fresh: IpUsage = { windowStart: now, count: 0 }
  usageByIp.set(ip, fresh)
  return fresh
}

/** Call before solving for this IP. Returns false (and records nothing) once the IP has used up this hour's budget. */
export function canRecordSolveForIp(ip: string): boolean {
  return currentUsage(ip).count < MAX_SOLVES_PER_IP_PER_HOUR
}

export function recordSolveForIp(ip: string): void {
  currentUsage(ip).count += 1
}
