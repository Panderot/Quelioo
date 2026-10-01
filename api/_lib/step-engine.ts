import { parse } from 'mathjs/number'
import type { MathNode } from 'mathjs/number'

import { isSafeNode, latexToPlainMath, prepareAnswer } from '../../src/lib/mathAnswer.js'

/**
 * Deterministic checker for the student's own steps in "Check my solution". Every line is parsed
 * (whitelisted mathjs nodes only, see mathAnswer.ts) and compared with the previous statement:
 *   - an equation is valid when it has the same solution set as the previous equation (proportional
 *     sides, otherwise real roots found by a dense scan plus the reference answer as a candidate);
 *   - an inequality when it is true at exactly the same sample points;
 *   - an expression when it is equivalent to the previous expression;
 *   - a statement without variables when it is true.
 * "invalid" is only returned when the engine is sure; anything ambiguous (domain restrictions,
 * case splits, squaring, words, unparsed math in between) is "unknown" and left to the AI grader.
 */

export type EngineVerdict = 'valid' | 'invalid' | 'unknown'

type Fn = (scope: Record<string, number>) => number | null

interface Expr {
  fn: Fn
  symbols: Set<string>
}

type IneqOp = '<' | '>' | '<=' | '>='

type Statement =
  | { kind: 'eq'; left: Expr; right: Expr; approx: boolean; cache?: RootInfo | null }
  | { kind: 'ineq'; left: Expr; right: Expr; op: IneqOp }
  | { kind: 'expr'; expr: Expr }

interface Parsed {
  /** Compared with the previous statement. */
  statement: Statement
  /** What the next line is compared with (the end of an expression chain). */
  result: Statement
  /** The line itself is already wrong (e.g. "x = 15 - 7 = 7"). */
  internallyInvalid: boolean
  /** A leading "=" continues the previous expression. */
  continuation: boolean
}

interface RootInfo {
  roots: number[]
}

const SAMPLE_POINTS = [0.37, -1.21, 1.73, 2.59, -2.43, 3.17, -4.61, 7.3, -11.9, 0.83, 13.7, -0.57, 5.29, -6.83, 21.4, -0.29]
const MIN_COMPARED = 6
const ROOT_TOLERANCE = 1e-7
const MAX_ROOTS = 40

// sinh-spaced grid: fine near 0, still reaching ±80 000 (answers like "1500 TL").
const GRID: number[] = (() => {
  const count = 12_000
  const out: number[] = []
  for (let index = 0; index <= count; index += 1) out.push(Math.sinh(-12 + (24 * index) / count))
  return out
})()

const SPLITTERS = /\\Rightarrow|\\rightarrow|\\implies|\\Longrightarrow|\\iff|\\therefore|\\to\b|\\quad|\\qquad|\\\\|⇒|→|⟹|∴|⇔/g
const RELATION_CHARS = /[=<>≤≥≈]|\\(?:le|ge|leq|geq|lt|gt|approx|neq|ne)\b/

