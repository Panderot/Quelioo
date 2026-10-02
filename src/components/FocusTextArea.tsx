import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { FocusPart } from '../lib/focusSnippets'
import { MAX_FOCUS_PARTS, addFocusRange, focusPartPreview, reconcileFocusParts, removeFocusPart } from '../lib/focusSnippets'
import { getCaretCoordinates } from '../lib/caretPosition'
import { sanitizeTextLight } from '../lib/sanitizeText'
import { XIcon } from './icons'

/** Shared layout-relevant classes — must stay identical between the highlight backdrop and the
 * transparent textarea sitting on top of it, or their text won't line up. */
const SHARED_LAYOUT_CLASSES = 'min-h-[220px] w-full rounded-2xl border px-4 py-4 text-sm leading-relaxed md:py-5 whitespace-pre-wrap break-words'

interface Selection {
  start: number
  end: number
}

function renderHighlightedText(text: string, parts: FocusPart[]): ReactNode[] {
  const nodes: ReactNode[] = []
  const sorted = [...parts].sort((a, b) => a.start - b.start)
  let cursor = 0
  sorted.forEach((part) => {
    const start = Math.max(cursor, Math.min(part.start, text.length))
    const end = Math.max(start, Math.min(part.end, text.length))
    if (start > cursor) nodes.push(<span key={`plain-${cursor}`}>{text.slice(cursor, start)}</span>)
    if (end > start) {
      nodes.push(
        <mark key={part.id} className="rounded-sm bg-amber/30 text-ink">
          {text.slice(start, end)}
        </mark>,
      )
    }
    cursor = end
  })
  if (cursor < text.length) nodes.push(<span key={`plain-${cursor}`}>{text.slice(cursor)}</span>)
  // Forces the backdrop to render a trailing blank line the same way a textarea does for a
  // trailing newline, keeping the grid-shared height in sync.
  if (text.endsWith('\n')) nodes.push('​')
  return nodes
}

interface FocusTextAreaProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  hasError: boolean
  focusParts: FocusPart[]
  onFocusPartsChange: (parts: FocusPart[]) => void
  /** False hides "Mark as focus" (features that don't use focus parts, e.g. Audio Lesson). */
  focusEnabled?: boolean
}

export default function FocusTextArea({ id, value, onChange, placeholder, hasError, focusParts, onFocusPartsChange, focusEnabled = true }: FocusTextAreaProps) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [buttonPosition, setButtonPosition] = useState<{ top: number; left: number } | null>(null)
  const [prunedNoticeVisible, setPrunedNoticeVisible] = useState(false)
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current)
  }, [])

  const updateSelectionState = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, selectionEnd } = textarea
    if (selectionStart === selectionEnd || textarea.value.slice(selectionStart, selectionEnd).trim().length === 0) {
      setSelection(null)
      setButtonPosition(null)
      return
    }
    setSelection({ start: selectionStart, end: selectionEnd })
    const coords = getCaretCoordinates(textarea, selectionEnd)
    const wrapperWidth = wrapperRef.current?.clientWidth ?? 0
    setButtonPosition({
      top: Math.max(0, coords.top - coords.height - 8),
      left: Math.min(Math.max(0, coords.left), Math.max(0, wrapperWidth - 140)),
    })
  }

  const handleChange = (rawValue: string) => {
    const nextValue = sanitizeTextLight(rawValue)
    const { parts: reconciled, removedCount } = reconcileFocusParts(focusParts, value, nextValue)
    if (removedCount !== reconciled.length || reconciled.length !== focusParts.length) {
      onFocusPartsChange(reconciled)
    }
    if (removedCount > 0) {
      setPrunedNoticeVisible(true)
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current)
      noticeTimeoutRef.current = setTimeout(() => setPrunedNoticeVisible(false), 4000)
    }
    onChange(nextValue)
    setSelection(null)
    setButtonPosition(null)
  }

  const markSelectionAsFocus = () => {
    if (!selection) return
    onFocusPartsChange(addFocusRange(focusParts, selection.start, selection.end))
    setSelection(null)
    setButtonPosition(null)
    textareaRef.current?.focus()
  }

  const atLimit = focusParts.length >= MAX_FOCUS_PARTS

  return (
    <div className="space-y-2">
      <div ref={wrapperRef} className="relative grid">
        <div
          aria-hidden
          dir="auto"
          className={`${SHARED_LAYOUT_CLASSES} pointer-events-none col-start-1 row-start-1 overflow-hidden border-transparent text-ink`}
        >
          {renderHighlightedText(value, focusParts)}
        </div>
        <textarea
          id={id}
          ref={textareaRef}
          dir="auto"
          rows={9}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onSelect={updateSelectionState}
          onMouseUp={updateSelectionState}
          onKeyUp={updateSelectionState}
          onScroll={() => setButtonPosition(null)}
          onBlur={() => setButtonPosition(null)}
          placeholder={placeholder}
          aria-invalid={hasError}
          className={`${SHARED_LAYOUT_CLASSES} col-start-1 row-start-1 resize-y border-dashed bg-transparent text-transparent caret-ink transition-all placeholder:text-muted focus:border-solid ${
            hasError ? 'border-error' : 'border-warm-border'
          }`}
        />
        {focusEnabled && buttonPosition && selection && (
          <button
            type="button"
            data-purpose="focus-mark-floating"
            onMouseDown={(event) => event.preventDefault()}
            onClick={markSelectionAsFocus}
            disabled={atLimit}
            style={{ top: buttonPosition.top, left: buttonPosition.left }}
            className="absolute z-10 -translate-y-full rounded-lg border border-amber bg-card px-2.5 py-1.5 text-xs font-semibold text-amber-text shadow-sm transition-colors hover:bg-amber/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('inputCard.focus.markSelection')}
          </button>
        )}
      </div>

      {focusEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-purpose="focus-mark-secondary"
            onClick={markSelectionAsFocus}
            disabled={!selection || atLimit}
            className="rounded-lg border border-amber px-3 py-1.5 text-xs font-semibold text-amber-text transition-colors hover:bg-amber/10 disabled:cursor-not-allowed disabled:border-warm-border disabled:text-muted disabled:hover:bg-transparent"
          >
            {t('inputCard.focus.markSelection')}
          </button>
          {atLimit && <span className="text-[11px] text-muted">{t('inputCard.focus.limitReached', { max: MAX_FOCUS_PARTS })}</span>}
        </div>
      )}

      {prunedNoticeVisible && <p className="text-[11px] font-medium text-amber-text">{t('inputCard.focus.removedByEdit')}</p>}

      {focusParts.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('inputCard.focus.chipsLabel')}>
          {focusParts.map((part) => (
            <li
              key={part.id}
              data-purpose="focus-chip"
              className="flex max-w-full items-center gap-1.5 rounded-full border border-amber/40 bg-amber/12 py-1 pr-1.5 pl-3 text-xs font-medium text-ink"
            >
              <span className="truncate">{focusPartPreview(value, part)}</span>
              <button
                type="button"
                onClick={() => onFocusPartsChange(removeFocusPart(focusParts, part.id))}
                aria-label={t('inputCard.focus.removeChip')}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-amber-hover hover:bg-amber/20"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
