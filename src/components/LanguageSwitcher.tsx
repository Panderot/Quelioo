import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { CheckIcon, ChevronDownIcon, GlobeIcon } from './icons'

interface LanguageOption {
  code: 'en' | 'tr' | 'hyw'
  shortLabel: string
  nativeLabel: string
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', shortLabel: 'EN', nativeLabel: 'English' },
  { code: 'tr', shortLabel: 'TR', nativeLabel: 'Türkçe' },
  { code: 'hyw', shortLabel: 'ՀԱՅ', nativeLabel: 'Հայերէն (Արեւմտահայերէն)' },
]

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const currentCode = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as LanguageOption['code']
  const current = LANGUAGES.find((lang) => lang.code === currentCode) ?? LANGUAGES[0]

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      optionRefs.current[activeIndex]?.focus()
    }
    // Only run when the menu opens; activeIndex changes afterward via arrow keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const openMenu = () => {
    const selectedIndex = LANGUAGES.findIndex((lang) => lang.code === current.code)
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex)
    setIsOpen(true)
  }

  const selectLanguage = (code: LanguageOption['code']) => {
    void i18n.changeLanguage(code)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const handleButtonClick = () => {
    if (isOpen) {
      setIsOpen(false)
    } else {
      openMenu()
    }
  }

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu()
    }
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      buttonRef.current?.focus()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = (activeIndex + 1) % LANGUAGES.length
      setActiveIndex(nextIndex)
      optionRefs.current[nextIndex]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const nextIndex = (activeIndex - 1 + LANGUAGES.length) % LANGUAGES.length
      setActiveIndex(nextIndex)
      optionRefs.current[nextIndex]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
      optionRefs.current[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      const lastIndex = LANGUAGES.length - 1
      setActiveIndex(lastIndex)
      optionRefs.current[lastIndex]?.focus()
    } else if (event.key === 'Tab') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('topbar.language.buttonLabel')}
        onClick={handleButtonClick}
        onKeyDown={handleButtonKeyDown}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink md:text-sm"
      >
        <GlobeIcon className="h-4 w-4" />
        <span>{current.shortLabel}</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-label={t('topbar.language.menuLabel')}
          className="absolute top-full right-0 z-50 mt-2 w-60 space-y-0.5 rounded-xl border border-warm-border bg-card p-1.5 shadow-[0_16px_32px_-12px_rgba(20,23,43,0.18),0_4px_10px_-4px_rgba(20,23,43,0.08)]"
        >
          {LANGUAGES.map((lang, index) => (
            <li key={lang.code} role="none">
              <button
                ref={(el) => {
                  optionRefs.current[index] = el
                }}
                type="button"
                role="option"
                aria-selected={lang.code === current.code}
                tabIndex={-1}
                onClick={() => selectLanguage(lang.code)}
                onKeyDown={handleOptionKeyDown}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left text-[15px] leading-snug break-words transition-colors hover:bg-amber/12 focus:bg-amber/12 ${
                  lang.code === current.code ? 'font-semibold text-ink' : 'font-medium text-ink'
                }`}
              >
                <span>{lang.nativeLabel}</span>
                {lang.code === current.code && <CheckIcon className="h-4 w-4 shrink-0 text-amber-hover" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