function compileExpr(text: string): Expr | null {
  const source = text
    .trim()
    // "x(x + 1)" would be a function call in mathjs; make it a product.
    .replace(/(^|[^a-zA-Z])([a-zA-Z])\s*\(/g, '$1$2*(')
  if (!source) return null
  let node: MathNode
  try {
    node = parse(source)
  } catch {
    return null
  }
  const symbols = new Set<string>()
  if (!isSafeNode(node, symbols)) return null
  const compiled = node.compile()
  const fn: Fn = (scope) => {
    try {
      const value = compiled.evaluate({ ...scope })
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    } catch {
      return null
    }
  }
  return { fn, symbols }
}

/** Plain text of one math statement, or null when it is not something we can check. */
function toPlain(raw: string): string | null {
  if (/\\neq?\b|≠/.test(raw)) return null
  const prepared = raw
    .replace(/\\leq?\b|≤|⩽/g, ' <= ')
    .replace(/\\geq?\b|≥|⩾/g, ' >= ')
    .replace(/\\lt\b/g, ' < ')
    .replace(/\\gt\b/g, ' > ')
    .replace(/\\approx\b|\\simeq\b|≈/g, ' ≈ ')
    .replace(/&/g, ' ')
  const plain = latexToPlainMath(prepared)
  if (plain === null) return null
  const text = plain.replace(/(\d),(\d)/g, '$1.$2')
  if (/[,;:]/.test(text)) return null
  // "1.500" can be a Turkish thousands separator — ambiguous, so don't judge it.
  if (/(?<![\d.])[1-9]\d{0,2}(?:\.\d{3})+(?![\d.])/.test(text)) return null
  return text
}

function parseStatement(raw: string): Parsed | null {
  const text = toPlain(raw)
  if (text === null) return null
  const tokens = text.split(/(<=|>=|≈|<|>|=)/)
  const parts = tokens.filter((_, index) => index % 2 === 0).map((part) => part.trim())
  const relations = tokens.filter((_, index) => index % 2 === 1)

  const single = (statement: Statement, continuation = false): Parsed => ({ statement, result: statement, internallyInvalid: false, continuation })
  const exprChain = (list: Expr[], continuation: boolean): Parsed => ({
    statement: { kind: 'expr', expr: list[0] },
    result: { kind: 'expr', expr: list[list.length - 1] },
    internallyInvalid: list.some((expr, index) => index > 0 && exprEquivalent(list[index - 1], expr) === false),
    continuation,
  })

  if (relations.length === 0) {
    const expr = compileExpr(text)
    return expr ? single({ kind: 'expr', expr }) : null
  }

  // "= 2x + 1": continues the previous expression.
  if (parts[0] === '' && relations.every((relation) => relation === '=')) {
    const exprs = parts.slice(1).map(compileExpr)
    if (exprs.some((expr) => expr === null)) return null
    return exprChain(exprs as Expr[], true)
  }

  const exprs = parts.map(compileExpr)
  if (exprs.some((expr) => expr === null)) return null
  const list = exprs as Expr[]

  if (relations.length === 1) {
    const [left, right] = list
    const relation = relations[0]
    if (relation === '=' || relation === '≈') return single({ kind: 'eq', left, right, approx: relation === '≈' })
    return single({ kind: 'ineq', left, right, op: relation as IneqOp })
  }

  // Chains: only "a = b = c" with all "=".
  if (!relations.every((relation) => relation === '=')) return null
  const withVars = list.map((expr) => expr.symbols.size > 0)
  // An expression chain: (x+1)^2 - x^2 = x^2 + 2x + 1 - x^2 = 2x + 1
  if (withVars.every(Boolean)) return exprChain(list, false)
  const onlyFirst = withVars[0] && withVars.slice(1).every((has) => !has)
  const onlyLast = withVars[withVars.length - 1] && withVars.slice(0, -1).every((has) => !has)
  if (!onlyFirst && !onlyLast && withVars.some(Boolean)) return null
  // Constants in the chain must agree ("x = 15 - 7 = 8").
  const constants = list.filter((expr) => expr.symbols.size === 0).map((expr) => expr.fn({}))
  if (constants.some((value) => value === null)) return null
  const values = constants as number[]
  const statement: Statement = { kind: 'eq', left: list[0], right: list[list.length - 1], approx: false }
  return { ...single(statement), internallyInvalid: values.some((value, index) => index > 0 && !close(values[index - 1], value, 1e-9)) }
}

function close(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b))
}

function scopeAt(symbols: string[], point: number): Record<string, number> {
  return Object.fromEntries(symbols.map((symbol, index) => [symbol, SAMPLE_POINTS[(point + index * 5) % SAMPLE_POINTS.length] + index * 0.11]))
}

/** true / false when decided, null when there were too few points where both are defined. */
function exprEquivalent(a: Expr, b: Expr): boolean | null {
  const symbols = [...new Set([...a.symbols, ...b.symbols])]
  let compared = 0
  for (let point = 0; point < SAMPLE_POINTS.length; point += 1) {
    const scope = scopeAt(symbols, point)
    const left = a.fn(scope)
    const right = b.fn(scope)
    if (left === null || right === null) continue
    if (!close(left, right, 1e-7)) return false
    compared += 1
    if (symbols.length === 0) break
  }
  return compared >= (symbols.length === 0 ? 1 : MIN_COMPARED) ? true : null
}

function symbolsOf(statement: Statement): Set<string> {
  if (statement.kind === 'expr') return statement.expr.symbols
  return new Set([...statement.left.symbols, ...statement.right.symbols])
}

type Side = { kind: 'eq' | 'ineq'; left: Expr; right: Expr }

function residual(side: Side, scope: Record<string, number>): { diff: number; scale: number } | null {
  const left = side.left.fn(scope)
  const right = side.right.fn(scope)
  if (left === null || right === null) return null
  return { diff: left - right, scale: Math.max(1, Math.abs(left), Math.abs(right)) }
}

function isRootAt(side: Side, variable: string, x: number): boolean | null {
  const value = residual(side, { [variable]: x })
  if (!value) return null
  return Math.abs(value.diff) <= ROOT_TOLERANCE * value.scale
}

