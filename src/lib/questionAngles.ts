/** Angles the generation prompt can lean on for variety — a random subset is picked per request. */
const QUESTION_ANGLES = [
  'definitions',
  'cause and effect',
  'real-life application',
  'comparison',
  'numbers and dates',
  'common misconceptions',
  '"which statement is NOT true" style',
  '"what would happen if" style',
  'short scenario-based questions',
  'ordering of events',
] as const

function shuffled<T>(items: readonly T[]): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

export function pickRandomAngles(count = 4): string[] {
  return shuffled(QUESTION_ANGLES).slice(0, Math.min(count, QUESTION_ANGLES.length))
}

export function randomVariationSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}
