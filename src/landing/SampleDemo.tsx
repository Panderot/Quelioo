import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { CheckIcon, PauseIcon, PlayIcon, RefreshIcon } from '../components/icons'
import { usePrefersReducedMotion } from './hooks'
import { SAMPLES } from './samples'
import type { SampleKey } from './samples'

/** Steps of the story: 1 line 1 lit, 2 line 2 lit + question card, 3 option picked, 4 line 3 lit + statement card, 5 answer picked, 6 rest. */
const LAST_STEP = 6
const STEP_MS = [700, 900, 1100, 1500, 900, 1400, 3200]
const LIT_AT = [1, 2, 4]

interface Props {
  sample: SampleKey
  /** Hero: loops until paused. Try-it: plays once, then offers a replay. */
  loop?: boolean
  /** Waits (false) until the block scrolls into view. */
  active?: boolean
  showStatus?: boolean
}

export default function SampleDemo({ sample, loop = false, active = true, showStatus = false }: Props) {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const meta = SAMPLES[sample]
  const [step, setStep] = useState(LAST_STEP)
  const [hovered, setHovered] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [started, setStarted] = useState(false)
  const paused = hovered || userPaused

  // Server render and no-JS show the finished story; the animation starts from the beginning once mounted.
  useEffect(() => {
    if (!active || reduced) return
    const id = window.setTimeout(() => {
      setStep(0)
      setStarted(true)
    }, 50)
    return () => window.clearTimeout(id)
  }, [active, reduced, sample])

  useEffect(() => {
    if (!started || reduced || paused) return
    if (step === LAST_STEP && !loop) return
    const id = window.setTimeout(() => setStep((s) => (s >= LAST_STEP ? 0 : s + 1)), STEP_MS[step])
    return () => window.clearTimeout(id)
  }, [step, started, reduced, paused, loop])

  const replay = useCallback(() => setStep(0), [])
  const done = step >= LAST_STEP
  const base = `landing.samples.${sample}`
  const options = [t(`${base}.o1a`), t(`${base}.o1b`), t(`${base}.o1c`)]
  const cardClass = 'rounded-2xl border border-warm-border bg-card p-4 shadow-[0_18px_40px_-24px_rgba(20,23,43,0.25)]'

  return (
    <div
      role="group"
      aria-label={t('landing.hero.demoLabel')}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <div className={`${cardClass} sm:p-5`}>
          <p className="mb-3 text-xs font-bold tracking-wide text-amber-text uppercase">{t('landing.hero.textLabel')}</p>
          <div className="space-y-1.5 font-serif text-base leading-7 text-navy sm:text-[17px]">
            {(['l1', 'l2', 'l3'] as const).map((key, i) => (
              <p key={key} className="relative px-1.5">
                <span aria-hidden className="lp-hl" data-on={step >= LIT_AT[i]} />
                <span className="relative">{t(`${base}.${key}`)}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="sr-only">{t('landing.hero.quizLabel')}</p>
          <div className={`lp-card-in ${cardClass}`} data-on={step >= 2}>
            <p className="mb-2 text-xs font-bold tracking-wide text-amber-text uppercase">{t('landing.demo.mcqTag')}</p>
            <p className="mb-3 text-[15px] leading-snug font-semibold text-navy">{t(`${base}.q1`)}</p>
            <ul className="space-y-2">
              {options.map((label, i) => (
                <Option key={i} letter={'ABC'.charAt(i)} label={label} picked={step >= 3 && i === meta.correct} />
              ))}
            </ul>
          </div>
          <div className={`lp-card-in ${cardClass}`} data-on={step >= 4}>
            <p className="mb-2 text-xs font-bold tracking-wide text-amber-text uppercase">{t('landing.demo.tfTag')}</p>
            <p className="mb-3 text-[15px] leading-snug font-semibold text-navy">{t(`${base}.q2`)}</p>
            <ul className="grid grid-cols-2 gap-2">
              <Option label={t('landing.demo.true')} picked={step >= 5 && meta.tf} />
              <Option label={t('landing.demo.false')} picked={step >= 5 && !meta.tf} />
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
        <div aria-live="polite" className="text-sm font-medium text-muted">
          {showStatus && !done && (
            <span className="inline-flex items-center gap-2">
              {t('landing.try.building')}
              <span aria-hidden className="inline-flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="lp-dot h-1.5 w-1.5 rounded-full bg-amber" style={{ '--i': i } as CSSProperties} />
                ))}
              </span>
            </span>
          )}
        </div>
        {loop && !reduced && (
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            aria-pressed={userPaused}
            aria-label={userPaused ? t('landing.hero.play') : t('landing.hero.pause')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-warm-border bg-card text-navy transition-colors hover:bg-paper"
          >
            {userPaused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
          </button>
        )}
        {!loop && done && started && (
          <button
            type="button"
            onClick={replay}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-warm-border bg-card px-4 text-sm font-semibold text-navy transition-colors hover:bg-paper"
          >
            <RefreshIcon className="h-4 w-4" />
            {t('landing.demo.replay')}
          </button>
        )}
      </div>
    </div>
  )
}

/** One answer row; picking it fades a green layer in (opacity only). */
export function Option({ letter, label, picked }: { letter?: string; label: string; picked: boolean }) {
  return (
    <li className="relative flex min-h-11 items-center gap-2.5 rounded-xl border border-warm-border bg-paper px-3 py-2 text-sm font-medium text-navy">
      <span aria-hidden className="lp-ok absolute inset-0 rounded-xl border-2 border-success bg-success/10" data-on={picked} />
      {letter && (
        <span aria-hidden className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-warm-border bg-card text-xs font-bold">
          {letter}
        </span>
      )}
      <span className="relative flex-1">{label}</span>
      <CheckIcon aria-hidden className="lp-ok-icon relative h-4 w-4 shrink-0 text-success" data-on={picked} />
    </li>
  )
}
