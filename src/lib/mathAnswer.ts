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

/**
 * Turns LaTeX / unicode / Turkish-style math text into plain mathjs-like syntax (relations such as
 * "=" are kept as written), or null when it contains LaTeX we don't understand.
 */
export function latexToPlainMath(raw: string): string | null {
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
  return text
}

/** Turns LaTeX / unicode / Turkish-style answer text into plain mathjs syntax, or null. */
function normalizeAnswerText(raw: string): string | null {
  let text = latexToPlainMath(raw)
  if (text === null) return null

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

export function isSafeNode(node: MathNode, symbols: Set<string>): boolean {
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

// ---- Final-answer comparison: option letters and multi-part answers ----

type OptionMap = Map<string, string>

/** Reads "A) 2  B) 4 ..." style options (inline or one per line) out of the problem text. */
function parseOptions(problem: string): OptionMap {
  const options: OptionMap = new Map()
  const marker = /(?:^|[\s,;])\(?([A-E])[).:]\s+/g
  const hits = [...problem.matchAll(marker)]
  hits.forEach((hit, index) => {
    const start = (hit.index ?? 0) + hit[0].length
    const end = index + 1 < hits.length ? (hits[index + 1].index ?? problem.length) : problem.length
    const value = problem
      .slice(start, end)
      .split('\n')[0]
      .trim()
      .replace(/[;,.]$/, '')
      .trim()
    if (value && !options.has(hit[1])) options.set(hit[1], value)
  })
  return options.size >= 2 ? options : new Map()
}

type Resolved = { letter: string | null; value: string }

/** Splits an option label off an answer: "4 (B)", "B) 4", "(B) 4", "B", "Cevap: B". */
function splitOptionLabel(raw: string, options: OptionMap): Resolved {
  const text = raw.replace(/\$+/g, '').replace(/^\s*(?:answer|cevap|yanıt|final answer)\s*[:：]\s*/iu, '').trim()
  const lead = /^\(?([A-E])[).:]\s*(.+)$/s.exec(text)
  if (lead) return { letter: lead[1], value: lead[2].trim() }
  const trail = /^(.+?)\s*[([]\s*([A-E])\s*[)\]]\s*\.?$/s.exec(text)
  if (trail) return { letter: trail[2], value: trail[1].trim() }
  const alone = /^\(?([A-E])\)?\.?$/.exec(text)
  if (alone && options.has(alone[1])) return { letter: alone[1], value: '' }
  return { letter: null, value: text }
}

function resolveValue(raw: string, options: OptionMap): { text: string; letter: string | null } {
  const { letter, value } = splitOptionLabel(raw, options)
  if (letter && options.has(letter)) {
    // The option text is the authoritative value for that letter; a stated value is kept only when there is no option text.
    return { text: value || options.get(letter) || '', letter }
  }
  return { text: value, letter }
}

/** Splits "a) 10 cm, b) 24 cm²", "AC = 10; area = 24", "AC = 10, area = 24" into parts. */
function splitParts(raw: string): { label: string | null; text: string }[] {
  const text = raw.replace(/\$+/g, '').trim()
  const labelled = [...text.matchAll(/(?:^|[\s,;])\(?([a-h])[).]\s+/g)]
  if (labelled.length >= 2) {
    return labelled.map((hit, index) => {
      const start = (hit.index ?? 0) + hit[0].length
      const end = index + 1 < labelled.length ? (labelled[index + 1].index ?? text.length) : text.length
      return { label: hit[1], text: text.slice(start, end).trim().replace(/[;,]$/, '').trim() }
    })
  }
  // A comma between digits with no space is a decimal comma; "10, 24" or ";" separate parts.
  const pieces = text.split(/;|,(?!\d)|(?<=\d\s),\s*|(?<!\d),/).map((piece) => piece.trim()).filter(Boolean)
  return pieces.map((piece) => ({ label: null, text: piece }))
}

/** "AC = 10 cm" → "10 cm" (a name before a single "=" is a label, not part of the value). */
function stripPartName(part: string): string {
  const sides = part.split('=')
  return sides.length === 2 && /^[^\d]*$/.test(sides[0]) ? sides[1].trim() : part
}

function comparePart(a: string, b: string): boolean | null {
  return compareMathAnswers(stripPartName(a), stripPartName(b))
}

/**
 * Compares two final answers of the same problem. Understands option letters ("4 (B)", "B) 4", "B"),
 * maps a bare letter to its option value from the problem, and compares multi-part answers part by
 * part. Returns null when it cannot decide locally, so the caller can fall back to the AI judge.
 */
export function compareFinalAnswers(a: string, b: string, problem = ''): boolean | null {
  const options = parseOptions(problem)
  const left = resolveValue(a, options)
  const right = resolveValue(b, options)

  if (left.letter && right.letter && left.letter === right.letter) return true
  if (left.letter && right.letter && left.letter !== right.letter && options.has(left.letter) && options.has(right.letter)) {
    const byValue = compareMathAnswers(options.get(left.letter) ?? '', options.get(right.letter) ?? '')
    if (byValue !== null) return byValue
  }

  // A bare option letter without a known option list can't be compared with a value.
  const bareLetter = (text: string) => /^[A-E]$/.test(text.trim())
  if ((bareLetter(left.text) || bareLetter(right.text)) && left.text.trim() !== right.text.trim()) return null

  const direct = compareMathAnswers(left.text, right.text)
  if (direct !== null) return direct

  // Multi-part answers: match by label when both have labels, otherwise by position.
  const leftParts = splitParts(left.text)
  const rightParts = splitParts(right.text)
  if (leftParts.length < 2 || leftParts.length !== rightParts.length) return null
  const labelled = leftParts.every((part) => part.label) && rightParts.every((part) => part.label)
  let undecided = false
  for (const [index, part] of leftParts.entries()) {
    const other = labelled ? rightParts.find((candidate) => candidate.label === part.label) : rightParts[index]
    if (!other) return null
    const result = comparePart(part.text, other.text)
    if (result === false) return false
    if (result === null) undecided = true
  }
  return undecided ? null : true
}
