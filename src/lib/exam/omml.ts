/** LaTeX → OMML (Word's editable equation markup) for the school-math subset. Never throws: what it does not know stays readable text. */

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', in: '∈', notin: '∉',
  subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', partial: '∂', nabla: '∇', circ: '∘', degree: '°',
  ldots: '…', cdots: '⋯', dots: '…', angle: '∠', triangle: '△', perp: '⊥', parallel: '∥', propto: '∝', mid: '∣', prime: '′',
  mathbb: '', lt: '<', gt: '>', '%': '%', '&': '&', '#': '#', _: '_', '{': '{', '}': '}', '$': '$',
}

const FUNCTION_NAMES = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'det', 'gcd', 'mod', 'deg', 'dim', 'ker'])

const NARY: Record<string, string> = { sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', bigcup: '⋃', bigcap: '⋂' }

const SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad'])

const ACCENTS: Record<string, string> = { vec: '⃗', hat: '̂', tilde: '̃', dot: '̇', ddot: '̈' }

export const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type Item = { kind: 'text'; text: string; upright: boolean } | { kind: 'xml'; xml: string }

const run = (text: string, upright: boolean): string =>
  `<m:r>${upright ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`

const itemXml = (item: Item): string => (item.kind === 'text' ? run(item.text, item.upright) : item.xml)

class Parser {
  private pos = 0
  private readonly src: string
  /** Upright letters (chemical formulas inside \mathrm): the text of this parser is not italic. */
  private readonly upright: boolean
  constructor(src: string, upright = false) {
    this.src = src
    this.upright = upright
  }

  /** Parses until `stop` (a closing char or command) or the end. */
  sequence(stop?: (parser: Parser) => boolean): string {
    const items: Item[] = []
    while (this.pos < this.src.length && !(stop && stop(this))) {
      this.atomInto(items)
    }
    return items.map(itemXml).join('')
  }

  peekCommand(): string | null {
    const match = /^\\([a-zA-Z]+)/.exec(this.src.slice(this.pos, this.pos + 24))
    return match ? match[1] : null
  }

  peekChar(): string {
    return this.src[this.pos] ?? ''
  }

  skipCommand(name: string) {
    this.pos += name.length + 1
  }

  private skipSpaces() {
    while (/\s/.test(this.src[this.pos] ?? '')) this.pos += 1
  }

  /** One group `{…}` as OMML content, or a single atom when there are no braces. */
  private argument(): string {
    this.skipSpaces()
    if (this.src[this.pos] === '{') {
      this.pos += 1
      const inner = this.sequence((parser) => parser.peekChar() === '}')
      if (this.src[this.pos] === '}') this.pos += 1
      return inner
    }
    const items: Item[] = []
    if (this.pos < this.src.length && this.src[this.pos] !== '}') this.atomInto(items, true)
    return items.map(itemXml).join('')
  }

  private rawGroup(): string {
    this.skipSpaces()
    if (this.src[this.pos] !== '{') return ''
    let depth = 0
    const start = this.pos + 1
    for (let i = this.pos; i < this.src.length; i += 1) {
      if (this.src[i] === '{') depth += 1
      else if (this.src[i] === '}') {
        depth -= 1
        if (depth === 0) {
          this.pos = i + 1
          return this.src.slice(start, i)
        }
      }
    }
    const rest = this.src.slice(start)
    this.pos = this.src.length
    return rest
  }

  private scripts(items: Item[]) {
    // Gather ^ and _ (either order) that follow the atom just pushed.
    let sup: string | null = null
    let sub: string | null = null
    for (;;) {
      this.skipSpaces()
      const char = this.src[this.pos]
      if (char === '^' && sup === null) {
        this.pos += 1
        sup = this.argument()
      } else if (char === '_' && sub === null) {
        this.pos += 1
        sub = this.argument()
      } else break
    }
    if (sup === null && sub === null) return
    const last = items.pop()
    let base = ''
    if (last) {
      const chemical = last.kind === 'text' && last.upright && this.upright ? /(\([^()]*\)|[A-Z][a-z]?)$/.exec(last.text) : null
      if (last.kind === 'text' && chemical) {
        // A chemical formula: the script belongs to the whole element symbol ("Ca" in Ca^{2+}) or group ("(OH)" in Ca(OH)_2).
        const front = last.text.slice(0, last.text.length - chemical[0].length)
        if (front) items.push({ kind: 'text', text: front, upright: true })
        base = run(chemical[0], true)
      } else if (last.kind === 'text' && last.text.length > 1) {
        const chars = [...last.text]
        const final = chars.pop() as string
        if (chars.length > 0) items.push({ kind: 'text', text: chars.join(''), upright: last.upright })
        base = run(final, last.upright)
      } else base = itemXml(last)
    }
    const e = `<m:e>${base}</m:e>`
    if (sup !== null && sub !== null) items.push({ kind: 'xml', xml: `<m:sSubSup>${e}<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>` })
    else if (sup !== null) items.push({ kind: 'xml', xml: `<m:sSup>${e}<m:sup>${sup}</m:sup></m:sSup>` })
    else items.push({ kind: 'xml', xml: `<m:sSub>${e}<m:sub>${sub}</m:sub></m:sSub>` })
  }

  private pushText(items: Item[], text: string, upright = this.upright) {
    const last = items[items.length - 1]
    if (last && last.kind === 'text' && last.upright === upright) last.text += text
    else items.push({ kind: 'text', text, upright })
  }

  atomInto(items: Item[], noScripts = false) {
    const char = this.src[this.pos]
    if (char === undefined) return
    if (char === '{') {
      this.pos += 1
      const inner = this.sequence((parser) => parser.peekChar() === '}')
      if (this.src[this.pos] === '}') this.pos += 1
      items.push({ kind: 'xml', xml: inner })
      if (!noScripts) this.scripts(items)
      return
    }
    if (char === '}') {
      this.pos += 1 // stray closing brace
      return
    }
    if (char === '\\') {
      this.command(items, noScripts)
      return
    }
    this.pos += 1
    if (char === '^' || char === '_') return
    if (/\s/.test(char)) return
    this.pushText(items, char === '~' ? ' ' : char)
    if (!noScripts) this.scripts(items)
  }

  private command(items: Item[], noScripts: boolean) {
    const name = this.peekCommand()
    if (name === null) {
      const symbol = this.src[this.pos + 1] ?? ''
      this.pos += 2
      if (symbol === '\\') return
      if (SPACES.has(symbol)) this.pushText(items, ' ')
      else if (symbol) this.pushText(items, SYMBOLS[symbol] ?? symbol)
      if (!noScripts) this.scripts(items)
      return
    }
    this.skipCommand(name)
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac': {
        const num = this.argument()
        const den = this.argument()
        items.push({ kind: 'xml', xml: `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>` })
        break
      }
      case 'sqrt': {
        this.skipSpaces()
        let degree = ''
        if (this.src[this.pos] === '[') {
          const end = this.src.indexOf(']', this.pos)
          if (end !== -1) {
            degree = new Parser(this.src.slice(this.pos + 1, end)).sequence()
            this.pos = end + 1
          }
        }
        const radicand = this.argument()
        items.push({
          kind: 'xml',
          xml: degree
            ? `<m:rad><m:radPr/><m:deg>${degree}</m:deg><m:e>${radicand}</m:e></m:rad>`
            : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${radicand}</m:e></m:rad>`,
        })
        break
      }
      case 'mathrm':
      case 'mathbf': {
        // Upright maths such as chemical formulas: \mathrm{H_2SO_4} keeps its subscripts, \mathrm{Ca^{2+}} its charge.
        const raw = this.rawGroup()
        if (raw) items.push({ kind: 'xml', xml: new Parser(raw, true).sequence() })
        break
      }
      case 'text':
      case 'textbf':
      case 'operatorname': {
        const raw = this.rawGroup()
        if (raw) this.pushText(items, raw.replace(/\\[ ,;]/g, ' '), true)
        break
      }
      case 'overline':
      case 'bar': {
        const inner = this.argument()
        items.push({ kind: 'xml', xml: `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${inner}</m:e></m:bar>` })
        break
      }
      case 'underline': {
        const inner = this.argument()
        items.push({ kind: 'xml', xml: `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${inner}</m:e></m:bar>` })
        break
      }
      case 'left': {
        const open = this.delimiter()
        const inner = this.sequence((parser) => parser.peekCommand() === 'right')
        let close = ''
        if (this.peekCommand() === 'right') {
          this.skipCommand('right')
          close = this.delimiter()
        }
        items.push({
          kind: 'xml',
          xml: `<m:d><m:dPr><m:begChr m:val="${escapeXml(open)}"/><m:endChr m:val="${escapeXml(close)}"/></m:dPr><m:e>${inner}</m:e></m:d>`,
        })
        break
      }
      case 'right':
        this.delimiter()
        break
      case 'limits':
      case 'nolimits':
      case 'displaystyle':
      case 'textstyle':
      case 'big':
      case 'Big':
      case 'bigg':
        break
      default: {
        if (NARY[name]) {
          this.naryInto(items, NARY[name])
        } else if (ACCENTS[name]) {
          const inner = this.argument()
          items.push({ kind: 'xml', xml: `<m:acc><m:accPr><m:chr m:val="${ACCENTS[name]}"/></m:accPr><m:e>${inner}</m:e></m:acc>` })
        } else if (FUNCTION_NAMES.has(name)) {
          this.pushText(items, name, true)
        } else if (SPACES.has(name)) {
          this.pushText(items, ' ')
        } else if (Object.hasOwn(SYMBOLS, name)) {
          this.pushText(items, SYMBOLS[name])
        } else {
          this.pushText(items, name) // unknown command: keep its name as readable text
        }
      }
    }
    if (!noScripts) this.scripts(items)
  }

  private delimiter(): string {
    this.skipSpaces()
    const char = this.src[this.pos] ?? ''
    if (char === '\\') {
      const name = this.peekCommand()
      if (name) {
        this.skipCommand(name)
        return name === 'langle' ? '⟨' : name === 'rangle' ? '⟩' : name === 'lbrace' ? '{' : name === 'rbrace' ? '}' : ''
      }
      const next = this.src[this.pos + 1] ?? ''
      this.pos += 2
      return next === '{' || next === '}' ? next : next === '|' ? '‖' : ''
    }
    this.pos += 1
    return char === '.' ? '' : char
  }

  private naryInto(items: Item[], symbol: string) {
    let sub = ''
    let sup = ''
    for (;;) {
      this.skipSpaces()
      const char = this.src[this.pos]
      if (char === '_') {
        this.pos += 1
        sub = this.argument()
      } else if (char === '^') {
        this.pos += 1
        sup = this.argument()
      } else break
    }
    this.skipSpaces()
    const operand: Item[] = []
    // The operand is the next atom or group; scripts after it belong to it.
    if (this.pos < this.src.length && !this.atEnd()) this.atomInto(operand)
    const e = operand.map(itemXml).join('')
    const props = `<m:naryPr><m:chr m:val="${symbol}"/>${sub ? '' : '<m:subHide m:val="1"/>'}${sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr>`
    items.push({ kind: 'xml', xml: `<m:nary>${props}<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e>${e}</m:e></m:nary>` })
  }

  private atEnd(): boolean {
    return this.src[this.pos] === '}' || this.peekCommand() === 'right'
  }
}

/** `<m:oMath>…</m:oMath>` for one LaTeX formula (the text between the dollar signs). */
export function latexToOmml(latex: string): string {
  let body: string
  try {
    body = new Parser(latex).sequence()
  } catch {
    body = run(latex, false)
  }
  return `<m:oMath>${body}</m:oMath>`
}
