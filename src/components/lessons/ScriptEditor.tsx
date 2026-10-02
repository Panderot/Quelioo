import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LESSON_SPEAKERS, parseLineIssue } from '../../lib/lesson'
import type { LessonStyle, ScriptLine, ScriptSection } from '../../lib/lesson'
import Select from '../Select'
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, TrashIcon, WarningIcon } from '../icons'

interface ScriptEditorProps {
  sections: ScriptSection[]
  style: LessonStyle
  part: number
  /** Called with the new sections after every edit (lines changed by the student are marked edited). */
  onChange: (sections: ScriptSection[]) => void
  disabled?: boolean
}

function nextLineId(sections: ScriptSection[], part: number): string {
  const max = Math.max(0, ...sections.flatMap((section) => section.lines).map((line) => Number(line.id.split('-L')[1]) || 0))
  return `p${part}-L${max + 1}`
}

const iconButton = 'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'

/** Script grouped by sections with speaker labels; every line can be edited, deleted, moved within its section, or followed by a new line. */
export default function ScriptEditor({ sections, style, part, onChange, disabled = false }: ScriptEditorProps) {
  const { t } = useTranslation()
  /** The line being edited; a new line (`afterId` set) lives only here until it is saved with text. */
  const [editing, setEditing] = useState<{ id: string; text: string; speaker: string; afterId?: string } | null>(null)
  const speakers = LESSON_SPEAKERS[style]

  const update = (sectionId: string, change: (lines: ScriptLine[]) => ScriptLine[]) => {
    onChange(sections.map((section) => (section.id === sectionId ? { ...section, lines: change(section.lines) } : section)))
  }

  const saveEdit = (sectionId: string) => {
    if (!editing) return
    const text = editing.text.replace(/\s+/g, ' ').trim()
    const { afterId } = editing
    if (afterId) {
      // A new line without text is simply dropped.
      if (text) update(sectionId, (lines) => lines.flatMap((line) => (line.id === afterId ? [line, { id: editing.id, speaker: editing.speaker, text, edited: true }] : [line])))
    } else if (!text) {
      update(sectionId, (lines) => lines.filter((line) => line.id !== editing.id))
    } else {
      update(sectionId, (lines) =>
        lines.map((line) => {
          if (line.id !== editing.id || (text === line.text && editing.speaker === line.speaker)) return line
          return { id: line.id, speaker: editing.speaker, text, edited: true, ...(line.pause ? { pause: true } : {}) }
        }),
      )
    }
    setEditing(null)
  }

  const addAfter = (afterId: string, speaker: string) => {
    setEditing({ id: nextLineId(sections, part), text: '', speaker, afterId })
  }

  const move = (sectionId: string, index: number, delta: -1 | 1) => {
    update(sectionId, (lines) => {
      const next = [...lines]
      const target = index + delta
      if (target < 0 || target >= next.length) return lines
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const issueText = (issue: string) => {
    const parsed = parseLineIssue(issue)
    if (parsed.kind === 'symbols') return t('lessons.detail.issueSymbols')
    if (parsed.kind === 'long') return t('lessons.detail.issueLong')
    if (parsed.kind === 'calc') return t('lessons.detail.issueCalc', { detail: parsed.detail })
    return parsed.detail
  }

  const editorForm = (sectionId: string) =>
    editing && (
      <div className="space-y-2">
        {speakers.length > 1 && (
          <div className="max-w-[220px]">
            <span id={`${editing.id}-speaker`} className="mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase">
              {t('lessons.detail.speakerLabel')}
            </span>
            <Select
              id={`${editing.id}-speaker-select`}
              labelledBy={`${editing.id}-speaker`}
              variant="boxed"
              value={editing.speaker}
              options={speakers.map((speaker) => ({ value: speaker, label: t(`lessons.speakers.${speaker}`) }))}
              onChange={(speaker) => setEditing({ ...editing, speaker })}
            />
          </div>
        )}
        <textarea
          value={editing.text}
          onChange={(event) => setEditing({ ...editing, text: event.target.value })}
          rows={3}
          aria-label={t('lessons.detail.lineText')}
          autoFocus
          className="w-full rounded-lg border border-warm-border bg-paper px-3 py-2 text-sm text-ink"
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => saveEdit(sectionId)} className="rounded-lg bg-amber px-3 py-1.5 text-xs font-bold text-navy hover:bg-amber-hover">
            {t('lessons.detail.saveLine')}
          </button>
          <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-warm-border px-3 py-1.5 text-xs font-semibold text-ink">
            {t('create.question.cancelAction')}
          </button>
        </div>
      </div>
    )

  return (
    <div data-purpose="script-editor" className="space-y-5">
      {sections.map((section) => (
        <section key={section.id} data-purpose="script-section" className="space-y-2">
          <h3 className="flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-bold tracking-wide text-amber-text uppercase">{t(`lessons.roles.${section.role}`)}</span>
            <span className="font-serif text-base font-semibold text-navy">{section.title}</span>
          </h3>
          <ol className="space-y-2">
            {section.lines.map((line, index) => {
              const isEditing = editing !== null && editing.id === line.id && !editing.afterId
              const newLineEditor = editing?.afterId === line.id && (
                <li key={editing.id} data-purpose="script-line-new" className="rounded-xl border border-amber bg-card p-3">
                  {editorForm(section.id)}
                </li>
              )
              return [
                <li
                  key={line.id}
                  data-purpose="script-line"
                  data-line-id={line.id}
                  className={`rounded-xl border bg-card p-3 ${line.issue ? 'border-2 border-dashed border-amber' : 'border-warm-border'}`}
                >
                  {isEditing ? (
                    editorForm(section.id)
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                          {t(`lessons.speakers.${line.speaker}`)}
                          {line.pause && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-muted normal-case">{t('lessons.detail.pauseTag')}</span>}
                          {line.edited && <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] text-amber-text normal-case">{t('lessons.detail.editedTag')}</span>}
                        </p>
                        <p dir="auto" className="text-sm leading-relaxed text-ink">
                          {line.text}
                        </p>
                        {line.issue && (
                          <p data-purpose="line-issue" className="flex items-start gap-1.5 text-xs font-medium text-amber-text">
                            <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              <span className="font-bold">{t('lessons.detail.needsCheck')}</span> {issueText(line.issue)}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="-mr-1 flex shrink-0 justify-end gap-0.5 border-t border-warm-border pt-1 sm:mr-0 sm:border-t-0 sm:pt-0">
                        <button type="button" disabled={disabled || index === 0} onClick={() => move(section.id, index, -1)} className={iconButton} aria-label={t('lessons.detail.moveUp')} title={t('lessons.detail.moveUp')}>
                          <ArrowUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled || index === section.lines.length - 1}
                          onClick={() => move(section.id, index, 1)}
                          className={iconButton}
                          aria-label={t('lessons.detail.moveDown')}
                          title={t('lessons.detail.moveDown')}
                        >
                          <ArrowDownIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled || editing !== null}
                          onClick={() => setEditing({ id: line.id, text: line.text, speaker: line.speaker })}
                          className={iconButton}
                          aria-label={t('lessons.detail.editLine')}
                          title={t('lessons.detail.editLine')}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled || editing !== null}
                          onClick={() => addAfter(line.id, speakers[(speakers.indexOf(line.speaker) + 1) % speakers.length])}
                          className={iconButton}
                          aria-label={t('lessons.detail.addLine')}
                          title={t('lessons.detail.addLine')}
                        >
                          <PlusIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled || editing !== null}
                          onClick={() => update(section.id, (lines) => lines.filter((entry) => entry.id !== line.id))}
                          className={`${iconButton} hover:bg-error/10 hover:text-error`}
                          aria-label={t('lessons.detail.deleteLine')}
                          title={t('lessons.detail.deleteLine')}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>,
                newLineEditor,
              ]
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
