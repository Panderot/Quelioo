import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
}

interface Props {
  label: string
  idPrefix: string
  items: TabItem[]
  active: string
  onChange: (id: string) => void
}

/** WAI-ARIA tabs: arrow keys, Home/End; the row scrolls sideways inside itself on narrow screens. */
export default function Tabs({ label, idPrefix, items, active, onChange }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next < 0) return
    event.preventDefault()
    onChange(items[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
      <div role="tablist" aria-label={label} className="mx-auto flex w-max min-w-0 gap-1.5 rounded-full border border-warm-border bg-card p-1.5">
        {items.map((item, index) => {
          const selected = item.id === active
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[index] = el
              }}
              role="tab"
              type="button"
              id={`${idPrefix}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
                selected ? 'bg-navy text-paper' : 'text-navy hover:bg-paper'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
