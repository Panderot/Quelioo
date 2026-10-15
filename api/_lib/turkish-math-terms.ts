export const TURKISH_MATH_TERMS_RULE =
  "When you write in Turkish, use the standard Turkish school (MEB) math terms; for example, an antiderivative (primitive function) is 'ilkel fonksiyon', never 'asal fonksiyon'."

// "asal fonksiyon" is not a Turkish math term; the school term is "ilkel fonksiyon".
// Only the exact two-word phrase is replaced ("asal sayı", "asal çarpan", ... stay as they are).
const WRONG_TERM = /(?<![\p{L}\p{N}_])asal(\s+)fonks[iİI]yon/giu

export function fixTurkishMathTerms(text: string): string {
  return text.replace(WRONG_TERM, (match: string, space: string) => {
    const word = match.slice(0, 4)
    const fixed = word === word.toUpperCase() ? 'İLKEL' : word[0] === word[0].toUpperCase() ? 'İlkel' : 'ilkel'
    return fixed + space + match.slice(4 + space.length)
  })
}
