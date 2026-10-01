import { parse } from 'mathjs/number'
import type { MathNode } from 'mathjs/number'

/**
 * Decides whether two short math answers are equivalent ("8", "8.0", "8,0", "16/2", "x = 8",
 * "$\frac{16}{2}$", "10 cm", "2x+3" vs "3+2x"). Shared by the server (answer-key checks) and the
 * client (lazily loaded for the similar-problem answer check).
 *
 * Only a whitelisted subset of mathjs syntax is ever evaluated (numbers, single-letter variables,
 * + - * / ^, parentheses, sqrt/abs, pi/e) — user text never reaches mathjs' full evaluator.
 * Returns null when either side isn't a simple value/expression, so the caller can fall back to
 * an AI judge instead of guessing.
 */

const MAX_INPUT_CHARS = 200
const ALLOWED_FUNCTIONS = new Set(['sqrt', 'abs'])
const CONSTANTS = new Set(['pi', 'e'])
const SAMPLE_POINTS = [0.37, -1.21, 1.73, 2.59, -2.43]

type Prepared = { kind: 'number'; value: number } | { kind: 'expression'; node: MathNode; symbols: Set<string> }

const UNIT_SUFFIX =
  /(?<=[\d)\s])\s*(?:cm|mm|km|kg|mg|ml|tl|₺|lira|derece|degrees?|deg|°|saat|dakika|dk|saniye|sn|birim|units?|metre|meters?|metres|santimetre|gram|grams?|m|g|l|s|h|%)(?:\^?[23]|[²³])?\.?$/iu

/** Turns LaTeX / unicode / Turkish-style answer text into plain mathjs syntax, or null. */
export function normalizeAnswerText(raw: string): string | null {
  let text = raw.trim()
  if (!text || text.length > MAX_INPUT_CHARS * 2) return null

  text = text
    .replace(/\$+/g, '')
    .replace(/\\[()[\]]/g, '')
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/\\(?:text|mathrm|mbox|operatorname)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\(?:,|;|:|!| )|~/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/\\(?:cdot|times)/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\circ\b/g, '°')
    .replace(/\^\{?\\circ\}?/g, '°')

  // \frac{a}{b} (also \dfrac/\tfrac), innermost first so nesting works.
  for (let guard = 0; guard < 10 && /\\[dt]?frac\s*\{/.test(text); guard += 1) {
    text = text.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))')
  }
  text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
  if (/\\[a-zA-Z]/.test(text)) return null // some other LaTeX command we don't understand

  text = text
    .replace(/[{}]/g, (brace) => (brace === '{' ? '(' : ')'))
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/π/g, 'pi')
    // Turkish suffixes after an apostrophe ("10 cm'dir", "8'dir") and trailing sentence punctuation.
    .replace(/['’]\p{L}*\s*$/u, '')
    .replace(/[.。]\s*$/, '')
    .trim()

  // "x = 8" → "8"; "8 = x" → "8". Anything with more structure is an equation we don't grade locally.
  const sides = text.split('=')
  if (sides.length === 2) {
    const [left, right] = sides.map((side) => side.trim())
    if (/^[a-zA-Z]?$/.test(left)) text = right
    else if (/^[a-zA-Z]$/.test(right)) text = left
    else return null
  } else if (sides.length > 2) {
    return null
  }

  // Comma decimals ("8,0", "2,5"); any other comma means a list — not a single value.
  text = text.replace(/(\d),(\d)/g, '$1.$2')
  if (text.includes(',') || text.includes(';')) return null
  if (!text || text.length > MAX_INPUT_CHARS) return null
  return text
}

function isSafeNode(node: MathNode, symbols: Set<string>): boolean {
  switch (node.type) {
    case 'ConstantNode':
      return typeof (node as unknown as { value: unknown }).value === 'number'
    case 'SymbolNode': {
      const name = (node as unknown as { name: string }).name
      if (CONSTANTS.has(name)) return true
      if (/^[a-zA-Z]$/.test(name)) {
        symbols.add(name)
        return true
      }
      return false
    }
    case 'OperatorNode': {
      const op = (node as unknown as { op: string }).op
      if (!['+', '-', '*', '/', '^'].includes(op)) return false
      return (node as unknown as { args: MathNode[] }).args.every((arg) => isSafeNode(arg, symbols))
    }
    case 'ParenthesisNode':
      return isSafeNode((node as unknown as { content: MathNode }).content, symbols)
    case 'FunctionNode': {
      const fn = (node as unknown as { fn: { name?: string } }).fn
      const args = (node as unknown as { args: MathNode[] }).args
      return !!fn?.name && ALLOWED_FUNCTIONS.has(fn.name) && args.length === 1 && args.every((arg) => isSafeNode(arg, symbols))
    }
    default:
      return false
  }
}

function prepareText(text: string): Prepared | null {
  let node: MathNode
  try {
    node = parse(text)
  } catch {
    return null
  }
  const symbols = new Set<string>()
  if (!isSafeNode(node, symbols)) return null
  if (symbols.size === 0) {
    try {
      const value = node.compile().evaluate({})
      return typeof value === 'number' && Number.isFinite(value) ? { kind: 'number', value } : null
    } catch {
      return null
    }
  }
  return { kind: 'expression', node, symbols }
}

/** Parses an answer into a number or a safe expression; tries again without a trailing unit. */
export function prepareAnswer(raw: string): Prepared | null {
  const text = normalizeAnswerText(raw)
  if (text === null) return null
  const direct = prepareText(text)
  if (direct?.kind === 'number') return direct
  const withoutUnit = text.replace(UNIT_SUFFIX, '').trim()
  if (withoutUnit && withoutUnit !== text) {
    const stripped = prepareText(withoutUnit)
    if (stripped?.kind === 'number') return stripped
  }
  return direct
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

function evaluateAt(node: MathNode, scope: Record<string, number>): number | null {
  try {
    const value = node.compile().evaluate(scope)
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** true/false when both sides are simple values/expressions; null when it can't be decided locally. */
export function compareMathAnswers(a: string, b: string): boolean | null {
  const left = prepareAnswer(a)
  const right = prepareAnswer(b)
  if (!left || !right) return null
  if (left.kind === 'number' && right.kind === 'number') return nearlyEqual(left.value, right.value)
  if (left.kind !== right.kind) return false

  const leftExpr = left as Extract<Prepared, { kind: 'expression' }>
  const rightExpr = right as Extract<Prepared, { kind: 'expression' }>
  const symbols = [...new Set([...leftExpr.symbols, ...rightExpr.symbols])]
  let compared = 0
  for (let point = 0; point < SAMPLE_POINTS.length; point += 1) {
    const scope = Object.fromEntries(symbols.map((symbol, index) => [symbol, SAMPLE_POINTS[(point + index) % SAMPLE_POINTS.length] + index * 0.11]))
    const l = evaluateAt(leftExpr.node, scope)
    const r = evaluateAt(rightExpr.node, scope)
    if (l === null || r === null) continue
    if (Math.abs(l - r) > 1e-7 * Math.max(1, Math.abs(l), Math.abs(r))) return false
    compared += 1
  }
  return compared >= 3 ? true : null
}

/** Whether an expected answer can be checked locally at all. */
export function isLocallyCheckable(expected: string): boolean {
  return prepareAnswer(expected) !== null
}
