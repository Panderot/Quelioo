import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LanguageSwitcher from '../LanguageSwitcher'
import { LogoMark } from '../Logo'
import RateLimitNotice from '../RateLimitNotice'
import SupportNote from '../SupportNote'

/** Public pages (sign in, sign up, passwords, legal): centered card on paper, no sidebar. */
export default function AuthLayout() {
  const { t } = useTranslation()
  return (
    <div data-purpose="auth-layout" className="relative flex min-h-screen flex-col overflow-hidden bg-paper">
      <div
        className="pointer-events-none absolute top-0 right-0 h-[480px] w-[480px] bg-[radial-gradient(circle,rgba(245,165,36,0.08)_0%,rgba(245,165,36,0)_70%)]"
        aria-hidden
      />
      <header className="relative flex h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link to="/sign-in" className="flex items-center gap-2.5" aria-label={t('app.name')}>
          <LogoMark className="h-8 w-8 shrink-0" tone="onLight" />
          <span className="font-serif text-2xl font-semibold tracking-tight text-navy">{t('app.name')}</span>
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="animate-fade-in relative mx-auto flex w-full flex-1 items-start justify-center px-4 pt-4 pb-12 sm:px-6 sm:pt-10">
        <div className="w-full">
          <Outlet />
        </div>
      </main>
      <footer className="relative px-4 pb-8 text-center">
        <SupportNote />
      </footer>
      <RateLimitNotice />
    </div>
  )
}

/** The card every auth page sits in; `wide` is for the legal text pages. */
export function AuthCard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div data-purpose="auth-card" className={`mx-auto w-full space-y-6 rounded-2xl border border-warm-border bg-card p-6 sm:p-8 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
      {children}
    </div>
  )
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-2">
      <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy">{title}</h1>
      {subtitle && <p className="text-sm font-normal text-muted">{subtitle}</p>}
    </div>
  )
}
