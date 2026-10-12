/** Small text tools shared by the exam quality rules (Turkish-aware, suffix-tolerant). */

export function normalize(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** Turkish and English words lose their suffixes in the first five letters, so "kurultay", "kurultayı" and "kurultaya" match. */
export function stems(text: string, minLength = 3): Set<string> {
  const result = new Set<string>()
  for (const word of normalize(text).split(' ')) if (word.length >= minLength) result.add(word.slice(0, 5))
  return result
}

export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / Math.min(a.size, b.size)
}

export function shareOfUnion(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / (a.size + b.size - shared || 1)
}

/** Share of the words two normalised sentences have in common (shared / all different words). */
export function wordShare(a: string, b: string): number {
  return shareOfUnion(new Set(a.split(' ')), new Set(b.split(' ')))
}

/** Text without LaTeX ($...$) and bold markers, for word counts and lengths. */
export function plainText(text: string): string {
  return text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, ' x ').replace(/\*\*/g, '')
}

export function wordCountOf(text: string): number {
  return plainText(text).trim().split(/\s+/).filter(Boolean).length
}

/** Words that carry no subject on their own (Turkish and English function words). */
export const STOP_WORDS = new Set(
  [
    'bir', 'bu', 'şu', 'ile', 'için', 'gibi', 'daha', 'çok', 'olan', 'olarak', 'veya', 'ancak', 'fakat', 'ayrıca', 'sonra', 'önce', 'kadar', 'göre', 'ise', 'ki', 'de', 'da', 'ne', 'en', 'her', 'tüm', 'hem', 'ya',
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have', 'its', 'their', 'which', 'into', 'than', 'then', 'also',
  ].map((word) => word.toLocaleLowerCase('tr-TR')),
)

/** Distinct stems (first five letters) of the content words of a text: words of at least `minLength` letters that are not function words. */
export function contentStems(text: string, minLength = 5): Set<string> {
  const result = new Set<string>()
  for (const word of normalize(plainText(text)).split(' ')) {
    if (word.length >= minLength && !STOP_WORDS.has(word) && !/^\d+$/.test(word)) result.add(word.slice(0, 5))
  }
  return result
}
