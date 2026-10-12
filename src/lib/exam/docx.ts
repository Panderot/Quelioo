import { strToU8, zipSync } from 'fflate'

import { buildGroup } from './groups'
import { latexToOmml, escapeXml } from './omml'
import { examPaperLabels } from './paperLabels'
import type { PaperLabels } from './paperLabels'
import { acceptedLine, answerLetter, examFileBase, keyAnswer, optionsAreShort, paperSections, rightColumn, splitMath } from './paperText'
import { distributionRows, numbersText, specRows, specTotals } from './tables'
import type { ExamGroup, PaperQuestion, WrittenExam } from './types'

/** Word (.docx) output, written by hand as WordprocessingML: no library, runs in the browser. */

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const FONT = 'Times New Roman'
const PAGE_W = 11906
const PAGE_H = 16838
const MARGIN = 850
const INDENT = 420
/** Height of one writing line: 0.8 cm in twips. */
const LINE_HEIGHT = 454
const NBSP = ' '

interface RunStyle {
  bold?: boolean
  italic?: boolean
  size?: number // half-points
  underline?: boolean
}

function rPr(style: RunStyle): string {
  const inner = `${style.bold ? '<w:b/>' : ''}${style.italic ? '<w:i/>' : ''}${style.size ? `<w:sz w:val="${style.size}"/><w:szCs w:val="${style.size}"/>` : ''}${style.underline ? '<w:u w:val="single"/>' : ''}`
  return inner ? `<w:rPr>${inner}</w:rPr>` : ''
}

const run = (text: string, style: RunStyle = {}): string => (text ? `<w:r>${rPr(style)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` : '')
const tab = '<w:r><w:tab/></w:r>'
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

/** Runs for a text with $...$ formulas (editable Word equations) and, optionally, "___" blanks. **word** is bold. */
function inline(text: string, style: RunStyle = {}, blanks = false): string {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((chunk) => (/^\*\*[^*]+\*\*$/.test(chunk) ? inlinePlain(chunk.slice(2, -2), { ...style, bold: true }, blanks) : inlinePlain(chunk, style, blanks)))
    .join('')
}

function inlinePlain(text: string, style: RunStyle, blanks: boolean): string {
  return splitMath(text)
    .map((piece) => {
      if (piece.math) return latexToOmml(piece.value)
      if (!blanks) return run(piece.value, style)
      return piece.value
        .split(/_{3,}/)
        .map((part, index) => (index > 0 ? run(NBSP.repeat(18), { ...style, underline: true }) : '') + run(part, style))
        .join('')
    })
    .join('')
}

interface ParaOptions {
  keepNext?: boolean
  jc?: 'left' | 'center' | 'right'
  left?: number
  hanging?: number
  after?: number
  before?: number
  line?: number
  bottomBorder?: boolean
  box?: boolean
  tabAt?: number
}

function para(content: string, o: ParaOptions = {}): string {
  const border = o.box
    ? '<w:pBdr><w:top w:val="single" w:sz="8" w:space="1" w:color="000000"/><w:left w:val="single" w:sz="8" w:space="4" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:space="1" w:color="000000"/><w:right w:val="single" w:sz="8" w:space="4" w:color="000000"/></w:pBdr>'
    : o.bottomBorder
      ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>'
      : ''
  const tabs = o.tabAt ? `<w:tabs><w:tab w:val="left" w:pos="${o.tabAt}"/></w:tabs>` : ''
  const spacing = `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}"${o.line ? ` w:line="${o.line}" w:lineRule="exact"` : ''}/>`
  const ind = o.left || o.hanging ? `<w:ind w:left="${o.left ?? 0}"${o.hanging ? ` w:hanging="${o.hanging}"` : ''}/>` : ''
  const pPr = `<w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}<w:keepLines/>${border}${tabs}${spacing}${ind}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>`
  return `<w:p>${pPr}${content}</w:p>`
}

interface Cell {
  paras: string
  width: number
  shade?: boolean
  /** Only a bottom border (a line to write on). */
  bottom?: boolean
}

