import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useNow } from '../hooks/useNow'
import { useSongFeatureStatus } from '../hooks/useSongFeatureStatus'
import { dueCountForDeck, useFlashcards } from '../lib/flashcardStorage'
import { LogoMark } from './Logo'
import { ArchiveIcon, CalculatorIcon, CardsIcon, HeadphonesIcon, HomeIcon, MusicNoteIcon } from './icons'
import type { ComponentType, SVGProps } from 'react'

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

interface NavItem {
  key: string
  labelKey: string
  Icon: NavIcon
  to: string
}

const createNavItem: NavItem = { key: 'create', labelKey: 'nav.create', Icon: HomeIcon, to: '/' }
const solveNavItem: NavItem = { key: 'solve', labelKey: 'nav.solve', Icon: CalculatorIcon, to: '/solve' }
const songsNavItem: NavItem = { key: 'songs', labelKey: 'nav.songs', Icon: MusicNoteIcon, to: '/songs' }
const archiveNavItem: NavItem = { key: 'archive', labelKey: 'nav.archive', Icon: ArchiveIcon, to: '/archive' }
const flashcardsNavItem: NavItem = { key: 'flashcards', labelKey: 'nav.flashcards', Icon: CardsIcon, to: '/flashcards' }
const lessonsNavItem: NavItem = { key: 'lessons', labelKey: 'nav.lessons', Icon: HeadphonesIcon, to: '/lessons' }

interface SidebarProps {
  isMobileOpen: boolean
  onCloseMobile: () => void
}

export default function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useTranslation()
  const songStatus = useSongFeatureStatus()
  // Flashcards and Audio Lesson sit right after Songs; with Songs hidden they follow Archive in the footer.
  const songsEnabled = songStatus?.enabled === true
  const mainNavItems: NavItem[] = songsEnabled ? [createNavItem, solveNavItem, songsNavItem, flashcardsNavItem, lessonsNavItem] : [createNavItem, solveNavItem]
  const footerNavItems: NavItem[] = songsEnabled ? [archiveNavItem] : [archiveNavItem, flashcardsNavItem, lessonsNavItem]
  const flashcards = useFlashcards()
  const now = Math.max(useNow(), flashcards.changedAt)
  const dueToday = flashcards.decks.reduce((sum, deck) => sum + dueCountForDeck(deck, flashcards.cards, now), 0)

  const itemClasses = (isActive: boolean) =>
    `group relative flex items-center justify-between gap-3 rounded-lg py-2.5 pr-3 pl-4 text-sm transition-colors ${
      isActive ? 'font-semibold text-paper' : 'font-medium text-paper/60 hover:text-paper'
    }`

  const itemContent = (item: NavItem, isActive: boolean) => (
    <>
      {isActive && <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-amber" aria-hidden />}
      <span className="flex min-w-0 items-center gap-3">
        <item.Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber' : 'text-paper/40 group-hover:text-paper/70'}`} />
        <span className="truncate md:hidden lg:inline">{t(item.labelKey)}</span>
      </span>
      {item.key === 'flashcards' && dueToday > 0 && (
        <span data-purpose="flashcards-due-badge" title={t('flashcards.nav.dueToday', { count: dueToday })} className="text-xs font-semibold text-paper/60 md:hidden lg:inline">
          <span aria-hidden>{dueToday}</span>
          <span className="sr-only">{t('flashcards.nav.dueToday', { count: dueToday })}</span>
        </span>
      )}
    </>
  )

  const renderItem = (item: NavItem) => (
    <NavLink key={item.key} to={item.to} end={item.to === '/'} title={t(item.labelKey)} className={({ isActive }) => itemClasses(isActive)}>
      {({ isActive }) => itemContent(item, isActive)}
    </NavLink>
  )

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label={t('nav.closeMenu')}
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-ink/40 md:hidden"
        />
      )}
      <aside
        data-purpose="sidebar-navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col justify-between bg-navy transition-transform duration-200 md:static md:z-auto md:w-[72px] md:translate-x-0 lg:w-64 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col p-5">
          <div className="px-1 pt-1 pb-7">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8 shrink-0" tone="onDark" />
              <span className="truncate font-serif text-2xl font-semibold tracking-tight text-paper md:hidden lg:inline">
                {t('app.name')}
              </span>
            </div>
            <p className="mt-1.5 pl-1 text-xs font-semibold tracking-wide text-amber md:hidden lg:block">
              {t('app.tagline')}
            </p>
          </div>
          <nav aria-label={t('nav.create')} className="space-y-1">
            {mainNavItems.map(renderItem)}
          </nav>
        </div>
        <div
          data-purpose="sidebar-footer"
          className="space-y-1 border-t border-paper/10 p-4"
        >
          {footerNavItems.map(renderItem)}
        </div>
      </aside>
    </>
  )
}
