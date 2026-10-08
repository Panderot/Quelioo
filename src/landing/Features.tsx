import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CalculatorIcon, CardsIcon, CheckIcon, HeadphonesIcon, MusicNoteIcon, PauseIcon, PlayIcon, QuestionIcon } from '../components/icons'
import { useInView, usePrefersReducedMotion } from './hooks'
import { Option } from './SampleDemo'
import Tabs from './Tabs'

type FeatureId = 'create' | 'solve' | 'cards' | 'songs' | 'lesson'
const FEATURE_ORDER: FeatureId[] = ['create', 'solve', 'cards', 'songs', 'lesson']
const FEATURE_ICONS: Record<FeatureId, ReactNode> = {
  create: <QuestionIcon className="h-4 w-4" />,
  solve: <CalculatorIcon className="h-4 w-4" />,
  cards: <CardsIcon className="h-4 w-4" />,
  songs: <MusicNoteIcon className="h-4 w-4" />,
  lesson: <HeadphonesIcon className="h-4 w-4" />,
}

const cardClass = 'rounded-2xl border border-warm-border bg-card p-4 shadow-[0_18px_40px_-24px_rgba(20,23,43,0.25)]'
const tagClass = 'mb-2 text-xs font-bold tracking-wide text-amber-text uppercase'
const idx = (i: number) => ({ '--i': i }) as CSSProperties

export default function Features() {
  const { t } = useTranslation()
  const [active, setActive] = useState<FeatureId>('create')
  const [stageRef, inView] = useInView<HTMLDivElement>()

  return (
    <section id="features" className="scroll-mt-20 bg-card py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{t('landing.features.title')}</h2>
          <p className="mt-3 text-base text-muted">{t('landing.features.sub')}</p>
        </div>
        <Tabs
          label={t('landing.features.tabsLabel')}
          idPrefix="feat"
          active={active}
          onChange={(id) => setActive(id as FeatureId)}
          items={FEATURE_ORDER.map((id) => ({ id, label: t(`landing.features.tabs.${id}`), icon: FEATURE_ICONS[id] }))}
        />
        <div
          ref={stageRef}
          id="feat-panel"
          role="tabpanel"
          aria-labelledby={`feat-tab-${active}`}
          data-in={inView || undefined}
          className="lp-stage mt-8 grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14"
        >
          <div>
            <h3 className="font-serif text-2xl font-semibold tracking-tight text-navy sm:text-3xl">{t(`landing.features.${active}.title`)}</h3>
            <p className="mt-3 text-base leading-7 text-muted">{t(`landing.features.${active}.body`)}</p>
          </div>
          <div key={active} className="min-w-0 rounded-3xl bg-paper p-4 sm:p-6">
            {active === 'create' && <CreateMock />}
            {active === 'solve' && <SolveMock />}
            {active === 'cards' && <CardsMock inView={inView} />}
            {active === 'songs' && <SongsMock inView={inView} />}
            {active === 'lesson' && <LessonMock inView={inView} />}
          </div>
        </div>
      </div>
    </section>
  )
}