function table(rows: Cell[][], options: { borders?: boolean; height?: number; exactHeight?: boolean; indent?: number; header?: boolean } = {}): string {
  const widths = rows.reduce((best, row) => (row.length > best.length ? row.map((cell) => cell.width) : best), [] as number[])
  const edge = options.borders ? 'single' : 'nil'
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="${edge}" w:sz="4" w:space="0" w:color="000000"/>`).join('')
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')
  const body = rows
    .map((row, rowIndex) => {
      const trPr = `<w:trPr><w:cantSplit/>${options.height ? `<w:trHeight w:val="${options.height}" w:hRule="${options.exactHeight ? 'exact' : 'atLeast'}"/>` : ''}${options.header && rowIndex === 0 ? '<w:tblHeader/>' : ''}</w:trPr>`
      const cells = row
        .map((cell) => `<w:tc><w:tcPr><w:tcW w:w="${cell.width}" w:type="dxa"/>${cell.bottom ? '<w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>' : ''}${cell.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E7E7"/>' : ''}</w:tcPr>${cell.paras}</w:tc>`)
        .join('')
      return `<w:tr>${trPr}${cells}</w:tr>`
    })
    .join('')
  const total = widths.reduce((sum, width) => sum + width, 0)
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${options.indent ? `<w:tblInd w:w="${options.indent}" w:type="dxa"/>` : ''}<w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
}

/** The header of the paper and of its answer key (same school, year, class, course, exam number, group and time); the key has no boxes for the student. */
function headerBlock(exam: WrittenExam, group: ExamGroup | null, paper: PaperLabels, boxes = true): string {
  const { header } = exam.settings
  const center = (text: string) => para(run(text, { bold: true, size: 24 }), { jc: 'center', after: 40 })
  const out: string[] = []
  if (group) out.push(para(run(paper.groupLabel(group), { bold: true, size: 26 }), { jc: 'right', box: true, after: 80 }))
  out.push(center(paper.yearLine(header)))
  if (header.school.trim()) out.push(center(paper.schoolLine(header)))
  out.push(center(paper.titleLine(header)))
  const time = paper.timeLine(exam.settings.durationMinutes)
  if (time) out.push(para(run(time, { size: 20 }), { jc: 'center', after: 60 }))
  if (boxes) {
    const widths = [4800, 1700, 1700, 2006]
    const labels = [paper.name, paper.className, paper.number, paper.score]
    out.push(table([labels.map((label, index) => ({ width: widths[index], paras: para(run(`${label}:`, { size: 20 })) }))], { borders: true, height: 620 }))
  }
  return out.join('')
}

function gradingGrid(questions: PaperQuestion[], paper: PaperLabels): string {
  const labels = [...questions.map((question) => `${paper.qShort}${question.number}`), paper.total]
  const perRow = 13
  const out: string[] = ['<w:p/>']
  for (let start = 0; start < labels.length; start += perRow) {
    const chunk = labels.slice(start, start + perRow)
    const cells = (fill: boolean): Cell[] =>
      chunk.map((label) => ({ width: label === paper.total ? 1100 : 740, paras: para(fill ? run(label, { size: 17 }) : '', { jc: 'center', after: 0 }) }))
    out.push(table([cells(true), cells(false)], { borders: true, height: 380 }), para('', { after: 40 }))
  }
  return out.join('')
}

