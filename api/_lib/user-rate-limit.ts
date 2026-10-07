/** Per-account request limit for the AI endpoints: a sliding one-minute window, in memory like the
 * per-IP guards (resets on a cold start and is not shared across instances) — a speed bump against a
 * runaway client or a shared password, not a strict distributed limiter. */
export function createUserRateLimit(maxPerWindow: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>()
  return {
    /** Records the request and returns true, or returns false (recording nothing) when the account is over the limit. */
    take(userId: string, now = Date.now()): boolean {
      const recent = (hits.get(userId) ?? []).filter((time) => now - time < windowMs)
      if (recent.length >= maxPerWindow) {
        hits.set(userId, recent)
        return false
      }
      recent.push(now)
      hits.set(userId, recent)
      if (hits.size > 5000) for (const [id, times] of hits) if (times.every((time) => now - time >= windowMs)) hits.delete(id)
      return true
    },
  }
}
