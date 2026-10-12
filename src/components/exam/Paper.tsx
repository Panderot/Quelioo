import { Fragment } from 'react'
import type { ReactNode } from 'react'

import { buildGroup } from '../../lib/exam/groups'
import { examPaperLabels } from '../../lib/exam/paperLabels'
import type { PaperLabels } from '../../lib/exam/paperLabels'
import { answerLetter, keyAnswer, matchingOrder, optionsAreShort, paperSections, topicRows } from '../../lib/exam/paperText'
import type { ExamGroup, PaperQuestion, WrittenExam } from '../../lib/exam/types'
import MathText from '../MathText'

export type PaperPart = 'exam' | 'key'

interface ExamPaperProps {
  exam: WrittenExam
  /** Which paper; the key can also cover both groups. */
  group: ExamGroup | 'both'
  part: PaperPart
  /** Screen preview zoom (1 = real A4 width). */
  scale?: number
  /** Real print view: A4 page rules, page numbers and footer in the page margins. */
  print?: boolean
}

const PAPER_CSS = `
.xp-root { font-family: "Times New Roman", Times, "Liberation Serif", serif; font-size: 11pt; line-height: 1.35; color: #000; background: #fff; }
.xp-root * { box-sizing: border-box; }
.xp-sheet { width: 210mm; min-height: 297mm; padding: 15mm 15mm 18mm; margin: 0 auto; background: #fff; position: relative; }
.xp-screen .xp-sheet { box-shadow: 0 1px 8px rgba(0,0,0,.25); }
.xp-print .xp-sheet { margin: 8mm auto; box-shadow: 0 1px 8px rgba(0,0,0,.25); }
@media print { .xp-sheet { width: auto; min-height: 0; padding: 0; margin: 0 !important; box-shadow: none !important; } }
.xp-head { text-align: center; position: relative; margin-bottom: 4mm; }
.xp-head p { margin: 0; font-weight: 700; }
.xp-group { position: absolute; top: 0; right: 0; border: 1.5px solid #000; padding: 0 3mm; font-weight: 700; font-size: 12pt; }
.xp-boxes { display: grid; grid-template-columns: 3fr 1fr 1fr 1fr; border: 1px solid #000; margin-top: 3mm; text-align: left; }
.xp-boxes div { padding: 1.5mm 2mm; min-height: 11mm; border-left: 1px solid #000; font-size: 10pt; }
.xp-boxes div:first-child { border-left: 0; }
.xp-grid { display: flex; flex-wrap: wrap; margin: 3mm 0; font-size: 8.5pt; text-align: center; }
.xp-grid div { width: 11mm; border: 1px solid #000; margin: 0 -1px -1px 0; }
.xp-grid span { display: block; height: 7mm; }
.xp-grid b { display: block; border-bottom: 1px solid #000; font-weight: 400; }
.xp-instr { font-style: italic; margin: 0 0 3mm; font-size: 10pt; }
.xp-section { font-weight: 700; margin: 4mm 0 2mm; break-after: avoid; }
.xp-q { break-inside: avoid; page-break-inside: avoid; margin: 0 0 4.5mm; }
.xp-qline { display: flex; gap: 1.5mm; align-items: baseline; }
.xp-qno { font-weight: 700; min-width: 6mm; }
.xp-qtext { flex: 1; }
.xp-ctx { font-style: italic; display: block; margin-bottom: 1mm; }
.xp-pts { font-weight: 700; white-space: nowrap; margin-left: 2mm; }
.xp-blank { display: inline-block; min-width: 28mm; border-bottom: 1px solid #000; }
.xp-opts { display: grid; grid-template-columns: 1fr; gap: 0.8mm 6mm; margin: 1.5mm 0 0 7.5mm; }
.xp-opts.two { grid-template-columns: 1fr 1fr; }
.xp-opt { display: flex; gap: 1.5mm; }
.xp-line { height: 8mm; border-bottom: 1px solid #000; margin-left: 7.5mm; }
.xp-tf { margin: 1mm 0 0 7.5mm; font-weight: 700; letter-spacing: .5px; }
.xp-match { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8mm 10mm; margin: 1.5mm 0 0 7.5mm; }
.xp-match > div { display: flex; gap: 1.5mm; align-items: baseline; }
.xp-match .ans { display: inline-block; min-width: 9mm; border-bottom: 1px solid #000; }
.xp-end { break-inside: avoid; margin-top: 6mm; text-align: right; }
.xp-end p { margin: 0; }
.xp-kq { break-inside: avoid; margin: 0 0 3mm; }
.xp-kq ul { margin: 0.5mm 0 0 6mm; padding: 0; list-style: disc; }
.xp-map { color: #333; font-size: 9.5pt; }
.xp-table { border-collapse: collapse; width: 100%; margin-top: 3mm; break-inside: avoid; }
.xp-table th, .xp-table td { border: 1px solid #000; padding: 1mm 2mm; text-align: left; }
.xp-table td.num, .xp-table th.num { text-align: center; }
.xp-keytitle { text-align: center; font-weight: 700; font-size: 13pt; margin: 0 0 3mm; break-after: avoid; }
.xp-break { break-before: page; page-break-before: always; }
.xp-print-only-footer { display: none; }
`