function questionBlock(question: PaperQuestion, paper: PaperLabels): string {
  const out: string[] = []
  const options = question.options ?? []
  const pairs = question.pairs ?? []
  const lines = question.type === 'open-ended' || question.type === 'short-answer' ? Math.max(question.lines, 0) : 0
  // What follows the stem inside the block decides whether the stem keeps with the next paragraph.
  const tail = (options.length > 0 || pairs.length > 0 || lines > 0 || question.type === 'true-false')
  const stemRuns = `${inline(question.stem, {}, question.type === 'fill-blanks')}${run(` ${paper.pointsLabel(question.points)}`, { bold: true })}`
  const common = { left: INDENT, hanging: INDENT, tabAt: INDENT }
  if (question.context) {
    out.push(para(run(`${question.number}.`, { bold: true }) + tab + inline(question.context, { italic: true }), { ...common, keepNext: true }))
    out.push(para(stemRuns, { left: INDENT, keepNext: tail }))
  } else {
    out.push(para(run(`${question.number}.`, { bold: true }) + tab + stemRuns, { ...common, keepNext: tail }))
  }
  if (question.type === 'mcq') {
    if (optionsAreShort(options)) {
      const rows: Cell[][] = []
      for (let index = 0; index < options.length; index += 2) {
        const last = index + 2 >= options.length
        rows.push(
          [index, index + 1].map((optionIndex) => ({
            width: 4600,
            paras: para(optionIndex < options.length ? run(`${answerLetter(optionIndex)}) `) + inline(options[optionIndex]) : '', { keepNext: !last, after: 20 }),
          })),
        )
      }
      out.push(table(rows, { indent: INDENT }), para('', { after: 0, line: 40 }))
    } else {
      options.forEach((option, index) => {
        out.push(para(run(`${answerLetter(index)}) `) + inline(option), { left: INDENT + 300, hanging: 300, keepNext: index < options.length - 1, after: 20 }))
      })
    }
  } else if (question.type === 'true-false') {
    out.push(para(run(paper.tfMarks, { bold: true }), { left: INDENT, after: 60 }))
  } else if (question.type === 'matching') {
    const right = rightColumn(question)
    const size = Math.max(pairs.length, right.length)
    const rows: Cell[][] = Array.from({ length: size }, (_, index) => {
      const keep = index < size - 1
      const pair = pairs[index]
      return [
        { width: 4700, paras: para(pair ? run('(     ) ') + run(`${index + 1}. `) + inline(pair.left) : '', { keepNext: keep, after: 20 }) },
        { width: 4400, paras: para(run(`${answerLetter(index)}) `) + inline(right[index] ?? ''), { keepNext: keep, after: 20 }) },
      ]
    })
    out.push(table(rows, { indent: INDENT }), para('', { after: 0, line: 40 }))
  } else if (lines > 0) {
    const rows: Cell[][] = Array.from({ length: lines }, (_, index) => [{ width: PAGE_W - 2 * MARGIN - INDENT, bottom: true, paras: para('', { after: 0, line: 240, keepNext: index < lines - 1 }) }])
    out.push(table(rows, { indent: INDENT, height: LINE_HEIGHT, exactHeight: true }), para('', { after: 60, line: 120 }))
  }
  return out.join('')
}

function examBody(exam: WrittenExam, group: ExamGroup, paper: PaperLabels): string {
  const questions = buildGroup(exam, group)
  const out: string[] = [headerBlock(exam, exam.settings.groups ? group : null, paper), gradingGrid(questions, paper)]
  out.push(para(run(paper.instructionLine(), { italic: true, size: 20 }), { after: 120 }))
  for (const section of paperSections(questions)) {
    out.push(para(run(paper.section[section.type], { bold: true }), { keepNext: true, before: 120, after: 80 }))
    section.questions.forEach((question) => out.push(questionBlock(question, paper)))
  }
  out.push(para(run(paper.goodLuck), { jc: 'right', before: 200, after: 20 }))
  const teacher = paper.teacherLine(exam.settings.header)
  if (teacher) out.push(para(run(teacher), { jc: 'right', after: 20 }))
  return out.join('')
}

