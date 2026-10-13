/** Reads the number a numeric answer stands for, in the spellings a written key and a judge both use: 97, -4, 0,007 mm, 3.5, 97/289, \frac{97}{289}, \dfrac, \sqrt{2}, 2\sqrt{3}, $...$, 5,0·10⁻⁹. */

/** Two numbers closer than this share of the larger one are the same result (a rounded value of the same number). */
export const NUMERIC_TOLERANCE = 0.02

const SUPERSCRIPTS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' }
const PLAIN = /^\d+(?:[.,]\d+)?/
const SCIENTIFIC = /^\s*(?:\\cdot|\\times|×|·|⋅|\*|x|X)\s*10\s*(?:\^\s*\{?\s*([-+]?\d+)\s*\}?|([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))/

interface Read {
  value: number
  end: number
}

function clean(text: string): string {
  return text
    .replace(/\$/g, '')
    .replace(/\\(?:left|right|displaystyle|mathrm|text)/g, '')
    .replace(/\\dfrac|\\tfrac/g, '\\frac')
    .replace(/\{,\}/g, ',')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/[−–]/g, '-')
    .trim()
}

function toNumber(text: string): number {
  return Number(text.replace(',', '.'))
}

/** The text of a `{...}` group starting at `at`, and where it ends. */
function group(text: string, at: number): { inner: string; end: number } | null {
  let depth = 0
  for (let index = at; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1
    else if (text[index] === '}') {
      depth -= 1
      if (depth === 0) return { inner: text.slice(at + 1, index), end: index + 1 }
    }
  }
  return null
}

/** The argument of \frac or \sqrt: a `{...}` group (any answer) or a single digit (`\frac12`). */
function argument(text: string, at: number): Read | null {
  let start = at
  while (text[start] === ' ') start += 1
  if (text[start] === '{') {
    const found = group(text, start)
    if (!found) return null
    const value = valueOf(found.inner)
    return value === null ? null : { value, end: found.end }
  }
  return /\d/.test(text[start] ?? '') ? { value: Number(text[start]), end: start + 1 } : null
}

function root(text: string, at: number): Read | null {
  const found = argument(text, at + '\\sqrt'.length)
  return found && found.value >= 0 ? { value: Math.sqrt(found.value), end: found.end } : null
}

/** One term at `at`: a fraction, a root, or a plain number (with a mixed or `a/b` fraction, a root coefficient). */
function term(text: string, at: number): Read | null {
  if (text.startsWith('\\frac', at)) {
    const top = argument(text, at + '\\frac'.length)
    const bottom = top ? argument(text, top.end) : null
    return top && bottom && bottom.value !== 0 ? { value: top.value / bottom.value, end: bottom.end } : null
  }
  if (text.startsWith('\\sqrt', at)) return root(text, at)
  const plain = PLAIN.exec(text.slice(at))
  if (!plain) return null
  let value = toNumber(plain[0])
  let end = at + plain[0].length
  const rest = text.slice(end)
  const mixed = /^ (\d+)\/(\d+)(?!\d)/.exec(rest)
  const slash = /^\s*\/\s*(\d+(?:[.,]\d+)?)/.exec(rest)
  if (mixed && /^\d+$/.test(plain[0]) && Number(mixed[2]) !== 0) {
    value += Number(mixed[1]) / Number(mixed[2])
    end += mixed[0].length
  } else if (slash && toNumber(slash[1]) !== 0) {
    value /= toNumber(slash[1])
    end += slash[0].length
  } else if (text.startsWith('\\sqrt', end)) {
    const factor = root(text, end)
    if (factor) {
      value *= factor.value
      end = factor.end
    }
  }
  return { value, end }
}

function valueOf(raw: string): number | null {
  const text = clean(raw)
  let at = 0
  let sign = 1
  if (text[at] === '-' || text[at] === '+') {
    if (text[at] === '-') sign = -1
    at += 1
  }
  while (text[at] === ' ') at += 1
  const first = term(text, at)
  if (!first || !Number.isFinite(first.value)) return null
  let value = first.value
  const scientific = SCIENTIFIC.exec(text.slice(first.end))
  if (scientific) {
    const exponent = scientific[1] ?? [...scientific[2]].map((char) => SUPERSCRIPTS[char] ?? '').join('')
    value *= 10 ** Number(exponent)
  }
  return sign * value
}

/** The number an answer starts with, or null when it does not start with a number. */
export function numericValue(text: string): number | null {
  return valueOf(text)
}

/** Does the answer start with a number (in any of the spellings above)? */
export function isNumericAnswer(text: string): boolean {
  return numericValue(text) !== null
}

/** Do two answers hold different numbers? False when either is not a number: only a definite difference counts. */
export function numbersDiffer(a: string, b: string): boolean {
  const first = numericValue(a)
  const second = numericValue(b)
  if (first === null || second === null) return false
  return Math.abs(first - second) > NUMERIC_TOLERANCE * Math.max(Math.abs(first), Math.abs(second))
}