function printCss(footer: boolean, labels: PaperLabels): string {
  return `
@page { size: A4; margin: 15mm 15mm 18mm 15mm;
  @bottom-center { content: "${labels.page} " counter(page) " / " counter(pages); font-family: "Times New Roman", Times, serif; font-size: 9pt; }
  ${footer ? `@bottom-left { content: "${labels.footer}"; font-family: "Times New Roman", Times, serif; font-size: 8pt; color: #444; }` : ''}
}
.xp-root, .xp-root * { visibility: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`
}

/** Text with $...$ formulas; a "___" in a fill-in sentence becomes a line to write on. */
function Rich({ text, blanks = false, blankLabel = 'blank' }: { text: string; blanks?: boolean; blankLabel?: string }) {
  if (!blanks) return <MathText text={text} />
  const parts = text.split(/_{3,}/)
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="xp-blank" aria-label={blankLabel} />}
          <MathText text={part} />
        </Fragment>
      ))}
    </>
  )
}

function Header({ exam, group, labels }: { exam: WrittenExam; group: ExamGroup | null; labels: PaperLabels }) {
  const { header } = exam.settings
  return (
    <div className="xp-head">
      {group && <div className="xp-group">{labels.groupLabel(group)}</div>}
      <p>{labels.yearLine(header)}</p>
      {header.school.trim() && <p>{header.school.trim()}</p>}
      <p>{labels.titleLine(header)}</p>
      <div className="xp-boxes">
        <div>{labels.name}:</div>
        <div>{labels.className}:</div>
        <div>{labels.number}:</div>
        <div>{labels.score}:</div>
      </div>
    </div>
  )
}

function GradingGrid({ questions, labels }: { questions: PaperQuestion[]; labels: PaperLabels }) {
  return (
    <div className="xp-grid" aria-hidden>
      {questions.map((question) => (
        <div key={question.id}>
          <b>
            {labels.qShort}
            {question.number}
          </b>
          <span />
        </div>
      ))}
      <div style={{ width: '18mm' }}>
        <b>{labels.total}</b>
        <span />
      </div>
    </div>
  )
}

function QuestionBlock({ question, labels }: { question: PaperQuestion; labels: PaperLabels }) {
  const options = question.options ?? []
  const pairs = question.pairs ?? []
  const order = matchingOrder(question)
  return (
    <div className="xp-q" data-question={question.number}>
      <div className="xp-qline">
        <span className="xp-qno">{question.number}.</span>
        <span className="xp-qtext">
          {question.context && (
            <span className="xp-ctx">
              <Rich text={question.context} />
            </span>
          )}
          <Rich text={question.stem} blanks={question.type === 'fill-blanks'} blankLabel={labels.blank} />
          <span className="xp-pts">{labels.pointsLabel(question.points)}</span>
        </span>
      </div>
      {question.type === 'mcq' && (
        <div className={`xp-opts${optionsAreShort(options) ? ' two' : ''}`}>
          {options.map((option, index) => (
            <div key={index} className="xp-opt">
              <span>{answerLetter(index)})</span>
              <span>
                <Rich text={option} />
              </span>
            </div>
          ))}
        </div>
      )}
      {question.type === 'true-false' && <div className="xp-tf">{labels.tfMarks}</div>}
      {question.type === 'matching' && (
        <div className="xp-match">
          {pairs.map((pair, index) => (
            <Fragment key={index}>
              <div>
                <span className="ans" />
                <span>{index + 1}.</span>
                <span>
                  <Rich text={pair.left} />
                </span>
              </div>
              <div>
                <span>{answerLetter(index)})</span>
                <span>
                  <Rich text={pairs[order[index]]?.right ?? ''} />
                </span>
              </div>
            </Fragment>
          ))}
        </div>
      )}
      {(question.type === 'open-ended' || question.type === 'short-answer') &&
        Array.from({ length: Math.max(question.lines, 0) }, (_, index) => <div key={index} className="xp-line" />)}
    </div>
  )
}

function ExamPages({ exam, group, labels }: { exam: WrittenExam; group: ExamGroup; labels: PaperLabels }) {
  const questions = buildGroup(exam, group)
  const teacher = labels.teacherLine(exam.settings.header)
  const sections = paperSections(questions)
  const last = sections[sections.length - 1]
  return (
    <>
      <Header exam={exam} group={exam.settings.groups ? group : null} labels={labels} />
      <GradingGrid questions={questions} labels={labels} />
      <p className="xp-instr">{labels.instructionLine(exam.settings.durationMinutes)}</p>
      {sections.map((section, sectionIndex) => (
        <Fragment key={sectionIndex}>
          <div className="xp-section">{labels.section[section.type]}</div>
          {section === last ? (
            <>
              {section.questions.slice(0, -1).map((question) => (
                <QuestionBlock key={question.id} question={question} labels={labels} />
              ))}
              <div style={{ breakInside: 'avoid' }}>
                <QuestionBlock question={section.questions[section.questions.length - 1]} labels={labels} />
                <div className="xp-end">
                  <p>{labels.goodLuck}</p>
                  {teacher && <p>{teacher}</p>}
                </div>
              </div>
            </>
          ) : (
            section.questions.map((question) => <QuestionBlock key={question.id} question={question} labels={labels} />)
          )}
        </Fragment>
      ))}
    </>
  )
}

function KeyQuestion({ question, mapped, labels }: { question: PaperQuestion; mapped: boolean; labels: PaperLabels }) {
  const key = keyAnswer(question, labels)
  return (
    <div className="xp-kq" data-key-question={question.number}>
      <div>
        <b>{question.number}. </b>
        {key.answer && (
          <span>
            {labels.answer}: <Rich text={key.answer} />
          </span>
        )}{' '}
        <b>{labels.pointsLabel(question.points)}</b>
        {mapped && <span className="xp-map"> — {labels.mappingLine(question)}</span>}
      </div>
      {key.expected && (
        <div>
          {labels.expected}: <Rich text={key.expected} />
        </div>
      )}
      {key.accepted.length > 0 && (
        <div>
          {labels.alsoAccepted}: {key.accepted.join('; ')}
        </div>
      )}
      {question.rubric.length > 0 && (
        <ul>
          {question.rubric.map((item, index) => (
            <li key={index}>
              <Rich text={item.text} /> — {labels.pointsLabel(item.points)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function KeyPages({ exam, group, labels }: { exam: WrittenExam; group: ExamGroup; labels: PaperLabels }) {
  const questions = buildGroup(exam, group)
  const rows = topicRows(questions, labels)
  const total = questions.reduce((sum, question) => sum + question.points, 0)
  return (
    <>
      <p className="xp-keytitle">{exam.settings.groups ? labels.keyHeading(group) : labels.keyTitle}</p>
      {questions.map((question) => (
        <KeyQuestion key={question.id} question={question} mapped={group === 'B'} labels={labels} />
      ))}
      {exam.settings.topicTable && (
        <table className="xp-table">
          <thead>
            <tr>
              {labels.topicCols.map((column, index) => (
                <th key={column} className={index === 0 || index === 3 ? 'num' : undefined}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.number}>
                <td className="num">{row.number}</td>
                <td>{row.topic}</td>
                <td>{row.difficulty}</td>
                <td className="num">{row.points}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <b>{labels.total}</b>
              </td>
              <td className="num">
                <b>{total}</b>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  )
}

/** The exam paper or its answer key on A4 sheets, black and white. Pure markup: the app chrome is never part of it. */
export default function ExamPaper({ exam, group, part, scale = 1, print = false }: ExamPaperProps) {
  const labels = examPaperLabels(exam)
  const groups: ExamGroup[] = group === 'both' ? ['A', 'B'] : [group]
  const shown = part === 'exam' ? groups.slice(0, 1) : exam.settings.groups ? groups : groups.slice(0, 1)
  const body: ReactNode = shown.map((g, index) => (
    <div key={g} className={index > 0 ? 'xp-break' : undefined}>
      {part === 'exam' ? <ExamPages exam={exam} group={g} labels={labels} /> : <KeyPages exam={exam} group={g} labels={labels} />}
    </div>
  ))
  return (
    <div className={`xp-root ${print ? 'xp-print' : 'xp-screen'}`} data-purpose="exam-paper" data-part={part} data-paper-lang={labels.lang} style={!print && scale !== 1 ? { zoom: scale } : undefined}>
      <style>{PAPER_CSS + (print ? printCss(exam.settings.footer, labels) : '')}</style>
      <div className="xp-sheet">
        {body}
        {!print && exam.settings.footer && <p style={{ textAlign: 'center', fontSize: '8pt', color: '#555', margin: '6mm 0 0' }}>{labels.footer}</p>}
      </div>
    </div>
  )
}
