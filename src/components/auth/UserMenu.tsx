import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { signOut, useAuth } from '../../lib/auth/authStore'
import { initialsOf } from './authHelpers'

/** Sidebar footer: initials avatar and name that open a small menu (Account, Sign out). */
export default function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const name = profile?.display_name?.trim() || user?.email || ''
  const items = [
    {
      key: 'account',
      label: t('userMenu.account'),
      run: () => {
        onNavigate?.()
        navigate('/account')
      },
    },
    {
      key: 'signOut',
      label: t('userMenu.signOut'),
      run: () => {
        onNavigate?.()
        void signOut()
      },
    },
  ]

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    return () => document.removeEventListener('pointerdown', handlePointer)
  }, [open])

  if (!user) return null

  const openMenu = (index = 0) => {
    setActive(index)
    setOpen(true)
  }
  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowUp' ? items.length - 1 : 0)
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
    <div ref={rootRef} data-purpose="user-menu" className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t('userMenu.label')}: ${name}`}
        title={name}
        onClick={() => (open ? close(false) : openMenu(0))}
        onKeyDown={handleButtonKeyDown}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg py-1.5 pr-3 pl-3 text-left text-sm font-medium text-paper/80 transition-colors hover:text-paper"
      >
        <span data-purpose="user-avatar" aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">
          {initialsOf(profile?.display_name ?? '', user.email)}
        </span>
        <span className="min-w-0 flex-1 truncate md:hidden lg:inline">{name}</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('userMenu.label')}
          onKeyDown={handleMenuKeyDown}
          className="absolute bottom-full left-0 z-50 mb-1.5 w-56 rounded-xl border border-warm-border bg-card p-1 shadow-lg"
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
                close(false)
                item.run()
              }}
              className={`flex min-h-10 w-full items-center rounded-[10px] px-3 text-left text-[15px] text-ink outline-none ${index === active ? 'bg-amber/12' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
