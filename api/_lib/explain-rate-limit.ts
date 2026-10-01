/** Best-effort per-IP guard on "Explain this step", mirroring solve-rate-limit.ts: in-memory, resets
 * on a cold start and isn't shared across instances — a speed bump against scripted abuse, not a
 * strict distributed limiter. Explanations are cheap text calls, so the budget is higher than Solve's. */

const MAX_EXPLAINS_PER_IP_PER_HOUR = 60
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

/** Call before explaining for this IP. Returns false (and records nothing) once the IP has used up this hour's budget. */
export function canRecordExplainForIp(ip: string): boolean {
  return currentUsage(ip).count < MAX_EXPLAINS_PER_IP_PER_HOUR
}

export function recordExplainForIp(ip: string): void {
  currentUsage(ip).count += 1
}