/** Proportional sides (a·(L₁−R₁) = L₂−R₂ for a constant a ≠ 0) means the same solution set. */
function proportional(a: Side, b: Side): boolean {
  const symbols = [...new Set([...a.left.symbols, ...a.right.symbols, ...b.left.symbols, ...b.right.symbols])]
  let ratio: number | null = null
  let compared = 0
  let bothZero = 0
  for (let point = 0; point < SAMPLE_POINTS.length; point += 1) {
    const scope = scopeAt(symbols, point)
    const ra = residual(a, scope)
    const rb = residual(b, scope)
    if (!ra || !rb) continue
    const zeroA = Math.abs(ra.diff) <= ROOT_TOLERANCE * ra.scale
    const zeroB = Math.abs(rb.diff) <= ROOT_TOLERANCE * rb.scale
    compared += 1
    if (zeroA && zeroB) {
      bothZero += 1
      continue
    }
    if (zeroA !== zeroB) return false
    const next = ra.diff / rb.diff
    if (ratio === null) ratio = next
    else if (!close(ratio, next, 1e-6)) return false
  }
  return compared >= MIN_COMPARED && (ratio !== null || bothZero === compared)
}

function findRoots(statement: Extract<Statement, { kind: 'eq' }>, variable: string): RootInfo | null {
  if (statement.cache !== undefined) return statement.cache
  const f = (x: number): number | null => {
    const value = residual(statement, { [variable]: x })
    return value ? value.diff : null
  }
  const isRoot = (x: number) => isRootAt(statement, variable, x) === true
  const values = GRID.map(f)
  const found: number[] = []
  for (let index = 0; index < GRID.length; index += 1) {
    const value = values[index]
    if (value === null) continue
    if (value === 0) {
      found.push(GRID[index])
      continue
    }
    const next = values[index + 1]
    if (next !== null && next !== undefined && next !== 0 && Math.sign(next) !== Math.sign(value)) {
      // Bisection; a pole also changes sign, so the midpoint must really be a root.
      let lo = GRID[index]
      let hi = GRID[index + 1]
      let fLo = value
      for (let step = 0; step < 80; step += 1) {
        const mid = (lo + hi) / 2
        const fMid = f(mid)
        if (fMid === null) break
        if (fMid === 0 || Math.sign(fMid) === Math.sign(fLo)) {
          lo = mid
          fLo = fMid
          if (fMid === 0) break
        } else {
          hi = mid
        }
      }
      if (isRoot(lo)) found.push(lo)
      else if (isRoot(hi)) found.push(hi)
    }
    // A touching root (e.g. (x − 3)² = 0) has no sign change: refine local minima of |f|.
    const prev = values[index - 1]
    if (prev !== null && prev !== undefined && next !== null && next !== undefined && Math.abs(value) < Math.abs(prev) && Math.abs(value) <= Math.abs(next) && Math.sign(prev) === Math.sign(value) && Math.sign(next) === Math.sign(value)) {
      let lo = GRID[index - 1]
      let hi = GRID[index + 1]
      for (let step = 0; step < 120; step += 1) {
        const m1 = lo + (hi - lo) / 3
        const m2 = hi - (hi - lo) / 3
        const f1 = f(m1)
        const f2 = f(m2)
        if (f1 === null || f2 === null) break
        if (Math.abs(f1) < Math.abs(f2)) hi = m2
        else lo = m1
      }
      const mid = (lo + hi) / 2
      if (isRoot(mid)) found.push(mid)
    }
    if (found.length > MAX_ROOTS * 3) break
  }
  found.sort((a, b) => a - b)
  const roots: number[] = []
  for (const root of found) if (!roots.some((existing) => close(existing, root, 1e-6))) roots.push(root)
  const info = roots.length > MAX_ROOTS ? null : { roots }
  statement.cache = info
  return info
}

function isIdentity(side: Side): boolean {
  const symbols = [...new Set([...side.left.symbols, ...side.right.symbols])]
  let compared = 0
  for (let point = 0; point < SAMPLE_POINTS.length; point += 1) {
    const value = residual(side, scopeAt(symbols, point))
    if (!value) continue
    if (Math.abs(value.diff) > ROOT_TOLERANCE * value.scale) return false
    compared += 1
  }
  return compared >= MIN_COMPARED
}

