/** OpenAI models for the cheap checks and the stronger review passes of quiz and card generation. */
export const REVIEW_MODELS = { strong: 'gpt-6-sol', cheap: 'gpt-6-luna' } as const

/** USD per 1M tokens (OpenAI pricing page). Cache writes bill at 1.25x input, cache reads at the cached rate. */
const MODEL_PRICES: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-6-sol': { input: 2, cached: 0.2, output: 10 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  // OPENAI_MODEL default for quiz generation when it falls back to OpenAI.
  'gpt-5.6-luna': { input: 0.2, cached: 0.02, output: 1.2 },
  // Quiz generation's default Anthropic model (Anthropic pricing table).
  'claude-sonnet-5-5': { input: 2, cached: 0.2, output: 10 },
}

export interface TokenUsage {
  model: string
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  outputTokens: number
}

export function usageCostUsd(usage: TokenUsage): number {
  const price = MODEL_PRICES[usage.model] ?? MODEL_PRICES['gpt-6-sol']
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens - usage.cacheWriteTokens)
  return (uncached * price.input + usage.cacheWriteTokens * price.input * 1.25 + usage.cachedTokens * price.cached + usage.outputTokens * price.output) / 1_000_000
}

/** "$0.048" below a dollar (three decimals), "$1.20" above. */
export function formatUsd(value: number): string {
  return value < 1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`
}
