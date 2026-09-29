import { useTranslation } from 'react-i18next'

import LanguageSwitcher from './LanguageSwitcher'
import { MenuIcon } from './icons'

interface TopBarProps {
  onOpenMobileNav: () => void
  freeRunsRemaining: number
  freeRunsTotal: number
}

export default function TopBar({ onOpenMobileNav, freeRunsRemaining, freeRunsTotal }: TopBarProps) {
  const { t } = useTranslation()
  const progressPercent = Math.min(100, Math.round((freeRunsRemaining / freeRunsTotal) * 100))

  return (
    <header data-purpose="top-nav" className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t('nav.openMenu')}
        className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-warm-border/50 md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <div className="flex flex-1 shrink-0 items-center justify-end gap-3 md:gap-4">
        <div className="hidden flex-col gap-1 sm:flex">
          <span className="text-xs font-semibold text-ink">{t('topbar.freeRunsLeft', { count: freeRunsRemaining })}</span>
          <span className="h-1 w-24 overflow-hidden rounded-full bg-warm-border">
            <span
              className="block h-full rounded-full bg-amber transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        </div>

        <button
          type="button"
          data-purpose="upgrade-button"
          className="rounded-xl bg-amber px-4 py-2 text-xs font-bold text-navy shadow-sm transition-all hover:scale-[1.02] hover:bg-amber-hover active:scale-[0.98] md:text-sm"
        >
          {t('topbar.upgrade')}
        </button>

        <LanguageSwitcher />

        <button
          type="button"
          data-purpose="logout-button"
          className="rounded-xl px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink md:text-sm"
        >
          {t('topbar.logout')}
        </button>

        <div className="flex items-center gap-2 border-l border-warm-border pl-2">
          <button
            type="button"
            aria-label={t('topbar.avatarLabel')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-bold text-paper ring-2 ring-amber/40"
          >
            {t('topbar.avatarInitials')}
          </button>
        </div>
      </div>
    </header>
  )
}
