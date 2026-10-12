import { useId, useState } from 'react'

interface InfoTipProps {
  /** What the tip says (also the accessible description). */
  text: string
  label: string
}

/** A small "i" button that shows a short explanation on hover, focus or tap. */
export default function InfoTip({ text, label }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-flex" data-purpose="info-tip">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-warm-border text-[11px] font-bold leading-none text-muted hover:border-focus-neutral hover:text-ink"
      >
        i
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-0 top-6 z-20 w-64 rounded-lg border border-warm-border bg-card p-2.5 text-xs font-normal leading-snug text-ink shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}
