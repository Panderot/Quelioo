import { useTranslation } from 'react-i18next'

import LanguageSwitcher from './LanguageSwitcher'
import { MenuIcon } from './icons'

interface TopBarProps {
  onOpenMobileNav: () => void
}

export default function TopBar({ onOpenMobileNav }: TopBarProps) {
  const { t } = useTranslation()

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
