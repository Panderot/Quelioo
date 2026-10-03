import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { CheckIcon, ChevronDownIcon } from './icons'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  id: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  labelledBy: string
  variant?: 'param' | 'boxed'
  className?: string
  disabled?: boolean
}

interface TriggerRect {
  top: number
  bottom: number
  left: number
  width: number
}

const MENU_MAX_HEIGHT = 280
const MENU_GAP = 6
const CLOSE_ANIMATION_MS = 120

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const triggerBaseClasses =
  'flex w-full items-center text-left transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const variantClasses: Record<NonNullable<SelectProps['variant']>, string> = {
  param:
    'h-11 justify-between gap-3.5 rounded-[10px] border border-warm-border bg-card pl-4 pr-4 text-sm font-semibold text-ink hover:border-focus-neutral',
  boxed:
    'justify-between gap-2.5 rounded-lg border border-warm-border bg-paper py-1.5 pl-3 pr-3 text-xs font-semibold text-ink hover:border-focus-neutral',
}

export default function Select({
  id,
  value,
  options,
  onChange,
  labelledBy,
  variant = 'param',
  className = '',
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const [rect, setRect] = useState<TriggerRect | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const optionRefs = useRef<Array<HTMLLIElement | null>>([])
  const typeAheadRef = useRef({ query: '', timeoutId: 0 as ReturnType<typeof setTimeout> | 0 })
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex]
  const listboxId = `${id}-listbox`

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const triggerRect = trigger.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const estimatedHeight = Math.min(MENU_MAX_HEIGHT, options.length * 40 + 12)
    const spaceBelow = viewportHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top
    setPlacement(spaceBelow < estimatedHeight + MENU_GAP && spaceAbove > spaceBelow ? 'top' : 'bottom')
    setRect({ top: triggerRect.top, bottom: triggerRect.bottom, left: triggerRect.left, width: triggerRect.width })
  }

  const openMenu = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setHighlightedIndex(selectedIndex === -1 ? 0 : selectedIndex)
    setIsOpen(true)
    setMounted(true)
  }

  const closeMenu = (refocusTrigger: boolean) => {
    // A second close while the first one animates must not leave the first timer behind: it would
    // unmount the menu again after the user already reopened it.
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    setIsOpen(false)
    setEntered(false)
    if (prefersReducedMotion()) {
      setMounted(false)
    } else {
      closeTimeoutRef.current = setTimeout(() => setMounted(false), CLOSE_ANIMATION_MS)
    }
    if (refocusTrigger) {
      triggerRef.current?.focus()
    }
  }

  const toggleOpen = () => {
    if (isOpen) {
      closeMenu(false)
    } else {
      openMenu()
    }
  }

  const commitSelection = (index: number) => {
    const option = options[index]
    if (!option) return
    if (option.value !== value) onChange(option.value)
    closeMenu(true)
  }

  const handleTypeAhead = (char: string) => {
    const state = typeAheadRef.current
    clearTimeout(state.timeoutId)
    const nextQuery = state.query + char.toLowerCase()
    let matchIndex = options.findIndex((option) => option.label.toLowerCase().startsWith(nextQuery))
    if (matchIndex === -1) {
      matchIndex = options.findIndex((option) => option.label.toLowerCase().startsWith(char.toLowerCase()))
      state.query = matchIndex === -1 ? '' : char.toLowerCase()
    } else {
      state.query = nextQuery
    }
    state.timeoutId = setTimeout(() => {
      state.query = ''
    }, 600)
    if (matchIndex !== -1) setHighlightedIndex(matchIndex)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event

    if (!isOpen) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault()
        openMenu()
      }
      return
    }

    switch (key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((current) => (current + 1) % options.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((current) => (current - 1 + options.length) % options.length)
        break
      case 'Home':
        event.preventDefault()
        setHighlightedIndex(0)
        break
      case 'End':
        event.preventDefault()
        setHighlightedIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        commitSelection(highlightedIndex)
        break
      case 'Escape':
        event.preventDefault()
        closeMenu(true)
        break
      case 'Tab':
        closeMenu(false)
        break
      default:
        if (key.length === 1) handleTypeAhead(key)
    }
  }

  useLayoutEffect(() => {
    if (!mounted) return
    updatePosition()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    const handleReposition = () => updatePosition()
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, mounted])

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    },
    [],
  )

  const menuStyle: CSSProperties | undefined = rect
    ? placement === 'bottom'
      ? {
          top: rect.bottom + MENU_GAP,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(MENU_MAX_HEIGHT, window.innerHeight - rect.bottom - MENU_GAP - 12),
        }
      : {
          bottom: window.innerHeight - rect.top + MENU_GAP,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(MENU_MAX_HEIGHT, rect.top - MENU_GAP - 12),
        }
    : undefined

  const slideClass = placement === 'top' ? 'translate-y-1' : '-translate-y-1'

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        data-select-trigger
        data-open={isOpen}
        disabled={disabled}
        aria-disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelledBy}
        aria-controls={listboxId}
        aria-activedescendant={mounted ? `${id}-option-${highlightedIndex}` : undefined}
        onClick={disabled ? undefined : toggleOpen}
        onKeyDown={disabled ? undefined : handleTriggerKeyDown}
        className={`${triggerBaseClasses} ${variantClasses[variant]} ${disabled ? 'text-muted' : ''} ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {mounted &&
        createPortal(
          <ul
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            style={menuStyle}
            className={`fixed z-50 overflow-y-auto rounded-xl border border-warm-border bg-card p-1.5 shadow-[0_16px_32px_-12px_rgba(20,23,43,0.18),0_4px_10px_-4px_rgba(20,23,43,0.08)] transition-[opacity,transform] duration-[120ms] ease-out ${
              entered ? 'translate-y-0 opacity-100' : `${slideClass} opacity-0`
            }`}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                ref={(el) => {
                  optionRefs.current[index] = el
                }}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commitSelection(index)}
                className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-[15px] leading-snug break-words transition-colors ${
                  index === highlightedIndex ? 'bg-amber/12' : ''
                } ${index === selectedIndex ? 'font-semibold text-ink' : 'font-medium text-ink'}`}
              >
                <span>{option.label}</span>
                {index === selectedIndex && <CheckIcon className="h-4 w-4 shrink-0 text-amber-hover" />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  )
}
