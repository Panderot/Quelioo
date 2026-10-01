/** Best-effort per-IP hourly guard, same approach as solve-rate-limit.ts: in-memory, resets on a
 * cold start and isn't shared across instances — a speed bump against scripted abuse, not a strict
 * distributed limiter. One instance per endpoint. */
export function createHourlyIpLimit(maxPerHour: number) {
  const windowMs = 60 * 60 * 1000
  const usageByIp = new Map<string, { windowStart: number; count: number }>()

  const currentUsage = (ip: string) => {
    const existing = usageByIp.get(ip)
    const now = Date.now()
    if (existing && now - existing.windowStart < windowMs) return existing
    const fresh = { windowStart: now, count: 0 }
    usageByIp.set(ip, fresh)
    return fresh
  }

  return {
    /** False (recording nothing) once this IP has used up the hour's budget. */
    canRecord: (ip: string) => currentUsage(ip).count < maxPerHour,
    record: (ip: string) => {
      currentUsage(ip).count += 1
    },
  }
}
