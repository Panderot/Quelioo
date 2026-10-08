import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { BookIcon, CardsIcon, CheckIcon, ChevronDownIcon, FileTabIcon, HeadphonesIcon, MusicNoteIcon, QuestionIcon, TextTabIcon, UrlTabIcon } from '../components/icons'
import { useInView } from './hooks'
import SampleDemo, { Option } from './SampleDemo'
import { TRY_SAMPLES } from './samples'
import type { SampleKey } from './samples'
import Tabs from './Tabs'
import { FAQ_KEYS, startButtonClass } from './ui'

const cardClass = 'rounded-2xl border border-warm-border bg-card p-4 shadow-[0_18px_40px_-24px_rgba(20,23,43,0.25)]'
const idx = (i: number) => ({ '--i': i }) as CSSProperties

/** Fades and lifts its children in the first time they scroll into view (transform and opacity only). */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} data-in={inView || undefined} className={`lp-reveal ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  )
}

function SectionHead({ title, sub, id }: { title: string; sub?: string; id?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 id={id} className="font-serif text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 text-base text-muted">{sub}</p>}
    </div>
  )
}

export function HowSection() {
  const { t } = useTranslation()
  const [ref, inView] = useInView<HTMLDivElement>()
  const chip = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-warm-border bg-paper px-3 text-sm font-semibold text-navy'
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHead id="how-title" title={t('landing.how.title')} sub={t('landing.how.sub')} />
        <div ref={ref} data-in={inView || undefined} className="lp-stage grid gap-5 md:grid-cols-3">
          {[1, 2, 3].map((n, i) => (
            <Reveal key={n} delay={i * 140} className="relative">
              <article className={`${cardClass} h-full p-5 sm:p-6`}>
                <p className="mb-4 flex items-center gap-3 text-xs font-bold tracking-wide text-amber-text uppercase">
                  <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-navy font-serif text-base text-paper normal-case">
                    {n}
                  </span>
                  {t('landing.how.step', { n })}
                </p>
                <div className="mb-5 flex min-h-24 flex-wrap content-center items-center gap-2 rounded-xl bg-paper p-3" aria-hidden>
                  {n === 1 && (
                    <>
                      <span className={`lp-rise ${chip}`} style={idx(0)}><TextTabIcon className="h-4 w-4" />{t('landing.how.s1.chipText')}</span>
                      <span className={`lp-rise ${chip}`} style={idx(1)}><FileTabIcon className="h-4 w-4" />{t('landing.how.s1.chipPdf')}</span>
                      <span className={`lp-rise ${chip}`} style={idx(2)}><UrlTabIcon className="h-4 w-4" />{t('landing.how.s1.chipLink')}</span>
                    </>
                  )}
                  {n === 2 && (
                    <div className="w-full space-y-2">
                      {[88, 100, 64].map((w, k) => (
                        <div key={k} className="relative h-3 overflow-hidden rounded-full bg-warm-border" style={{ width: `${w}%` }}>
                          <span className="lp-rise absolute inset-y-0 left-0 w-1/2 rounded-full bg-amber" style={{ ...idx(k + 1), width: k === 1 ? '70%' : '40%' }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {n === 3 && (
                    <>
                      <span className={`lp-rise ${chip}`} style={idx(0)}><QuestionIcon className="h-4 w-4" />{t('landing.how.s3.quiz')}</span>
                      <span className={`lp-rise ${chip}`} style={idx(1)}><CardsIcon className="h-4 w-4" />{t('landing.how.s3.cards')}</span>
                      <span className={`lp-rise ${chip}`} style={idx(2)}><MusicNoteIcon className="h-4 w-4" />{t('landing.how.s3.song')}</span>
                      <span className={`lp-rise ${chip}`} style={idx(3)}><HeadphonesIcon className="h-4 w-4" />{t('landing.how.s3.lesson')}</span>
                    </>
                  )}
                </div>
                <h3 className="font-serif text-xl font-semibold text-navy">{t(`landing.how.s${n}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{t(`landing.how.s${n}.body`)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

type AudienceId = 'school' | 'university' | 'exam' | 'teacher'
const AUDIENCES: AudienceId[] = ['school', 'university', 'exam', 'teacher']

export function AudienceSection() {
  const { t } = useTranslation()
  const [active, setActive] = useState<AudienceId>('school')
  const [ref, inView] = useInView<HTMLDivElement>()
  const f = `landing.audiences.${active}`
  return (
    <section id="audiences" aria-labelledby="aud-title" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHead id="aud-title" title={t('landing.audiences.title')} sub={t('landing.audiences.sub')} />
        <Tabs
          label={t('landing.audiences.tabsLabel')}
          idPrefix="aud"
          active={active}
          onChange={(id) => setActive(id as AudienceId)}
          items={AUDIENCES.map((id) => ({ id, label: t(`landing.audiences.${id}.tab`) }))}
        />
        <div
          ref={ref}
          id="aud-panel"
          role="tabpanel"
          aria-labelledby={`aud-tab-${active}`}
          data-in={inView || undefined}
          className="lp-stage mt-8 grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
        >
          <div>
            <h3 className="font-serif text-2xl font-semibold tracking-tight text-navy sm:text-3xl">{t(`${f}.title`)}</h3>
            <p className="mt-3 text-base leading-7 text-muted">{t(`${f}.body`)}</p>
          </div>
          <div key={active} className="min-w-0 rounded-3xl bg-card p-4 sm:p-6">
            {active === 'school' && <SchoolVisual />}
            {active === 'university' && <UniversityVisual />}
            {active === 'exam' && <ExamVisual />}
            {active === 'teacher' && <TeacherVisual />}
          </div>
        </div>
      </div>
    </section>
  )
}

function SchoolVisual() {
  const { t } = useTranslation()
  return (
    <div className={`lp-rise mx-auto max-w-md ${cardClass}`}>
      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>{t('landing.audiences.school.progress')}</span>
      </div>
      <div aria-hidden className="mb-4 h-1.5 overflow-hidden rounded-full bg-warm-border">
        <div className="h-full w-full origin-left rounded-full bg-amber" style={{ transform: 'scaleX(0.7)' }} />
      </div>
      <p className="mb-3 text-[15px] leading-snug font-semibold text-navy">{t('landing.samples.photo.q1')}</p>
      <ul className="space-y-2">
        <Option letter="A" label={t('landing.samples.photo.o1a')} picked={false} />
        <Option letter="B" label={t('landing.samples.photo.o1b')} picked />
        <Option letter="C" label={t('landing.samples.photo.o1c')} picked={false} />
      </ul>
    </div>
  )
}

function UniversityVisual() {
  const { t } = useTranslation()
  const f = 'landing.audiences.university'
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4">
      <div className={`lp-rise flex w-full items-center gap-3 ${cardClass}`} style={idx(0)}>
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error">
          <FileTabIcon className="h-6 w-6" />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-navy">{t(`${f}.file`)}</span>
      </div>
      <span aria-hidden className="lp-float text-amber-text">↓</span>
      <div className="flex w-full flex-wrap justify-center gap-2">
        {(['c1', 'c2', 'c3'] as const).map((k, i) => (
          <span key={k} className="lp-rise inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber/15 px-4 text-sm font-semibold text-navy" style={idx(i + 1)}>
            <CheckIcon className="h-4 w-4 text-amber-text" />
            {t(`${f}.${k}`)}
          </span>
        ))}
      </div>
    </div>
  )
}

function ExamVisual() {
  const { t } = useTranslation()
  const f = 'landing.audiences.exam'
  return (
    <div className="mx-auto max-w-md">
      <div className="relative pb-6">
        <span aria-hidden className="absolute inset-x-6 top-4 bottom-0 rounded-2xl border border-warm-border bg-paper" />
        <span aria-hidden className="absolute inset-x-3 top-2 bottom-3 rounded-2xl border border-warm-border bg-paper" />
        <div className={`lp-rise relative flex min-h-44 flex-col justify-between ${cardClass} p-5`}>
          <span className="font-serif text-xl leading-snug font-semibold text-navy">{t(`${f}.front`)}</span>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-navy px-3 py-1 text-sm font-bold text-paper">{t(`${f}.back`)}</span>
        </div>
      </div>
      <p className="text-center text-sm font-bold text-amber-text">{t(`${f}.due`)}</p>
    </div>
  )
}

function TeacherVisual() {
  const { t } = useTranslation()
  const f = 'landing.audiences.teacher'
  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className={`lp-rise ${cardClass}`}>
        <p className="mb-3 font-serif text-lg font-semibold text-navy">{t(`${f}.sheet`)}</p>
        <div aria-hidden className="space-y-2.5">
          {[92, 100, 76, 88].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-5 w-5 shrink-0 rounded-full bg-navy text-center text-[11px] leading-5 font-bold text-paper">{i + 1}</span>
              <span className="h-2.5 rounded-full bg-warm-border" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="lp-rise flex flex-wrap gap-2" style={idx(1)}>
        <span className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 text-sm font-semibold text-paper">{t(`${f}.print`)}</span>
        <span className="inline-flex min-h-11 items-center rounded-xl border border-warm-border bg-paper px-4 text-sm font-semibold text-navy">{t(`${f}.copy`)}</span>
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-success bg-success/10 px-4 text-sm font-semibold text-success">
          <CheckIcon className="h-4 w-4" />
          {t(`${f}.key`)}
        </span>
      </div>
    </div>
  )
}

export function TrySection() {
  const { t } = useTranslation()
  const [sample, setSample] = useState<SampleKey>('science')
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <section id="try" aria-labelledby="try-title" className="scroll-mt-20 bg-card py-16 sm:py-24">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <SectionHead id="try-title" title={t('landing.try.title')} sub={t('landing.try.sub')} />
        <Tabs
          label={t('landing.try.pickLabel')}
          idPrefix="try"
          active={sample}
          onChange={(id) => setSample(id as SampleKey)}
          items={TRY_SAMPLES.map((id) => ({ id, label: t(`landing.samples.${id}.name`) }))}
        />
        <div ref={ref} id="try-panel" role="tabpanel" aria-labelledby={`try-tab-${sample}`} className="mt-8 rounded-3xl bg-paper p-3 sm:p-6">
          <SampleDemo key={sample} sample={sample} active={inView} showStatus />
        </div>
        <div className="mt-8 text-center">
          <a href="/sign-up" className={startButtonClass}>
            {t('landing.try.cta')}
          </a>
        </div>
      </div>
    </section>
  )
}

