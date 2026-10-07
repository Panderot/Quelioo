import { isSectionTagLine } from './songTags.js'

/** Lyrics should use most of the character budget, not half of it. */
export const LYRICS_MIN_FILL = 0.8
export const LYRICS_MAX_FILL = 0.95
/** Below this the song is rewritten longer instead of accepted as is. */
const LYRICS_REWRITE_FILL = 0.7

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
function lyricsFillRatio(lyrics: string, maxChars: number): number {
  return maxChars > 0 ? lyrics.length / maxChars : 1
}

export function isLyricsTooShort(lyrics: string, maxChars: number): boolean {
  return lyricsFillRatio(lyrics, maxChars) < LYRICS_REWRITE_FILL
}

/** Words that make a claim stronger than most sources do. A lyric may use one only when the source does. */
const ABSOLUTE_WORDS = ['tamamen', 'asla', 'her zaman', 'hiçbir', 'hiç bir', 'kesinlikle', 'daima', 'mutlaka', 'always', 'never', 'completely', 'entirely', 'absolutely']
/** A lyric word may be a longer source word without its ending (a Turkish suffix), but not a cut-off term. */
const MAX_SUFFIX_LETTERS = 5
const MIN_TERM_LETTERS = 9
const MIN_CUT_LETTERS = 4

/** 0-based lyric lines that break the source's wording: a term shortened into something else (such as
 * "karbon" for "karbondioksit") or an absolute claim ("tamamen", "asla") the source never makes.
 * `reference` is the source excerpt plus the key facts. Deterministic, so it also works when the AI
 * review was skipped or missed it. */
export function findTermViolations(lyrics: string, reference: string): number[] {
  const referenceText = ` ${words(reference).join(' ')} `
  const referenceWords = [...new Set(words(reference))]
  const longTerms = referenceWords.filter((word) => word.length >= MIN_TERM_LETTERS)
  const found: number[] = []
  lyrics.split('\n').forEach((line, index) => {
    if (!line.trim() || isSectionTagLine(line)) return
    const lineWords = words(line)
    const lineText = ` ${lineWords.join(' ')} `
    const absolute = ABSOLUTE_WORDS.some((word) => lineText.includes(` ${word} `) && !referenceText.includes(` ${word} `))
    const cutTerm = lineWords.some(
      (word) =>
        word.length >= MIN_CUT_LETTERS &&
        !referenceWords.some((known) => known === word || (known.startsWith(word) && known.length - word.length <= MAX_SUFFIX_LETTERS)) &&
        longTerms.some((term) => term.startsWith(word) && term.length - word.length > MAX_SUFFIX_LETTERS),
    )
    if (absolute || cutTerm) found.push(index)
  })
  return found
}

/** Fits lyrics into the line and character budget by dropping whole lines from the end — never by
 * cutting a line in the middle — and never leaves a section tag with nothing under it. `overflow`
 * tells the caller the writer went over, so the one rewrite can shorten instead of losing facts. */
export function fitLyricsToLimits(raw: string, maxLines: number, maxChars: number): { lyrics: string; overflow: boolean } {
  // Blank lines are not sung and must not use up the line budget.
  const all = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  let lines = all.slice(0, maxLines)
  while (lines.length > 1 && lines.join('\n').trim().length > maxChars) lines = lines.slice(0, -1)
  while (lines.length > 0 && isSectionTagLine(lines[lines.length - 1])) lines = lines.slice(0, -1)
  const lyrics = lines.join('\n').trim()
  return { lyrics, overflow: all.length > maxLines || all.join('\n').trim().length > maxChars }
}

/** The most characters one fact line may use so that every key fact, the chorus and the section tags
 * still fit the budget (about a tag line per four lyric lines). */
export function maxCharsPerFactLine(maxChars: number, factCount: number): number {
  const lines = factCount + 3
  const tagChars = Math.ceil(lines / 4) * 12
  return Math.max(24, Math.floor((maxChars * LYRICS_MAX_FILL - tagChars) / lines))
}