/** Solution-set comparison of two single-variable equations. */
function compareEquations(
  previous: Extract<Statement, { kind: 'eq' }>,
  current: Extract<Statement, { kind: 'eq' }>,
  variable: string,
  candidates: number[],
): { verdict: EngineVerdict; currentRoots: number[] | null } {
  if (proportional(previous, current)) return { verdict: 'valid', currentRoots: null }
  if (isIdentity(previous) || isIdentity(current)) return { verdict: 'unknown', currentRoots: null }
  const a = findRoots(previous, variable)
  const b = findRoots(current, variable)
  if (!a || !b) return { verdict: 'unknown', currentRoots: null }

  const lost = new Set<number>()
  const gained = new Set<number>()
  for (const root of a.roots) if (isRootAt(current, variable, root) !== true) lost.add(root)
  for (const root of b.roots) {
    const inPrevious = isRootAt(previous, variable, root)
    // Outside the previous step's domain (e.g. a cancelled denominator) — not a real gain.
    if (inPrevious === false) gained.add(root)
  }
  for (const value of candidates) {
    const inA = isRootAt(previous, variable, value)
    const inB = isRootAt(current, variable, value)
    if (inA === true && inB !== true) lost.add(value)
    if (inB === true && inA === false) gained.add(value)
  }
  if (lost.size === 0 && gained.size === 0) return { verdict: 'valid', currentRoots: b.roots }
  // Only losing solutions (a case split, rejecting a negative length) or only gaining some
  // (squaring, multiplying by an expression) is not certainly wrong — let the grader decide.
  if (lost.size === 0 || gained.size === 0) return { verdict: 'unknown', currentRoots: b.roots }
  return { verdict: 'invalid', currentRoots: b.roots }
}

function compareInequalities(previous: Side & { op: IneqOp }, current: Side & { op: IneqOp }, variable: string, candidates: number[]): EngineVerdict {
  const holds = (side: Side & { op: IneqOp }, x: number): boolean | null => {
    const value = residual(side, { [variable]: x })
    if (!value || Math.abs(value.diff) <= 1e-6 * value.scale) return null // undefined or on the boundary
    switch (side.op) {
      case '<':
      case '<=':
        return value.diff < 0
      case '>':
      case '>=':
        return value.diff > 0
    }
  }
  let compared = 0
  const points = [...GRID.filter((_, index) => index % 6 === 0), ...candidates]
  for (const x of points) {
    const a = holds(previous, x)
    const b = holds(current, x)
    if (a === null || b === null) continue
    if (a !== b) return 'invalid'
    compared += 1
  }
  return compared >= 50 ? 'valid' : 'unknown'
}

/** A statement without variables: "36 + 64 = 100" is true, "36 + 64 = 110" is not. */
function checkConstant(statement: Statement, raw: string): EngineVerdict {
  if (statement.kind === 'expr') return 'unknown'
  const left = statement.left.fn({})
  const right = statement.right.fn({})
  if (left === null || right === null) return 'unknown'
  if (statement.kind === 'ineq') {
    const holds = { '<': left < right, '>': left > right, '<=': left <= right, '>=': left >= right }[statement.op]
    return holds ? 'valid' : 'invalid'
  }
  if (close(left, right, 1e-9)) return 'valid'
  const relative = Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1e-12)
  // Rounding ("√2 ≈ 1.41", "= 3.33") is not a mistake.
  if (statement.approx) return relative <= 0.01 ? 'valid' : 'unknown'
  if (/\d\.\d/.test(raw) && relative <= 0.005) return 'unknown'
  return 'invalid'
}

interface LineStatements {
  statements: Parsed[]
  /** The line has relations the engine could not parse. */
  unparsedRelation: boolean
}

function lineStatements(line: string): LineStatements {
  const segments: string[] = []
  const worded = line.includes('$')
  if (worded) {
    for (const match of line.matchAll(/\$\$([^$]+)\$\$|\$([^$]+)\$/g)) segments.push(match[1] ?? match[2])
  } else {
    segments.push(line)
  }
  const outside = worded ? line.replace(/\$\$[^$]*\$\$|\$[^$]*\$/g, ' ') : ''
  const hasWords = /\p{L}{2,}/u.test(outside)

  const statements: Parsed[] = []
  let unparsedRelation = false
  for (const segment of segments) {
    for (const piece of segment.split(SPLITTERS)) {
      if (!piece.trim()) continue
      const parsed = parseStatement(piece)
      if (!parsed) {
        if (RELATION_CHARS.test(piece)) unparsedRelation = true
        continue
      }
      // A bare value ("$2x$" inside a sentence, a lone "8") is not a step of its own.
      if (parsed.statement.kind === 'expr' && !parsed.continuation && (hasWords || segments.length > 1 || parsed.statement.expr.symbols.size === 0)) continue
      if (parsed.statement.kind === 'expr' && !parsed.continuation && isLoneSymbol(piece)) continue
      statements.push(parsed)
    }
  }
  return { statements, unparsedRelation }
}