function CreateMock() {
  const { t } = useTranslation()
  const f = 'landing.features.create'
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`lp-rise ${cardClass}`} style={idx(0)}>
        <p className={tagClass}>{t(`${f}.mcq`)}</p>
        <p className="mb-3 text-sm leading-snug font-semibold text-navy">{t(`${f}.mcqQ`)}</p>
        <ul className="space-y-1.5">
          <Option letter="A" label={t(`${f}.mcqA`)} picked={false} />
          <Option letter="B" label={t(`${f}.mcqB`)} picked />
          <Option letter="C" label={t(`${f}.mcqC`)} picked={false} />
        </ul>
      </div>
      <div className="grid gap-3">
        <div className={`lp-rise ${cardClass}`} style={idx(1)}>
          <p className={tagClass}>{t(`${f}.tf`)}</p>
          <p className="mb-3 text-sm leading-snug font-semibold text-navy">{t(`${f}.tfQ`)}</p>
          <ul className="grid grid-cols-2 gap-2">
            <Option label={t('landing.demo.true')} picked={false} />
            <Option label={t('landing.demo.false')} picked />
          </ul>
        </div>
        <div className={`lp-rise ${cardClass}`} style={idx(3)}>
          <p className={tagClass}>{t(`${f}.fill`)}</p>
          <p className="text-sm leading-8 font-semibold text-navy">
            {t(`${f}.fillQ`, { blank: '\u0000' })
              .split('\u0000')
              .map((part, i, all) => (
                <span key={i}>
                  {part}
                  {i < all.length - 1 && (
                    <span className="mx-1 inline-block min-w-20 border-b-2 border-success px-2 text-center text-success">{t(`${f}.fillA`)}</span>
                  )}
                </span>
              ))}
          </p>
        </div>
      </div>
      <div className={`lp-rise ${cardClass} sm:col-span-2`} style={idx(2)}>
        <p className={tagClass}>{t(`${f}.matching`)}</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {(['1', '2', '3'] as const).map((n, i) => (
            <div key={n} className="contents">
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-warm-border bg-paper px-3 text-sm font-medium text-navy">
                <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-paper">
                  {n}
                </span>
                {t(`${f}.m${n}`)}
              </div>
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-warm-border bg-paper px-3 text-sm font-medium text-navy">
                <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">
                  {'BCA'.charAt(i)}
                </span>
                {t(`${f}.m${'bca'.charAt(i)}`)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** KaTeX is loaded only when the visitor opens the Solve tab; until then the formula shows as plain text. */
function Tex({ src }: { src: string }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    void import('katex').then((mod) => {
      if (on) setHtml(mod.default.renderToString(src, { throwOnError: false }))
    })
    return () => {
      on = false
    }
  }, [src])
  return html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{src}</span>
}

function SolveMock() {
  const { t } = useTranslation()
  const f = 'landing.features.solve'
  const steps: Array<{ text: string; tex: string }> = [
    { text: t(`${f}.step1`), tex: '2x + 6 - 6 = 14 - 6 \\Rightarrow 2x = 8' },
    { text: t(`${f}.step2`), tex: '\\dfrac{2x}{2} = \\dfrac{8}{2} \\Rightarrow x = 4' },
    { text: t(`${f}.step3`), tex: '2\\cdot 4 + 6 = 14 \\;\\checkmark' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className={`lp-rise ${cardClass}`} style={idx(0)}>
        <p className={tagClass}>{t(`${f}.photoLabel`)}</p>
        <div className="relative h-40 overflow-hidden rounded-xl border border-warm-border bg-[repeating-linear-gradient(0deg,transparent_0_23px,rgba(14,19,48,0.08)_23px_24px)] p-4">
          <p className="-rotate-1 font-serif text-lg leading-8 text-navy italic">{t(`${f}.question`)}</p>
          <span aria-hidden className="lp-scan absolute inset-x-0 top-2 h-0.5 bg-amber shadow-[0_0_12px_rgba(245,165,36,0.9)]" />
          {['left-2 top-2 border-l-2 border-t-2', 'right-2 top-2 border-r-2 border-t-2', 'left-2 bottom-2 border-l-2 border-b-2', 'right-2 bottom-2 border-r-2 border-b-2'].map((c) => (
            <span key={c} aria-hidden className={`absolute h-4 w-4 border-navy ${c}`} />
          ))}
        </div>
      </div>
      <div className={`${cardClass}`}>
        <p className={tagClass}>{t(`${f}.stepsLabel`)}</p>
        <ol className="space-y-2.5">
          {steps.map((step, i) => (
            <li key={i} className="lp-rise flex gap-3" style={idx(i + 1)}>
              <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-paper">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted">{step.text}</p>
                <p className="overflow-x-auto text-base text-navy">
                  <Tex src={step.tex} />
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="lp-rise mt-3 inline-flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm font-bold text-success" style={idx(5)}>
          <CheckIcon className="h-4 w-4" />
          {t(`${f}.answer`)}: <Tex src="x = 4" />
        </p>
      </div>
    </div>
  )
}

function CardsMock({ inView }: { inView: boolean }) {
  const { t } = useTranslation()
  const f = 'landing.features.cards'
  const [card, setCard] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [touched, setTouched] = useState(false)
  const [counts, setCounts] = useState({ fresh: 5, learning: 4, learned: 3 })
  const reduced = usePrefersReducedMotion()

  // A hint of life before the visitor touches anything: the first card flips by itself once.
  useEffect(() => {
    if (!inView || touched || reduced) return
    const id = window.setTimeout(() => setFlipped(true), 1800)
    return () => window.clearTimeout(id)
  }, [inView, touched, reduced])

  const total = counts.fresh + counts.learning + counts.learned
  const next = (known: boolean) => {
    setTouched(true)
    setFlipped(false)
    setCounts((c) => {
      const fromFresh = c.fresh > 0
      if (known) return fromFresh ? { ...c, fresh: c.fresh - 1, learned: c.learned + 1 } : c.learning > 0 ? { ...c, learning: c.learning - 1, learned: c.learned + 1 } : c
      return fromFresh ? { ...c, fresh: c.fresh - 1, learning: c.learning + 1 } : c
    })
    setCard((c) => (c + 1) % 3)
  }
  const n = card + 1

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flashcard-scene h-44">
        <button
          type="button"
          onClick={() => {
            setTouched(true)
            setFlipped((v) => !v)
          }}
          aria-pressed={flipped}
          className="flashcard-inner w-full cursor-pointer rounded-2xl text-left"
          data-flipped={flipped}
        >
          <span
            aria-hidden={flipped}
            className="flashcard-face flashcard-front flex flex-col justify-between rounded-2xl border border-warm-border bg-card p-5 shadow-[0_18px_40px_-24px_rgba(20,23,43,0.25)]"
          >
            <span className="font-serif text-xl leading-snug font-semibold text-navy">{t(`${f}.q${n}`)}</span>
            <span className="text-xs font-semibold text-amber-text">{t(`${f}.tapHint`)}</span>
          </span>
          <span
            aria-hidden={!flipped}
            className="flashcard-face flashcard-back flex items-center rounded-2xl border border-navy bg-navy p-5 shadow-[0_18px_40px_-24px_rgba(20,23,43,0.45)]"
          >
            <span className="font-serif text-xl leading-snug font-semibold text-paper">{t(`${f}.a${n}`)}</span>
          </span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => next(false)} className="min-h-11 rounded-xl border border-warm-border bg-card px-3 text-sm font-semibold text-navy transition-colors hover:bg-paper">
          {t(`${f}.again`)}
        </button>
        <button type="button" onClick={() => next(true)} className="min-h-11 rounded-xl bg-amber px-3 text-sm font-bold text-navy transition-colors hover:bg-amber-hover">
          {t(`${f}.known`)}
        </button>
      </div>
      <div className={cardClass}>
        <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t(`${f}.progress`)}</p>
        <div className="flex h-2.5 gap-1" aria-hidden>
          <span className="rounded-full bg-warm-border" style={{ flex: counts.fresh, minWidth: counts.fresh ? 6 : 0 }} />
          <span className="rounded-full bg-amber" style={{ flex: counts.learning, minWidth: counts.learning ? 6 : 0 }} />
          <span className="rounded-full bg-success" style={{ flex: counts.learned, minWidth: counts.learned ? 6 : 0 }} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
          {(
            [
              ['new', counts.fresh],
              ['learning', counts.learning],
              ['learned', counts.learned],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt>{t(`${f}.${key}`)}</dt>
              <dd className="text-lg font-bold text-navy">
                {value}
                <span className="sr-only"> / {total}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function SongsMock({ inView }: { inView: boolean }) {
  const { t } = useTranslation()
  const f = 'landing.features.songs'
  const reduced = usePrefersReducedMotion()
  const [playing, setPlaying] = useState(false)
  const [line, setLine] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (inView && !started.current && !reduced) {
      started.current = true
      setPlaying(true)
    }
  }, [inView, reduced])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setLine((l) => (l + 1) % 4), 2200)
    return () => window.clearInterval(id)
  }, [playing])

  return (
    <div className={`mx-auto max-w-md ${cardClass} sm:p-5`}>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? t(`${f}.pause`) : t(`${f}.play`)}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-navy transition-colors hover:bg-amber-hover"
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-semibold text-navy">{t(`${f}.songTitle`)}</p>
          <p className="text-xs text-muted">{t(`${f}.hint`)}</p>
        </div>
      </div>
      <div data-playing={playing} aria-hidden className="mb-4 flex h-14 items-center gap-[3px]">
        {Array.from({ length: 36 }, (_, i) => {
          const h = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45))
          return <span key={i} className="lp-bar h-full flex-1 rounded-full bg-navy/80" style={{ '--i': i, '--h': h.toFixed(2) } as CSSProperties} />
        })}
      </div>
      <ol className="space-y-1.5">
        {(['l1', 'l2', 'l3', 'l4'] as const).map((key, i) => (
          <li key={key} className="relative rounded-lg px-3 py-2 font-serif text-base text-navy transition-opacity duration-500" style={{ opacity: i === line ? 1 : 0.45 }}>
            <span aria-hidden className="absolute inset-0 rounded-lg bg-amber/25 transition-opacity duration-500" style={{ opacity: i === line ? 1 : 0 }} />
            <span className="relative">{t(`${f}.${key}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Lines of the pre-made excerpt and when each starts in /landing/lesson-sample.mp3 (seconds). */
const LESSON_STARTS = [0.3, 6.3, 10.8]
const LESSON_HOST = ['hostA', 'hostA', 'hostB'] as const

function LessonMock({ inView }: { inView: boolean }) {
  const { t, i18n } = useTranslation()
  const f = 'landing.features.lesson'
  const reduced = usePrefersReducedMotion()
  const hasAudio = (i18n.resolvedLanguage ?? i18n.language) === 'tr'
  const [playing, setPlaying] = useState(false)
  const [line, setLine] = useState(0)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const started = useRef(false)

  const stopAudio = () => {
    audioRef.current?.pause()
    audioRef.current = null
  }
  useEffect(() => stopAudio, [])

  // Without sound (other languages, or before the visitor taps) the lines still take turns on a timer.
  useEffect(() => {
    if (inView && !started.current && !reduced && !hasAudio) {
      started.current = true
      setPlaying(true)
    }
  }, [inView, reduced, hasAudio])
  useEffect(() => {
    if (!playing || hasAudio) return
    const id = window.setInterval(() => setLine((l) => (l + 1) % 3), 2600)
    return () => window.clearInterval(id)
  }, [playing, hasAudio])

  const toggle = () => {
    if (!hasAudio) {
      setPlaying((p) => !p)
      return
    }
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    if (!audioRef.current) {
      // The clip is fetched only now, on tap.
      const audio = new Audio('/landing/lesson-sample.mp3')
      audio.preload = 'auto'
      audio.addEventListener('timeupdate', () => {
        const time = audio.currentTime
        setLine(LESSON_STARTS.reduce((acc, start, i) => (time >= start ? i : acc), 0))
        setProgress(audio.duration ? time / audio.duration : 0)
      })
      audio.addEventListener('ended', () => {
        setPlaying(false)
        setLine(0)
        setProgress(0)
        audioRef.current = null
      })
      audioRef.current = audio
    }
    void audioRef.current.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    )
  }

  return (
    <div className={`mx-auto max-w-md ${cardClass} sm:p-5`}>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t(`${f}.pause`) : t(`${f}.play`)}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-navy transition-colors hover:bg-amber-hover"
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{t(`${f}.hint`)}</p>
          <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-warm-border">
            <div className="h-full origin-left rounded-full bg-navy" style={{ transform: `scaleX(${progress})`, transition: 'transform 250ms linear' }} />
          </div>
        </div>
      </div>
      <ol className="space-y-2">
        {(['l1', 'l2', 'l3'] as const).map((key, i) => {
          const host = LESSON_HOST[i]
          const speaking = i === line
          return (
            <li key={key} className="relative flex gap-3 rounded-xl px-3 py-2.5 transition-opacity duration-500" style={{ opacity: speaking ? 1 : 0.5 }}>
              <span aria-hidden className="absolute inset-0 rounded-xl bg-amber/25 transition-opacity duration-500" style={{ opacity: speaking ? 1 : 0 }} />
              <span className={`relative mt-0.5 h-6 shrink-0 rounded-full px-2 text-xs leading-6 font-bold ${host === 'hostA' ? 'bg-navy text-paper' : 'bg-amber text-navy'}`}>{t(`${f}.${host}`)}</span>
              <span className="relative text-sm leading-6 text-navy">{t(`${f}.${key}`)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