export function PlansSection() {
  const { t } = useTranslation()
  const plans = [
    { id: 'free', features: ['f1', 'f2', 'f3', 'f4'] },
    { id: 'pro', features: ['f1', 'f2', 'f3'] },
  ] as const
  return (
    <section id="plans" aria-labelledby="plans-title" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <SectionHead id="plans-title" title={t('landing.plans.title')} sub={t('landing.plans.sub')} />
        <div className="grid gap-5 md:grid-cols-2">
          {plans.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 140}>
              <article className={`flex h-full flex-col rounded-2xl border p-6 ${plan.id === 'pro' ? 'border-navy bg-navy text-paper' : 'border-warm-border bg-card text-navy'}`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-serif text-2xl font-semibold">{t(`landing.plans.${plan.id}.name`)}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${plan.id === 'pro' ? 'bg-amber text-navy' : 'bg-amber/20 text-amber-text'}`}>{t('landing.plans.badge')}</span>
                </div>
                <p className={`mb-5 text-sm ${plan.id === 'pro' ? 'text-paper/80' : 'text-muted'}`}>{t(`landing.plans.${plan.id}.desc`)}</p>
                <ul className="mb-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3 text-sm leading-6">
                      <CheckIcon className={`mt-1 h-4 w-4 shrink-0 ${plan.id === 'pro' ? 'text-amber' : 'text-success'}`} />
                      {t(`landing.plans.${plan.id}.${f}`)}
                    </li>
                  ))}
                </ul>
                <a href="/sign-up" className={`${startButtonClass} w-full`}>
                  {t('landing.plans.start')}
                </a>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FaqSection() {
  const { t } = useTranslation()
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-card py-16 sm:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionHead id="faq-title" title={t('landing.faq.title')} />
        <div className="space-y-3">
          {FAQ_KEYS.map((key) => (
            <details key={key} className="lp-faq rounded-2xl border border-warm-border bg-paper">
              <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl px-5 py-3 text-base font-semibold text-navy">
                {t(`landing.faq.${key}.q`)}
                <ChevronDownIcon aria-hidden className="lp-faq-chev h-5 w-5 shrink-0 text-muted" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-7 text-muted">{t(`landing.faq.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaBand() {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="cta-title" className="bg-navy py-16 text-paper sm:py-20">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 text-center sm:px-6">
        <BookIcon aria-hidden className="mb-5 h-8 w-8 text-amber" />
        <h2 id="cta-title" className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('landing.cta.title')}
        </h2>
        <p className="mt-3 text-base text-paper/80">{t('landing.cta.sub')}</p>
        <a href="/sign-up" className={`${startButtonClass} mt-8`}>
          {t('landing.cta.button')}
        </a>
      </div>
    </section>
  )
}
