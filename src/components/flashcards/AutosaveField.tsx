import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, Ref } from 'react'

const SAVE_DEBOUNCE_MS = 400

interface AutosaveFieldProps {
  value: string
  onCommit: (value: string) => void
  label: string
  maxLength: number
  multiline?: boolean
  rows?: number
  invalid?: boolean
  inputRef?: Ref<HTMLInputElement & HTMLTextAreaElement>
  placeholder?: string
  describedBy?: string
  dataPurpose?: string
}

/** A text field that saves itself: debounced while typing, immediately on blur and on unmount. */
export default function AutosaveField({ value, onCommit, label, maxLength, multiline, rows = 2, invalid, inputRef, placeholder, describedBy, dataPurpose }: AutosaveFieldProps) {
  const [draft, setDraft] = useState(value)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitRef = useRef(onCommit)
  useEffect(() => {
    commitRef.current = onCommit
  }, [onCommit])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current !== null) {
      commitRef.current(pending.current)
      pending.current = null
    }
  }

  // Saves whatever is still pending when the field unmounts (e.g. navigating away mid-debounce).
  useEffect(() => flush, [])

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.target.value.slice(0, maxLength)
    setDraft(next)
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }

  const className = `w-full rounded-xl border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted ${
    invalid ? 'border-error' : 'border-warm-border hover:border-focus-neutral'
  }`
  const shared = {
    value: draft,
    onChange: handleChange,
    onBlur: flush,
    maxLength,
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    'data-purpose': dataPurpose,
    placeholder,
    ref: inputRef,
  }
  return multiline ? <textarea rows={rows} {...shared} className={`${className} resize-y`} /> : <input type="text" {...shared} className={className} />
}
