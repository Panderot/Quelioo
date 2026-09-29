import { useTranslation } from 'react-i18next'

import { LightningIcon, MenuIcon, SearchIcon } from './icons'

interface TopBarProps {
  onOpenMobileNav: () => void
  freeRunsRemaining: number
}

export default function TopBar({ onOpenMobileNav, freeRunsRemaining }: TopBarProps) {
  const { t } = useTranslation()

  return (
    <header
      data-purpose="top-nav"
      className="flex h-20 items-center justify-between gap-4 border-b border-slate-100 px-4 sm:px-6 lg:px-10"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label={t('nav.openMenu')}
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="flex w-full max-w-sm items-center">
          <div className="relative w-full">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <SearchIcon className="h-4 w-4" />
            </span>
            <label htmlFor="template-search" className="sr-only">
              {t('topbar.searchLabel')}
            </label>
            <input
              id="template-search"
              type="text"
              placeholder={t('topbar.searchPlaceholder')}
              className="w-full rounded-xl border border-slate-200/80 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder-slate-400 transition-all focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 md:gap-4">
        <div className="hidden items-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <span>
            {t('topbar.freeRunsRemainingLabel')}{' '}
            <strong className="font-bold text-slate-900">{freeRunsRemaining}</strong>
          </span>
        </div>

        <button
          type="button"
          data-purpose="upgrade-button"
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition-all hover:scale-[1.02] hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 md:text-sm"
        >
          <LightningIcon className="h-4 w-4 text-emerald-200" />
          <span>{t('topbar.upgrade')}</span>
        </button>

        <button
          type="button"
          data-purpose="logout-button"
          className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 md:text-sm"
        >
          {t('topbar.logout')}
        </button>

        <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
          <button
            type="button"
            aria-label={t('topbar.avatarLabel')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm ring-2 ring-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            {t('topbar.avatarInitials')}
          </button>
        </div>
      </div>
    </header>
  )
}