/** E6: the topic distribution and the table of specifications. */
function bloomTables(questions: PaperQuestion[], paper: PaperLabels, meb: boolean): string {
  const total = PAGE_W - 2 * MARGIN
  const head = (text: string, width: number): Cell => ({ width, shade: true, paras: para(run(text, { bold: true, size: 17 }), { after: 0 }) })
  const cell = (text: string, width: number, bold = false): Cell => ({ width, paras: para(run(text, { bold, size: 19 }), { after: 0 }) })
  const distribution = distributionRows(questions)
  const dWidths = [total - 1300 * 2 - 2400, 2400, 1300, 1300]
  const sumPoints = questions.reduce((sum, question) => sum + question.points, 0)
  const dRows: Cell[][] = [
    [head(meb ? paper.mebTopic : paper.distributionCols[0], dWidths[0]), head(paper.distributionCols[1], dWidths[1]), head(paper.distributionCols[2], dWidths[2]), head(paper.distributionCols[3], dWidths[3])],
    ...distribution.map((row) => [cell(row.topic || '—', dWidths[0]), cell(numbersText(row.numbers), dWidths[1]), cell(String(row.count), dWidths[2]), cell(String(row.points), dWidths[3])]),
    [
      { width: dWidths[0] + dWidths[1], paras: para(run(paper.total, { bold: true, size: 19 }), { after: 0 }) },
      cell(String(questions.length), dWidths[2], true),
      cell(String(sumPoints), dWidths[3], true),
    ],
  ]
  const spec = specRows(questions)
  const totals = specTotals(spec)
  const hasUnset = totals.unset > 0
  const levelWidth = hasUnset ? 1120 : 1220
  const tailWidth = hasUnset ? 900 : 900
  const sWidths = [total - levelWidth * 6 - tailWidth * (hasUnset ? 2 : 1), ...Array(6).fill(levelWidth), ...(hasUnset ? [tailWidth] : []), tailWidth] as number[]
  const levels = [1, 2, 3, 4, 5, 6] as const
  const sHead: Cell[] = [head(meb ? paper.mebTopic : paper.specTopic, sWidths[0]), ...levels.map((level, index) => head(paper.bloomNames[level], sWidths[index + 1])), ...(hasUnset ? [head(paper.notSet, sWidths[7])] : []), head(paper.total, sWidths[sWidths.length - 1])]
  const sRows: Cell[][] = spec.map((row) => [
    cell(row.topic || '—', sWidths[0]),
    ...row.cells.map((numbers, index) => cell(numbersText(numbers), sWidths[index + 1])),
    ...(hasUnset ? [cell(numbersText(row.unset), sWidths[7])] : []),
    cell(String(row.count), sWidths[sWidths.length - 1]),
  ])
  const sTotal: Cell[] = [
    cell(paper.total, sWidths[0], true),
    ...totals.perLevel.map((count, index) => cell(String(count), sWidths[index + 1], true)),
    ...(hasUnset ? [cell(String(totals.unset), sWidths[7], true)] : []),
    cell(String(totals.total), sWidths[sWidths.length - 1], true),
  ]
  return [
    para(run(meb ? paper.mebDistributionTitle : paper.distributionTitle, { bold: true }), { keepNext: true, before: 160 }),
    table(dRows, { borders: true, header: true }),
    para(run(meb ? paper.mebSpecTitle : paper.specTitle, { bold: true }), { keepNext: true, before: 200 }),
    table([sHead, ...sRows, sTotal], { borders: true, header: true }),
    para('', { after: 0 }),
  ].join('')
}

function keyBody(exam: WrittenExam, group: ExamGroup, paper: PaperLabels): string {
  const questions = buildGroup(exam, group)
  const out: string[] = [headerBlock(exam, exam.settings.groups ? group : null, paper, false), para(run(paper.keyTitle, { bold: true, size: 26 }), { jc: 'center', before: 120, after: 160, keepNext: true })]
  for (const question of questions) {
    const key = keyAnswer(question, paper)
    const rubric = question.rubric
    const hasMore = Boolean(key.expected) || key.accepted.length > 0 || rubric.length > 0
    const head =
      run(`${question.number}. `, { bold: true }) +
      (key.answer ? run(`${paper.answer}: `) + inline(key.answer) : '') +
      run(` ${paper.pointsLabel(question.points)}`, { bold: true }) +
      (group === 'B' ? run(` — ${paper.mappingLine(question)}`, { italic: true, size: 19 }) : '')
    out.push(para(head, { keepNext: hasMore, after: 20 }))
    if (key.expected) out.push(para(run(`${key.expectedLabel}: `) + inline(key.expected), { left: INDENT, keepNext: key.accepted.length > 0 || rubric.length > 0, after: 20 }))
    if (key.accepted.length > 0) out.push(para(run(`${paper.alsoAccepted}: ${acceptedLine(key.accepted)}`), { left: INDENT, keepNext: rubric.length > 0, after: 20 }))
    rubric.forEach((item, index) => {
      out.push(para(run('• ') + inline(item.text) + run(` — ${paper.pointsLabel(item.points)}`), { left: INDENT + 240, hanging: 240, keepNext: index < rubric.length - 1, after: 10 }))
    })
    out.push(para('', { after: 60, line: 100 }))
  }
  if (exam.settings.topicTable) out.push(bloomTables(questions, paper, exam.settings.format === 'meb'))
  return out.join('')
}

