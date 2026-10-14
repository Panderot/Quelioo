import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ComponentType, SVGProps } from 'react'

import { useNow } from '../hooks/useNow'
import { dueCountForDeck, useFlashcards } from '../lib/flashcardStorage'
import UserMenu from './auth/UserMenu'
import LanguageSwitcher from './LanguageSwitcher'
import { LogoMark } from './Logo'
import SyncStatus from './SyncStatus'
import { ArchiveIcon, CalculatorIcon, CardsIcon, HomeIcon } from './icons'

interface NavItem {
  key: string
  labelKey: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  to: string
}

const createItem: NavItem = { key: 'create', labelKey: 'nav.create', Icon: HomeIcon, to: '/' }
const solveItem: NavItem = { key: 'solve', labelKey: 'nav.solve', Icon: CalculatorIcon, to: '/solve' }
const flashcardsItem: NavItem = { key: 'flashcards', labelKey: 'nav.flashcards', Icon: CardsIcon, to: '/flashcards' }
const archiveItem: NavItem = { key: 'archive', labelKey: 'nav.archive', Icon: ArchiveIcon, to: '/archive' }

const MAIN_ITEMS = [createItem, solveItem, flashcardsItem]
const TAB_ITEMS = [createItem, solveItem, flashcardsItem, archiveItem]

/** Cards due today, for the badge on the Flashcards item. */
function useDueToday(): number {
  const flashcards = useFlashcards()
  const now = Math.max(useNow(), flashcards.changedAt)
  return flashcards.decks.reduce((sum, deck) => sum + dueCountForDeck(deck, flashcards.cards, now), 0)
}

function DueBadge({ count }: { count: number }) {
  const { t } = useTranslation()
  if (count === 0) return null
  return (
    <span data-purpose="flashcards-due-badge" title={t('flashcards.nav.dueToday', { count })} className="text-xs font-semibold text-paper/60">
      <span aria-hidden>{count}</span>
      <span className="sr-only">{t('flashcards.nav.dueToday', { count })}</span>
    </span>
  )
}

/** One item of the top bar: the amber underline marks the current page. */
function TopLink({ item, dueToday }: { item: NavItem; dueToday: number }) {
  const { t } = useTranslation()
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `group relative flex h-16 shrink-0 items-center gap-2 px-3 text-sm whitespace-nowrap transition-colors lg:px-4 ${isActive ? 'font-semibold text-paper' : 'font-medium text-paper/60 hover:text-paper'}`
      }
    >
      {({ isActive }) => (
        <>
          <item.Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber' : 'text-paper/40 group-hover:text-paper/70'}`} />
          <span>{t(item.labelKey)}</span>
          {item.key === 'flashcards' && <DueBadge count={dueToday} />}
          {isActive && <span className="absolute right-3 bottom-0 left-3 h-[3px] rounded-t-full bg-amber" aria-hidden />}
        </>
      )}
    </NavLink>
  )
}

/** The signed-in app's top bar (always) and, below 640px, the bottom tab bar. Neither renders in study mode. */
export default function AppNav() {
  const { t } = useTranslation()
  const dueToday = useDueToday()

  return (
    <>
      <header data-purpose="top-nav" className="sticky top-0 z-40 bg-navy">
        <div className="flex h-12 items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
          <NavLink to="/" aria-label={t('app.name')} className="flex shrink-0 items-center gap-2.5 rounded-lg sm:mr-3">
            <LogoMark className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" tone="onDark" />
            <span className="font-serif text-xl font-semibold tracking-tight text-paper sm:text-2xl">{t('app.name')}</span>
          </NavLink>
          <p className="hidden shrink-0 text-xs font-semibold tracking-wide whitespace-nowrap text-amber xl:block">{t('app.tagline')}</p>

          <nav data-purpose="main-nav" aria-label={t('nav.main')} className="ml-1 hidden min-w-0 items-center sm:flex">
            {MAIN_ITEMS.map((item) => (
              <TopLink key={item.key} item={item} dueToday={dueToday} />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <SyncStatus />
            <div className="hidden sm:block">
              <TopLink item={archiveItem} dueToday={0} />
            </div>
            <LanguageSwitcher onDark />
            <UserMenu />
          </div>
        </div>
      </header>

      <nav
        data-purpose="tab-bar"
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-40 flex bg-navy pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {TAB_ITEMS.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight ${isActive ? 'font-semibold text-amber' : 'font-medium text-paper/60'}`
            }
          >
            <item.Icon className="h-5 w-5 shrink-0" />
            <span className="max-w-full truncate">{t(item.labelKey)}</span>
            {item.key === 'flashcards' && dueToday > 0 && (
              <span className="sr-only">{t('flashcards.nav.dueToday', { count: dueToday })}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
