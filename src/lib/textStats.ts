export const MIN_QUIZ_WORDS = 30
export const MAX_QUIZ_WORDS = 5000

export function countWords(value: string): number {
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
}
