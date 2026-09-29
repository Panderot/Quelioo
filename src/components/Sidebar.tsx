import { useTranslation } from 'react-i18next'

import {
  AccountIcon,
  AiSlidesIcon,
  BloomsQuizIcon,
  HomeIcon,
  IllustrateStoryIcon,
  ImageToQuizIcon,
  MatchingQuizIcon,
  NewsToQuizIcon,
  PdfToQuizIcon,
  SavedIcon,
  SimilarQuizIcon,
  VideoToQuizIcon,
  YoutubeToQuizIcon,
} from './icons'
import type { ComponentType, SVGProps } from 'react'

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

interface NavItem {
  key: string
  labelKey: string
  Icon: NavIcon
  pro?: boolean
}

const mainNavItems: NavItem[] = [
  { key: 'home', labelKey: 'nav.home', Icon: HomeIcon },
  { key: 'blooms', labelKey: 'nav.bloomsQuiz', Icon: BloomsQuizIcon },
  { key: 'similar', labelKey: 'nav.similarQuiz', Icon: SimilarQuizIcon },
  { key: 'illustrate', labelKey: 'nav.illustrateStory', Icon: IllustrateStoryIcon },
  { key: 'image', labelKey: 'nav.imageToQuiz', Icon: ImageToQuizIcon },
  { key: 'matching', labelKey: 'nav.matchingQuiz', Icon: MatchingQuizIcon },
  { key: 'video', labelKey: 'nav.videoToQuiz', Icon: VideoToQuizIcon },
  { key: 'news', labelKey: 'nav.newsToQuiz', Icon: NewsToQuizIcon },
  { key: 'pdf', labelKey: 'nav.pdfToQuiz', Icon: PdfToQuizIcon },
  { key: 'youtube', labelKey: 'nav.youtubeToQuiz', Icon: YoutubeToQuizIcon },
  { key: 'ai-slides', labelKey: 'nav.aiSlides', Icon: AiSlidesIcon, pro: true },
]

const footerNavItems: NavItem[] = [
  { key: 'saved', labelKey: 'nav.saved', Icon: SavedIcon },
  { key: 'account', labelKey: 'nav.account', Icon: AccountIcon },
]

interface SidebarProps {
  isMobileOpen: boolean
  onCloseMobile: () => void
}

export default function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useTranslation()

  const renderItem = (item: NavItem) => {
    const isActive = item.key === 'home'
    return (
      <a
        key={item.key}
        href="#"
        title={t(item.labelKey)}
        aria-current={isActive ? 'page' : undefined}
        className={`group flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 ${
          isActive
            ? 'bg-brand-600 font-semibold text-white shadow-sm shadow-brand-600/25'
            : 'font-medium text-slate-600 hover:bg-slate-100/80 hover:text-brand-600'
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <item.Icon
            className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-600'}`}
          />
          <span className="truncate md:hidden lg:inline">{t(item.labelKey)}</span>
        </span>
        {item.pro && (
          <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 md:hidden lg:inline">
            {t('nav.pro')}
          </span>
        )}
      </a>
    )
  }

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label={t('nav.closeMenu')}
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
        />
      )}
      <aside
        data-purpose="sidebar-navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col justify-between border-r border-slate-100 bg-slate-50/70 transition-transform duration-200 md:static md:z-auto md:w-[72px] md:translate-x-0 lg:w-64 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col p-5">
          <div className="px-2 pt-1 pb-6">
            <div className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-blue-500 text-xl font-black text-white shadow-md shadow-brand-500/30">
                Q
                <span className="absolute -top-1 -right-1 text-xs text-amber-400" aria-hidden>
                  ✦
                </span>
              </div>
              <span className="truncate text-2xl font-extrabold tracking-tight text-slate-900 md:hidden lg:inline">
                {t('app.name')}
              </span>
            </div>
            <p className="mt-1 pl-1 text-xs font-semibold tracking-wide text-brand-600 md:hidden lg:block">
              {t('app.tagline')}
            </p>
          </div>
          <nav
            aria-label={t('nav.home')}
            className="max-h-[calc(100vh-280px)] space-y-1 overflow-y-auto pr-1"
          >
            {mainNavItems.map(renderItem)}
          </nav>
        </div>
        <div
          data-purpose="sidebar-footer"
          className="space-y-1 border-t border-slate-200/70 p-4"
        >
          {footerNavItems.map(renderItem)}
        </div>
      </aside>
    </>
  )
}
