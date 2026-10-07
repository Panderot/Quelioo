import { usageCostUsd } from '../../src/lib/lesson.js'
import { currentRequestContext } from './request-context.js'
import type { RequestContext, UsageEvent } from './request-context.js'
import { getServiceClient, isServiceConfigured } from './supabase-server.js'

/** Per-account usage log (`usage_events`): every provider call of an authenticated request is
 * collected on its context and written in one batch before the response ends. Calls outside an
 * authenticated request (tests, status checks) record nothing. */

export function recordUsage(event: Omit<UsageEvent, 'feature'> & { feature?: string }): void {
  const context = currentRequestContext()
  if (!context) return
  context.events.push({ ...event, feature: event.feature ?? context.feature })
}

/** Records one LLM call with its real token counts and the cost the price table gives for them. */
export function recordLlmUsage(provider: string, usage: { model: string; inputTokens: number; cachedTokens: number; cacheWriteTokens: number; outputTokens: number }): void {
  recordUsage({
    provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usageCostUsd(usage),
  })
}

/** Inserts the collected events; a failure is logged as one line (no user data) and never breaks the request. */
export async function flushUsage(context: RequestContext): Promise<void> {
  if (context.events.length === 0 || !isServiceConfigured()) return
  const rows = context.events.splice(0).map((event) => ({
    user_id: context.userId,
    feature: event.feature.slice(0, 60),
    provider: event.provider.slice(0, 60),
    model: event.model.slice(0, 100),
    input_tokens: Math.max(0, Math.round(event.inputTokens)),
    output_tokens: Math.max(0, Math.round(event.outputTokens)),
    cost_usd: Math.max(0, Math.round(event.costUsd * 1_000_000) / 1_000_000),
  }))
  try {
    const { error } = await getServiceClient().from('usage_events').insert(rows)
    if (error) console.error(`usage: insert failed code=${error.code ?? 'none'}`)
  } catch {
    console.error('usage: insert failed code=network')
  }
}
