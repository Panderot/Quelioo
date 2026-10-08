import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import LanguageSwitcher from '../components/LanguageSwitcher'
import { LogoMark } from '../components/Logo'
import Features from './Features'
import SampleDemo from './SampleDemo'
import { AudienceSection, CtaBand, FaqSection, HowSection, PlansSection, TrySection } from './Sections'
import { startButtonClass } from './ui'
import './landing.css'

export type LandingLanguage = 'en' | 'hyw'

const APP_TITLE = 'Quelio - AI Quiz Generator'

/** The public home page: what Quelio does, shown with pre-made content. It never calls an API. */
export default function Landing({ language, prerendered = false }: { language?: LandingLanguage; prerendered?: boolean }) {
  const { t, i18n } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)

  // /en and /hyw are fixed-language copies of the page (the same ones search engines see).
  useEffect(() => {
    if (language && i18n.resolvedLanguage !== language) void i18n.changeLanguage(language)
  }, [language, i18n])

  // Motion styles apply only once this effect runs, so the page is complete without JavaScript.
  useEffect(() => {
    rootRef.current?.classList.add('lp-js')
  }, [])

  useEffect(() => {
    document.title = t('landing.meta.title')
    return () => {
      document.title = APP_TITLE
    }
  }, [t, i18n.resolvedLanguage])

  return (
    <div
      ref={rootRef}
      className="lp-root min-h-screen bg-paper text-navy"
      {...(prerendered ? { 'data-landing-static': '', 'data-lang': i18n.resolvedLanguage } : {})}
    >
      <a href="#main" className="sr-only z-50 rounded-lg bg-navy px-4 py-3 font-semibold text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t('landing.skip')}
      </a>

      <header className="sticky top-0 z-40 border-b border-warm-border/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <a href="/" className="flex min-h-11 items-center gap-2.5" aria-label={t('landing.nav.home')}>
            <LogoMark className="h-8 w-8 shrink-0" tone="onLight" />
            <span className="font-serif text-2xl font-semibold tracking-tight text-navy">{t('app.name')}</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-3" aria-label={t('landing.nav.home')}>
            <LanguageSwitcher syncProfile={false} tall />
            <a href="/sign-in" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-navy transition-colors hover:bg-card">
              {t('landing.nav.signIn')}
            </a>
            <a href="/sign-up" className="hidden min-h-11 items-center rounded-xl bg-navy px-4 text-sm font-bold text-paper transition-colors hover:bg-ink sm:inline-flex">
              {t('landing.nav.start')}
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24">
          <div aria-hidden className="pointer-events-none absolute -top-24 right-[-10%] h-[520px] w-[520px] bg-[radial-gradient(circle,rgba(245,165,36,0.22)_0%,rgba(245,165,36,0)_68%)]" />
          <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber/50 bg-amber/15 px-4 py-1.5 text-sm font-bold text-amber-text">
                <span aria-hidden className="h-2 w-2 rounded-full bg-amber" />
                {t('app.tagline')}
              </p>
              <h1 id="hero-title" className="font-serif text-4xl leading-[1.1] font-semibold tracking-tight text-navy sm:text-6xl">
                {t('landing.hero.title')}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted">{t('landing.hero.sub')}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href="/sign-up" className={`${startButtonClass} w-full sm:w-auto`}>
                  {t('landing.hero.start')}
                </a>
                <a
                  href="#how"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-[14px] border border-warm-border bg-card px-6 text-base font-semibold text-navy transition-colors hover:bg-paper sm:w-auto"
                >
                  {t('landing.hero.how')}
                </a>
              </div>
              <p className="mt-4 text-sm font-medium text-muted">{t('landing.hero.note')}</p>
            </div>
            <div className="mx-auto mt-12 max-w-4xl">
              <SampleDemo sample="photo" loop />
            </div>
          </div>
        </section>

        <HowSection />
        <Features />
        <AudienceSection />
        <TrySection />
        <PlansSection />
        <FaqSection />
        <CtaBand />
      </main>

      <footer className="border-t border-warm-border bg-paper py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-serif text-xl font-semibold text-navy">
              <LogoMark className="h-7 w-7" tone="onLight" />
              {t('app.name')}
            </p>
            <p className="text-sm text-muted">{t('landing.footer.by')}</p>
            <a href="mailto:info@motiqai.com" className="inline-flex min-h-11 items-center text-sm font-semibold text-amber-text underline underline-offset-4">
              {t('landing.footer.email')}
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="/gizlilik" className="inline-flex min-h-11 items-center text-sm font-medium text-navy hover:underline">
              {t('landing.footer.privacy')}
            </a>
            <a href="/kullanim-sartlari" className="inline-flex min-h-11 items-center text-sm font-medium text-navy hover:underline">
              {t('landing.footer.terms')}
            </a>
            <LanguageSwitcher placement="up" syncProfile={false} tall />
          </div>
        </div>
      </footer>
    </div>
  )
}
