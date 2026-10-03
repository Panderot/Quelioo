import { useState } from 'react'
import type { ReactNode } from 'react'

import { hasLatex } from '../lib/mathPlain'
import MathText from './MathText'

interface MathEditableProps {
  value: string
  label: string
  /** Classes of the rendered box — the same ones as the edit field, so the look does not jump. */
  className: string
  dataPurpose?: string
  /** The edit field. Spread `focusProps` on it: focusing keeps it a field while typing, leaving it renders the math again. */
  children: (focusProps: { autoFocus: boolean; onFocus: () => void; onBlur: () => void }) => ReactNode
}

/** Text with math is shown rendered (KaTeX); clicking it switches to the edit field, leaving the field renders it again. Plain text stays a normal field. */
export default function MathEditable({ value, label, className, dataPurpose, children }: MathEditableProps) {
  const [editing, setEditing] = useState(false)
  const rendered = !editing && hasLatex(value)

  if (!rendered) {
    return <>{children({ autoFocus: editing, onFocus: () => setEditing(true), onBlur: () => setEditing(false) })}</>
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      data-purpose={dataPurpose ? `${dataPurpose}-rendered` : undefined}
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setEditing(true)
        }
      }}
      className={`${className} cursor-text break-words whitespace-pre-wrap`}
    >
      <MathText text={value} />
    </div>
  )
}
