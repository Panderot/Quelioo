import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ChevronDownIcon } from './icons'

export interface MoreMenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}

/**
 * Outline "More" button opening a small action menu — same visual tokens as the Select dropdown
 * (design.md 7.10: card surface, warm border, radius 12, 40px rows, amber-tint highlight).
 * WAI-ARIA menu button: Enter/Space/ArrowDown open, arrows move, Home/End, Escape closes.
 */
export default function MoreMenu({ items, className = '' }: { items: MoreMenuItem[]; className?: string }) {
  const { t } = useTranslation()
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    itemRefs.current[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    return () => document.removeEventListener('pointerdown', handlePointer)
  }, [open])

  const openMenu = (index = 0) => {
    setActive(index)
    setOpen(true)
  }

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(items.length - 1)
    }
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index - 1 + items.length) % items.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(items.length - 1)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu(0))}
        onKeyDown={handleButtonKeyDown}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber sm:w-auto"
      >
        {t('solve.actions.more')}
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('solve.actions.more')}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 left-0 z-30 mt-1.5 min-w-full rounded-xl border border-warm-border bg-card p-1 shadow-lg sm:left-auto sm:w-max sm:min-w-[220px]"
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              type="button"
              role="menuitem"
              tabIndex={index === active ? 0 : -1}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                close(true)
                item.onSelect()
              }}
              className={`flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-[15px] text-ink outline-none ${
                index === active ? 'bg-amber/12' : ''
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
