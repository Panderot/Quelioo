/**
 * LaTeX -> readable plain text ("(2⁵ · 4³) / 8³"). Shared by the browser and the server: used
 * wherever math leaves the KaTeX-rendered Solve page (quiz text box, quiz questions, speech,
 * song facts, screen-reader announcements) and as the fallback for broken LaTeX.
 */

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
}
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
}

const SYMBOLS: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', circ: '°', degree: '°', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ',
  delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', omega: 'ω', Omega: 'Ω', phi: 'φ',
  angle: '∠', triangle: '△', perp: '⊥', parallel: '∥', infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒',
  Leftrightarrow: '⇔', leftrightarrow: '↔', ldots: '…', dots: '…', cdots: '…', sum: 'Σ', in: '∈', cup: '∪', cap: '∩',
  sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', lim: 'lim',
}

/** Index just past the `{...}` group that starts at `start` (a "{"), or -1 when it never closes. */
function groupEnd(text: string, start: number): number {
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1
    else if (text[index] === '}') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return -1
}

/** Reads one argument at `pos`: a `{group}` (braces stripped) or a single character. */
function readArg(text: string, pos: number): { value: string; end: number } | null {
  let at = pos
  while (text[at] === ' ') at += 1
  if (at >= text.length) return null
  if (text[at] === '{') {
    const end = groupEnd(text, at)
    if (end < 0) return null
    return { value: text.slice(at + 1, end - 1), end }
  }
  if (text[at] === '\\') {
    const command = /^\\[a-zA-Z]+/.exec(text.slice(at))
    if (command) return { value: command[0], end: at + command[0].length }
  }
  return { value: text[at], end: at + 1 }
}

// Private-use stand-ins for a "^" / "_" that is already converted, so the loop below never rewrites it twice.
const CARET = ''
const UNDER = ''

function script(value: string, table: Record<string, string>, marker: '^' | '_'): string {
  const chars = [...value.replace(/\s+/g, '')]
  if (chars.length > 0 && chars.every((char) => table[char] !== undefined)) return chars.map((char) => table[char]).join('')
  const mark = marker === '^' ? CARET : UNDER
  if (chars.length === 1) return `${mark}${chars[0]}`
  return `${mark}(${value.trim()})`
}

/** The last match of a global regex (the innermost of nested commands), or null. */
function lastMatch(pattern: RegExp, text: string): RegExpExecArray | null {
  let last: RegExpExecArray | null = null
  pattern.lastIndex = 0
  for (let found = pattern.exec(text); found; found = pattern.exec(text)) last = found
  return last
}

const isSimple = (value: string) => /^[\p{L}\p{N}.,²³¹⁰⁴⁵⁶⁷⁸⁹°]+$/u.test(value.trim())
const wrap = (value: string) => (isSimple(value) ? value.trim() : `(${value.trim()})`)