function isLoneSymbol(piece: string): boolean {
  return /^\s*[a-zA-Z]\s*$/.test(piece.replace(/\$/g, ''))
}

function compare(previous: Statement, current: Statement, candidates: number[]): { verdict: EngineVerdict; roots: number[] | null } {
  if (previous.kind !== current.kind) return { verdict: 'unknown', roots: null }
  if (current.kind === 'expr' && previous.kind === 'expr') {
    const same = exprEquivalent(previous.expr, current.expr)
    return { verdict: same === null ? 'unknown' : same ? 'valid' : 'invalid', roots: null }
  }
  const prevSymbols = symbolsOf(previous)
  const currSymbols = symbolsOf(current)
  if (current.kind === 'eq' && previous.kind === 'eq') {
    if (proportional(previous, current)) return { verdict: 'valid', roots: null }
    if (prevSymbols.size !== 1 || currSymbols.size !== 1 || [...prevSymbols][0] !== [...currSymbols][0]) return { verdict: 'unknown', roots: null }
    if (previous.approx || current.approx) return { verdict: 'unknown', roots: null }
    const result = compareEquations(previous, current, [...currSymbols][0], candidates)
    return { verdict: result.verdict, roots: result.currentRoots }
  }
  if (current.kind === 'ineq' && previous.kind === 'ineq') {
    if (prevSymbols.size !== 1 || currSymbols.size !== 1 || [...prevSymbols][0] !== [...currSymbols][0]) return { verdict: 'unknown', roots: null }
    return { verdict: compareInequalities(previous, current, [...currSymbols][0], candidates), roots: null }
  }
  return { verdict: 'unknown', roots: null }
}

/** The single equation / expression stated in the problem, used as "step 0" (catches miscopying). */
function problemStatement(problem: string): Statement | null {
  const found: Statement[] = []
  for (const match of problem.matchAll(/\$\$([^$]+)\$\$|\$([^$]+)\$|\\\(([\s\S]+?)\\\)/g)) {
    const segment = match[1] ?? match[2] ?? match[3]
    if (isLoneSymbol(segment)) continue
    const parsed = parseStatement(segment)
    if (!parsed || parsed.internallyInvalid || symbolsOf(parsed.statement).size === 0) continue
    found.push(parsed.statement)
  }
  return found.length === 1 ? found[0] : null
}

/**
 * One verdict per student step. `referenceAnswer` adds its value as an extra candidate root, so a
 * step that loses or gains the correct answer is always noticed.
 */
export function checkStudentSteps(problem: string, steps: string[], referenceAnswer: string): EngineVerdict[] {
  const reference = prepareAnswer(referenceAnswer)
  const candidates = reference?.kind === 'number' ? [reference.value] : []

  let previous: Statement | null = problemStatement(problem)
  let gap = false
  const history: Extract<Statement, { kind: 'eq' }>[] = previous?.kind === 'eq' ? [previous] : []

  return steps.map((line) => {
    const { statements, unparsedRelation } = lineStatements(line)
    const verdicts: EngineVerdict[] = []
    for (const parsed of statements) {
      const { statement } = parsed
      if (parsed.internallyInvalid) {
        verdicts.push('invalid')
      }
      if (symbolsOf(statement).size === 0) {
        verdicts.push(checkConstant(statement, line))
        continue
      }
      let verdict: EngineVerdict = 'unknown'
      if (previous) {
        verdict = compare(previous, statement, candidates).verdict
        // A branch of an earlier equation ("x = 2" then "x = 3" after (x−2)(x−3) = 0).
        if (verdict === 'invalid' && statement.kind === 'eq') {
          const variable = [...symbolsOf(statement)][0]
          const branch = history.some((earlier) => {
            if (earlier === previous || symbolsOf(earlier).size !== 1 || [...symbolsOf(earlier)][0] !== variable) return false
            const roots = findRoots(statement, variable)
            return !!roots && roots.roots.length > 0 && roots.roots.every((root) => isRootAt(earlier, variable, root) === true)
          })
          if (branch) verdict = 'unknown'
        }
        // Unchecked math in between: the error could be there, so only a proof of validity counts.
        if (gap && verdict === 'invalid') verdict = 'unknown'
      }
      if (!parsed.internallyInvalid) verdicts.push(verdict)
      previous = parsed.result
      gap = false
      if (parsed.result.kind === 'eq') history.push(parsed.result)
    }
    if (unparsedRelation) gap = true
    if (verdicts.includes('invalid')) return 'invalid'
    if (verdicts.length > 0 && !unparsedRelation && verdicts.every((verdict) => verdict === 'valid')) return 'valid'
    return 'unknown'
  })
}