const LANG_TAG = { tr: 'tr-TR', en: 'en-US', hyw: 'hy-AM' } as const

const styles = (lang: PaperLabels['lang']) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${LANG_TAG[lang]}" w:eastAsia="${LANG_TAG[lang]}" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`

const settings = (lang: PaperLabels['lang']) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${NS}><w:defaultTabStop w:val="420"/><w:characterSpacingControl w:val="doNotCompress"/><w:themeFontLang w:val="${LANG_TAG[lang]}"/><m:mathPr><m:mathFont m:val="Cambria Math"/></m:mathPr></w:settings>`

function footerXml(withBrand: boolean, paper: PaperLabels): string {
  const field = (instr: string, sample: string) => `<w:fldSimple w:instr=" ${instr} "><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${sample}</w:t></w:r></w:fldSimple>`
  const small = (text: string) => `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`
  const numbers = `<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>${small(`${paper.page} `)}${field('PAGE', '1')}${small(' / ')}${field('NUMPAGES', '1')}</w:p>`
  const brand = withBrand
    ? `<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:color w:val="555555"/><w:sz w:val="16"/></w:rPr><w:t>${paper.footer}</w:t></w:r></w:p>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${numbers}${brand}</w:ftr>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`

/** One Word file: the paper of a group, or its answer key (`both` = the key of A, a page break, the key of B). */
export async function buildExamDocx(exam: WrittenExam, part: 'exam' | 'key', group: ExamGroup | 'both'): Promise<Uint8Array> {
  const paper = examPaperLabels(exam)
  let body: string
  if (part === 'exam') {
    body = examBody(exam, group === 'B' ? 'B' : 'A', paper)
  } else {
    const groups: ExamGroup[] = group === 'both' ? (exam.settings.groups ? ['A', 'B'] : ['A']) : [group]
    body = groups.map((g) => keyBody(exam, g, paper)).join(pageBreak)
  }
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="1100" w:left="${MARGIN}" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>`
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${para('', { after: 0 })}${sect}</w:body></w:document>`
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles(paper.lang)),
    'word/settings.xml': strToU8(settings(paper.lang)),
    'word/_rels/document.xml.rels': strToU8(DOCUMENT_RELS),
    'word/footer1.xml': strToU8(footerXml(exam.settings.footer, paper)),
  })
}

export function examFileName(exam: WrittenExam, part: 'exam' | 'key', group: ExamGroup | 'both'): string {
  return `${examFileBase(exam, part, group)}.docx`
}

/** The zip with every part: "Biyoloji-10-Sinif-Yazili-Tumu.zip". */
export function examZipName(exam: WrittenExam): string {
  return `${examFileBase(exam, 'exam', 'both')}-Tumu.zip`
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Every part in one zip: the paper(s) and, when the answer key is on, the key(s). */
export async function buildExamZip(exam: WrittenExam): Promise<Uint8Array> {
  const groups: ExamGroup[] = exam.settings.groups ? ['A', 'B'] : ['A']
  const files: Record<string, Uint8Array> = {}
  for (const group of groups) {
    files[examFileName(exam, 'exam', group)] = await buildExamDocx(exam, 'exam', group)
    if (exam.settings.answerKey) files[examFileName(exam, 'key', group)] = await buildExamDocx(exam, 'key', group)
  }
  return zipSync(files)
}

export function downloadBlob(bytes: Uint8Array, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
