import { useTranslation } from 'react-i18next'

import LanguageSwitcher from './LanguageSwitcher'
import SyncStatus from './SyncStatus'
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
        <SyncStatus />
        <LanguageSwitcher />
      </div>
    </header>
  )
}