/** Converts LaTeX commands in already de-dollared text. Never throws; unknown commands lose their backslash. */
function convertLatex(input: string): string {
  let text = input
  // Spacing commands first, so "4=2^2,\qquad 8=2^3" becomes "4=2^2, 8=2^3".
  text = text.replace(/\\(?:qquad|quad|,|;|:|!| |\\)|~/g, ' ').replace(/\\(?:left|right|bigl|bigr|Big|big)\b/g, '')
  text = text.replace(/\^\s*\{?\s*°\s*\}?/g, '°')
  text = text.replace(/\^\s*\{?\s*\\circ\s*\}?/g, '°').replace(/\\%/g, '%').replace(/\\\$/g, '$')
  text = text.replace(/\\(?:text|textbf|mathrm|mathbf|mathit|mbox|operatorname)\s*\{([^{}]*)\}/g, '$1')
  text = text.replace(/\\(?:overline|vec|hat|bar)\s*\{([^{}]*)\}/g, '$1')
  text = text.replace(/\\(?!(?:[dt]?frac|sqrt)\b)([a-zA-Z]+)/g, (_m, name: string) => SYMBOLS[name] ?? name)

  // \frac / \sqrt / ^ / _ need balanced-brace parsing; repeat so nested ones resolve (innermost first by scanning).
  for (let guard = 0; guard < 40; guard += 1) {
    const frac = lastMatch(/\\[dt]?frac\b/g, text)
    const sqrt = lastMatch(/\\sqrt\b/g, text)
    const sup = lastMatch(/\^/g, text)
    const sub = lastMatch(/_/g, text)
    const candidates = [frac, sqrt, sup, sub].filter((match): match is RegExpExecArray => match !== null)
    if (candidates.length === 0) break
    // Resolve the one whose argument contains no further special command first.
    let progressed = false
    for (const match of candidates.sort((a, b) => b.index - a.index)) {
      const start = match.index
      if (match === frac) {
        const first = readArg(text, start + match[0].length)
        const second = first && readArg(text, first.end)
        if (!first || !second || /[\\^_]/.test(first.value + second.value)) continue
        const bothSimple = isSimple(first.value) && isSimple(second.value)
        text = `${text.slice(0, start)}${bothSimple ? `${first.value.trim()}/${second.value.trim()}` : `${wrap(first.value)} / ${wrap(second.value)}`}${text.slice(second.end)}`
      } else if (match === sqrt) {
        const arg = readArg(text, start + match[0].length)
        if (!arg || /[\\^_]/.test(arg.value)) continue
        text = `${text.slice(0, start)}√${isSimple(arg.value) ? arg.value.trim() : `(${arg.value.trim()})`}${text.slice(arg.end)}`
      } else {
        const arg = readArg(text, start + 1)
        if (!arg || /[\\^_]/.test(arg.value)) {
          if (!arg) text = text.slice(0, start) + text.slice(start + 1)
          else continue
        } else {
          text = `${text.slice(0, start)}${match === sup ? script(arg.value, SUPERSCRIPT, '^') : script(arg.value, SUBSCRIPT, '_')}${text.slice(arg.end)}`
        }
      }
      progressed = true
      break
    }
    if (!progressed) break
  }

  text = text.replace(/\\[dt]?(?:frac|sqrt)\b/g, '').replace(/([∠△]) /g, '$1')
  text = text.replace(/\\(.)/g, '$1').replace(/[{}]/g, '')
  return text.replace(new RegExp(CARET, 'g'), '^').replace(new RegExp(UNDER, 'g'), '_')
}

function tidyMath(math: string): string {
  return convertLatex(math)
    .replace(/\s*(=|≤|≥|≠|≈|→|⇒)\s*/g, ' $1 ')
    .replace(/\s*([·×÷])\s*/g, ' $1 ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** True when the text has `$...$` math or a LaTeX command — what makes it worth converting. */
export function hasLatex(text: string): boolean {
  return /\$[^$\n]+\$/.test(text) || /\\(?:frac|dfrac|cdot|times|sqrt|qquad|quad|left|right|text|circ|leq|geq|pm|div)\b/.test(text)
}

// $$block$$ then $inline$; the opening $ must touch the math and the closing one must not touch a digit ("$5 and $6" is money).
const MATH_PAIR = /\$\$([\s\S]+?)\$\$|\$(?=\S)([^$\n]*?\S)\$(?!\d)/g

/** Readable plain text for text that may contain LaTeX. Text without LaTeX comes back unchanged. */
export function mathToPlainText(text: string, trim = true): string {
  if (!text || (!text.includes('$') && !text.includes('\\'))) return text
  const withoutPairs = text.replace(MATH_PAIR, (_m, block: string | undefined, inline: string | undefined) => tidyMath(block ?? inline ?? ''))
  // Bare commands outside $...$ (a model that forgot the dollars).
  // A leftover "$" next to a command is an unclosed delimiter, not money.
  const converted = /\\[a-zA-Z]/.test(withoutPairs) ? convertLatex(withoutPairs.replace(/(?<!\\)\$/g, '')) : withoutPairs
  const cleaned = converted.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1')
  return trim ? cleaned.trim() : cleaned
}

/** Applies `mathToPlainText` to every string in a JSON-like value (new object; input untouched). */
export function deepMathToPlain<T>(value: T): T {
  if (typeof value === 'string') return mathToPlainText(value) as unknown as T
  if (Array.isArray(value)) return value.map((item) => deepMathToPlain(item)) as unknown as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepMathToPlain(item)])) as T
  }
  return value
}
