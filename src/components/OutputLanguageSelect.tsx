import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { OUTPUT_LANGUAGES, SUGGESTED_OUTPUT_LANGUAGE_CODES } from '../data/outputLanguages'
import type { OutputLanguage } from '../data/outputLanguages'
import { CheckIcon, ChevronDownIcon } from './icons'

interface OutputLanguageSelectProps {
  id: string
  labelledBy: string
  value: string
  onChange: (code: string) => void
}

interface Entry {
  code: string
  displayName: string
  searchText: string
}

const MENU_WIDTH = 260
const MENU_MAX_HEIGHT = 280
const MENU_GAP = 6
const CLOSE_ANIMATION_MS = 120

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function buildSearchText(language: OutputLanguage): string {
  return normalizeForSearch([language.nativeName, language.englishName, language.trAlias].filter(Boolean).join(' '))
}

export default function OutputLanguageSelect({ id, labelledBy, value, onChange }: OutputLanguageSelectProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const [rect, setRect] = useState<{ top: number; bottom: number; right: number } | null>(null)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLLIElement | null>>([])
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autoLabel = t('inputCard.outputLanguage.auto')

  const allEntries = useMemo<Entry[]>(() => {
    const auto: Entry = { code: 'auto', displayName: autoLabel, searchText: normalizeForSearch(autoLabel) }
    const rest = OUTPUT_LANGUAGES.map((language) => ({
      code: language.code,
      displayName: language.nativeName,
      searchText: buildSearchText(language),
    }))
    return [auto, ...rest]
  }, [autoLabel])

  const entryByCode = useMemo(() => new Map(allEntries.map((entry) => [entry.code, entry])), [allEntries])

  const suggestedEntries = useMemo(
    () => ['auto', ...SUGGESTED_OUTPUT_LANGUAGE_CODES].map((code) => entryByCode.get(code)).filter((entry): entry is Entry => !!entry),
    [entryByCode],
  )
  const otherEntries = useMemo(() => {
    const suggestedCodes = new Set(suggestedEntries.map((entry) => entry.code))
    return allEntries.filter((entry) => !suggestedCodes.has(entry.code))
  }, [allEntries, suggestedEntries])

  const normalizedQuery = normalizeForSearch(query.trim())
  const isSearching = normalizedQuery.length > 0
  const filteredEntries = useMemo(
    () => (isSearching ? allEntries.filter((entry) => entry.searchText.includes(normalizedQuery)) : []),
    [allEntries, isSearching, normalizedQuery],
  )

  // The flat, currently-visible list — used for keyboard highlight/selection regardless of whether groups are shown.
  const visibleEntries = isSearching ? filteredEntries : [...suggestedEntries, ...otherEntries]

  const selected = entryByCode.get(value)

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const triggerRect = trigger.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top
    setPlacement(spaceBelow < MENU_MAX_HEIGHT + MENU_GAP && spaceAbove > spaceBelow ? 'top' : 'bottom')
    setRect({ top: triggerRect.top, bottom: triggerRect.bottom, right: triggerRect.right })
  }

  const openMenu = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setQuery('')
    setHighlightedIndex(0)
    setIsOpen(true)
    setMounted(true)
  }

  const closeMenu = (refocusTrigger: boolean) => {
    setIsOpen(false)
    setEntered(false)
    if (prefersReducedMotion()) {
      setMounted(false)
    } else {
      closeTimeoutRef.current = setTimeout(() => setMounted(false), CLOSE_ANIMATION_MS)
    }
    if (refocusTrigger) triggerRef.current?.focus()
  }

  const commitSelection = (index: number) => {
    const entry = visibleEntries[index]
    if (!entry) return
    if (entry.code !== value) onChange(entry.code)
    closeMenu(true)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      openMenu()
    }
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((current) => Math.min(current + 1, visibleEntries.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((current) => Math.max(current - 1, 0))
        break
      case 'Enter':
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
    }
  }

  useLayoutEffect(() => {
    if (!mounted) return
    updatePosition()
    const raf = requestAnimationFrame(() => setEntered(true))
    searchRef.current?.focus()
    return () => cancelAnimationFrame(raf)
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

  const menuWidth = Math.min(MENU_WIDTH, window.innerWidth - 16)
  const menuLeft = Math.max(8, Math.min((rect?.right ?? 0) - menuWidth, window.innerWidth - menuWidth - 8))
  const menuStyle = rect
    ? placement === 'bottom'
      ? {
          top: rect.bottom + MENU_GAP,
          left: menuLeft,
          width: menuWidth,
          maxHeight: Math.min(MENU_MAX_HEIGHT, window.innerHeight - rect.bottom - MENU_GAP - 12),
        }
      : {
          bottom: window.innerHeight - rect.top + MENU_GAP,
          left: menuLeft,
          width: menuWidth,
          maxHeight: Math.min(MENU_MAX_HEIGHT, rect.top - MENU_GAP - 12),
        }
    : undefined

  const slideClass = placement === 'top' ? 'translate-y-1' : '-translate-y-1'
  const listboxId = `${id}-listbox`
  const suggestedOffset = 0
  const otherOffset = suggestedEntries.length

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        data-select-trigger
        data-open={isOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelledBy}
        aria-controls={listboxId}
        aria-activedescendant={mounted ? `${id}-option-${highlightedIndex}` : undefined}
        onClick={() => (isOpen ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className="flex w-full items-center justify-between gap-2.5 rounded-lg border border-warm-border bg-paper py-1.5 pr-3 pl-3 text-left text-xs font-semibold text-ink transition-colors hover:border-focus-neutral focus:outline-none"
      >
        <span className="min-w-0 flex-1 truncate">{selected?.displayName ?? autoLabel}</span>
        <ChevronDownIcon className={`h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className={`fixed z-50 flex flex-col overflow-hidden rounded-xl border border-warm-border bg-card shadow-[0_16px_32px_-12px_rgba(20,23,43,0.18),0_4px_10px_-4px_rgba(20,23,43,0.08)] transition-[opacity,transform] duration-[120ms] ease-out ${
              entered ? 'translate-y-0 opacity-100' : `${slideClass} opacity-0`
            }`}
          >
            <div className="border-b border-warm-border p-2">
              <input
                ref={searchRef}
                type="text"
                role="searchbox"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setHighlightedIndex(0)
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('inputCard.outputLanguage.searchPlaceholder')}
                className="w-full rounded-lg border border-warm-border bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:border-focus-neutral focus:outline-none"
              />
            </div>

            <ul
              id={listboxId}
              role="listbox"
              aria-labelledby={labelledBy}
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-y-auto p-1.5 pr-3"
            >
              {isSearching ? (
                filteredEntries.length > 0 ? (
                  filteredEntries.map((entry, index) => (
                    <li
                      key={entry.code}
                      ref={(el) => {
                        optionRefs.current[index] = el
                      }}
                      id={`${id}-option-${index}`}
                      role="option"
                      aria-selected={entry.code === value}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => commitSelection(index)}
                      className={`flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-[10px] py-2 pr-2 pl-3 text-[15px] leading-snug transition-colors ${
                        index === highlightedIndex ? 'bg-amber/12' : ''
                      } ${entry.code === value ? 'font-semibold text-ink' : 'font-medium text-ink'}`}
                    >
                      <span dir="auto" className="min-w-0 flex-1 truncate">
                        {entry.displayName}
                      </span>
                      {entry.code === value && <CheckIcon className="h-4 w-4 shrink-0 text-amber-hover" />}
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-4 text-center text-sm text-muted">{t('inputCard.outputLanguage.noResults')}</li>
                )
              ) : (
                <>
                  <li className="px-3 pt-1 pb-1 text-[11px] font-bold tracking-wide text-muted uppercase" aria-hidden>
                    {t('inputCard.outputLanguage.suggested')}
                  </li>
                  {suggestedEntries.map((entry, i) => {
                    const index = suggestedOffset + i
                    return (
                      <li
                        key={entry.code}
                        ref={(el) => {
                          optionRefs.current[index] = el
                        }}
                        id={`${id}-option-${index}`}
                        role="option"
                        aria-selected={entry.code === value}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => commitSelection(index)}
                        className={`flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-[10px] py-2 pr-2 pl-3 text-[15px] leading-snug transition-colors ${
                          index === highlightedIndex ? 'bg-amber/12' : ''
                        } ${entry.code === value ? 'font-semibold text-ink' : 'font-medium text-ink'}`}
                      >
                        <span dir="auto" className="min-w-0 flex-1 truncate">
                          {entry.displayName}
                        </span>
                        {entry.code === value && <CheckIcon className="h-4 w-4 shrink-0 text-amber-hover" />}
                      </li>
                    )
                  })}
                  <li className="mt-1 px-3 pt-2 pb-1 text-[11px] font-bold tracking-wide text-muted uppercase" aria-hidden>
                    {t('inputCard.outputLanguage.allLanguages')}
                  </li>
                  {otherEntries.map((entry, i) => {
                    const index = otherOffset + i
                    return (
                      <li
                        key={entry.code}
                        ref={(el) => {
                          optionRefs.current[index] = el
                        }}
                        id={`${id}-option-${index}`}
                        role="option"
                        aria-selected={entry.code === value}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => commitSelection(index)}
                        className={`flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-[10px] py-2 pr-2 pl-3 text-[15px] leading-snug transition-colors ${
                          index === highlightedIndex ? 'bg-amber/12' : ''
                        } ${entry.code === value ? 'font-semibold text-ink' : 'font-medium text-ink'}`}
                      >
                        <span dir="auto" className="min-w-0 flex-1 truncate">
                          {entry.displayName}
                        </span>
                        {entry.code === value && <CheckIcon className="h-4 w-4 shrink-0 text-amber-hover" />}
                      </li>
                    )
                  })}
                </>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}
