import { isSectionTagLine } from './songTags.js'

/** Lyrics should use most of the character budget, not half of it. */
export const LYRICS_MIN_FILL = 0.8
export const LYRICS_MAX_FILL = 0.95
/** Below this the song is rewritten longer instead of accepted as is. */
export const LYRICS_REWRITE_FILL = 0.7

/** Phrases that only fill rhythm. A line made of one of these (plus little else) teaches nothing. */
const FILLER_PHRASES = [
  'görev tamam',
  'hadi bakalım',
  'haydi bakalım',
  'işte böyle',
  'işte bu kadar',
  'hep birlikte söyleyelim',
  'söyle söyle',
  'la la la',
  'na na na',
  'here we go',
  "that's how it goes",
  "that's the way",
  'yeah yeah',
  'oh oh oh',
]

const FILLER_MAX_EXTRA_WORDS = 2

function words(text: string): string[] {
  return text
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** 0-based line indexes whose whole content is a filler phrase with at most a couple of extra words
 * (a line that also carries a fact is longer and is judged by the review step instead). */
export function findFillerLines(lyrics: string): number[] {
  const found: number[] = []
  lyrics.split('\n').forEach((line, index) => {
    if (!line.trim() || isSectionTagLine(line)) return
    const lineWords = words(line)
    const text = lineWords.join(' ')
    const hit = FILLER_PHRASES.find((phrase) => text.includes(words(phrase).join(' ')))
    if (!hit) return
    const extra = lineWords.length - words(hit).length
    if (extra <= FILLER_MAX_EXTRA_WORDS) found.push(index)
  })
  return found
}

/** Characters of the lyrics (tags and line breaks included, as the counter shows them) over the limit. */
export function lyricsFillRatio(lyrics: string, maxChars: number): number {
  return maxChars > 0 ? lyrics.length / maxChars : 1
}

export function isLyricsTooShort(lyrics: string, maxChars: number): boolean {
  return lyricsFillRatio(lyrics, maxChars) < LYRICS_REWRITE_FILL
}
