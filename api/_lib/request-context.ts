import { AsyncLocalStorage } from 'node:async_hooks'

/** Who is calling and what they are paying for, carried through one authenticated request without
 * passing it down every function: the LLM wrapper and the audio code read it to log usage. */

export interface UsageEvent {
  feature: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface RequestContext {
  userId: string
  feature: string
  /** Usage collected during the request; written in one batch before the response ends. */
  events: UsageEvent[]
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(context: RequestContext, work: () => T): T {
  return storage.run(context, work)
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore()
}
