export const MIN_QUIZ_WORDS = 30
export const MAX_QUIZ_WORDS = 5000
/** Hard backstop independent of word count — catches pathological input (e.g. one huge
 * unbroken string) that would otherwise slip past the word-count check. */
export const MAX_SOURCE_TEXT_CHARS = 80_000

interface WordSegment {
  segment: string
  isWordLike?: boolean
}

interface WordSegmenter {
  segment(input: string): Iterable<WordSegment>
}

function createWordSegmenter(): WordSegmenter | null {
  const SegmenterCtor = (Intl as unknown as { Segmenter?: new (locale: undefined, options: { granularity: string }) => WordSegmenter })
    .Segmenter
  if (typeof SegmenterCtor !== 'function') return null
  try {
    return new SegmenterCtor(undefined, { granularity: 'word' })
  } catch {
    return null
  }
}

const segmenter = createWordSegmenter()

/**
 * Shared word counter for client and server. Uses Intl.Segmenter (word granularity) so it
 * counts Turkish/English/Armenian/Arabic/CJK/Thai text sensibly, with a whitespace-split
 * fallback when Intl.Segmenter isn't available. Numbers and hyphen/apostrophe-joined words
 * (e.g. "state-of-the-art", "2024-2025") count as one word; emoji, punctuation and extra
 * whitespace are ignored.
 */
export function countWords(value: string): number {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return 0

  if (!segmenter) {
    return trimmed.split(/\s+/).filter(Boolean).length
  }

  let count = 0
  let previousWasWord = false
  let pendingConnector = false

  for (const { segment: piece, isWordLike } of segmenter.segment(trimmed)) {
    if (isWordLike) {
      if (!(previousWasWord && pendingConnector)) count++
      previousWasWord = true
      pendingConnector = false
    } else if (previousWasWord && /^[-'’]$/.test(piece)) {
      pendingConnector = true
    } else {
      previousWasWord = false
      pendingConnector = false
    }
  }

  return count || trimmed.split(/\s+/).filter(Boolean).length
}
