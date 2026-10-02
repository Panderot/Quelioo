import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { generateCards } from '../../api/cards'
import type { CardsErrorCode } from '../../api/cards'
import { SolveExtraApiError } from '../../api/postJson'
import { CARD_LEVELS, CARD_STYLES, DEFAULT_CARD_COUNT, MAX_AVOID_FRONTS, MAX_TOPIC_CHARS } from '../../lib/cardGeneration'
import type { CardLevel, CardStyle } from '../../lib/cardGeneration'
import { MAX_QUIZ_WORDS, MIN_QUIZ_WORDS, countWords } from '../../lib/textStats'
import OutputLanguageSelect from '../OutputLanguageSelect'
import Select from '../Select'
import { SpinnerIcon, SunIcon } from '../icons'
import CardReviewList from './CardReviewList'
import { selectedCards, toReviewCards } from '../../lib/cardReview'
import type { ReviewCard } from '../../lib/cardReview'

type Mode = 'text' | 'topic'
const MODES: Mode[] = ['text', 'topic']
const COUNT_OPTIONS = [5, 10, 15, 20, 25, 30]

interface CardGeneratorPanelProps {
  /** Fronts already in the deck — sent as the avoid list and used to flag duplicates. */
  deckFronts: string[]
  /** Solid amber only when generating is the screen's main action (an empty new deck). */
  emphasis: 'primary' | 'secondary'
  onAdd: (cards: { front: string; back: string }[]) => void
}

const fieldLabel = 'text-[11px] font-bold tracking-wide text-muted uppercase'
const inputClass = 'w-full rounded-xl border border-warm-border bg-paper px-3 py-2 text-sm text-ink hover:border-focus-neutral'

/** "Generate cards with AI": Text/Topic tabs, options, then a review list — nothing is saved until "Add". */
export default function CardGeneratorPanel({ deckFronts, emphasis, onAdd }: CardGeneratorPanelProps) {
  const { t, i18n } = useTranslation()
  const uid = useId()
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<CardLevel>('general')
  const [count, setCount] = useState(DEFAULT_CARD_COUNT)
  const [style, setStyle] = useState<CardStyle>('term')
  const [language, setLanguage] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<CardsErrorCode | null>(null)
  const [review, setReview] = useState<ReviewCard[] | null>(null)
  const [removed, setRemoved] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ text: null, topic: null })

  useEffect(() => () => abortRef.current?.abort(), [])

  const words = useMemo(() => countWords(text), [text])
  const numberLocale = i18n.language === 'tr' ? 'tr' : 'en'
  const textValid = words >= MIN_QUIZ_WORDS && words <= MAX_QUIZ_WORDS
  const topicValid = topic.trim().length > 0 && topic.trim().length <= MAX_TOPIC_CHARS
  const canGenerate = !loading && (mode === 'text' ? textValid : topicValid)

  const selected = selectedCards(review ?? [])

  const generate = async () => {
    if (!canGenerate) return
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setReview(null)
    try {
      const result = await generateCards(
        {
          mode,
          ...(mode === 'text' ? { text } : { topic: topic.trim(), level }),
          count,
          style,
          language,
          avoid: deckFronts.map((front) => front.trim()).filter(Boolean).slice(-MAX_AVOID_FRONTS),
        },
        controller.signal,
      )
      setReview(toReviewCards(result.cards))
      setRemoved(result.removed)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof SolveExtraApiError ? (caught.code as CardsErrorCode) : 'upstream')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setLoading(false)
      }
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }

  const handleAdd = () => {
    onAdd(selected)
    setReview(null)
    setRemoved(0)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, Mode> = { ArrowLeft: 'text', Home: 'text', ArrowRight: 'topic', End: 'topic' }
    const next = keys[event.key]
    if (!next) return
    event.preventDefault()
    setMode(next)
    tabRefs.current[next]?.focus()
  }

  const generateClass =
    emphasis === 'primary'
      ? 'bg-amber text-navy shadow-sm hover:bg-amber-hover'
      : 'border-2 border-navy text-navy hover:bg-navy/5'

  return (
    <section data-purpose="card-generator" aria-labelledby={`${uid}-title`} className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5">
      <h2 id={`${uid}-title`} className="font-serif text-lg font-semibold text-navy">
        {t('flashcards.generate.title')}
      </h2>

      <div role="tablist" aria-label={t('flashcards.generate.title')} className="flex gap-2 border-b border-warm-border">
        {MODES.map((tab) => (
          <button
            key={tab}
            ref={(element) => {
              tabRefs.current[tab] = element
            }}
            id={`${uid}-tab-${tab}`}
            role="tab"
            type="button"
            aria-selected={mode === tab}
            aria-controls={`${uid}-panel`}
            tabIndex={mode === tab ? 0 : -1}
            onClick={() => setMode(tab)}
            onKeyDown={handleTabKeyDown}
            disabled={loading}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
              mode === tab ? 'border-amber font-bold text-ink' : 'border-transparent font-semibold text-muted hover:text-ink'
            }`}
          >
            {t(`flashcards.generate.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${mode}`} className="space-y-4">
        {mode === 'text' ? (
          <label className="block space-y-1">
            <span className={fieldLabel}>{t('flashcards.generate.textLabel')}</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              placeholder={t('flashcards.generate.textPlaceholder')}
              data-purpose="generator-text"
              aria-describedby={`${uid}-words`}
              className={`${inputClass} resize-y`}
            />
            <span id={`${uid}-words`} className={`block text-xs ${words > MAX_QUIZ_WORDS ? 'font-semibold text-error' : 'text-muted'}`}>
              {t('flashcards.generate.wordCount', { words: words.toLocaleString(numberLocale), max: MAX_QUIZ_WORDS.toLocaleString(numberLocale) })}
              {text.trim() !== '' && words < MIN_QUIZ_WORDS && ` · ${t('flashcards.generate.minWords', { count: MIN_QUIZ_WORDS })}`}
            </span>
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="block space-y-1">
              <span className={fieldLabel}>{t('flashcards.generate.topicLabel')}</span>
              <input
                type="text"
                value={topic}
                maxLength={MAX_TOPIC_CHARS}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={t('flashcards.generate.topicPlaceholder')}
                data-purpose="generator-topic"
                className={inputClass}
              />
              <span className="block text-xs text-muted">
                {topic.length}/{MAX_TOPIC_CHARS}
              </span>
            </label>
            <div className="space-y-1">
              <span id={`${uid}-level`} className={fieldLabel}>
                {t('flashcards.generate.levelLabel')}
              </span>
              <Select
                id={`${uid}-level-select`}
                value={level}
                options={CARD_LEVELS.map((value) => ({ value, label: t(`flashcards.generate.levels.${value}`) }))}
                onChange={(value) => setLevel(value as CardLevel)}
                labelledBy={`${uid}-level`}
              />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <span id={`${uid}-count`} className={fieldLabel}>
              {t('flashcards.generate.countLabel')}
            </span>
            <Select
              id={`${uid}-count-select`}
              value={String(count)}
              options={COUNT_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
              onChange={(value) => setCount(Number(value))}
              labelledBy={`${uid}-count`}
            />
          </div>
          <div className="space-y-1">
            <span id={`${uid}-style`} className={fieldLabel}>
              {t('flashcards.generate.styleLabel')}
            </span>
            <Select
              id={`${uid}-style-select`}
              value={style}
              options={CARD_STYLES.map((value) => ({ value, label: t(`flashcards.generate.styles.${value}`) }))}
              onChange={(value) => setStyle(value as CardStyle)}
              labelledBy={`${uid}-style`}
            />
          </div>
          <div className="space-y-1">
            <span id={`${uid}-language`} className={fieldLabel}>
              {t('flashcards.generate.languageLabel')}
            </span>
            <OutputLanguageSelect id={`${uid}-language-select`} labelledBy={`${uid}-language`} value={language} onChange={setLanguage} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!canGenerate}
          className={`flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${generateClass}`}
        >
          {loading ? <SpinnerIcon className="h-4 w-4" /> : emphasis === 'primary' && <SunIcon className="h-4 w-4" />}
          {t(loading ? 'flashcards.generate.generating' : 'flashcards.generate.generate')}
        </button>
        {loading && (
          <button type="button" onClick={cancel} className="text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
            {t('flashcards.common.cancel')}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" data-purpose="generator-error" className="flex flex-wrap items-center gap-3 rounded-xl border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
          <span className="font-semibold">{t(`flashcards.generate.errors.${error}`)}</span>
          {error !== 'rate_limited' && (
            <button type="button" onClick={() => void generate()} disabled={!canGenerate} className="font-bold underline-offset-2 hover:underline">
              {t('flashcards.generate.retry')}
            </button>
          )}
        </div>
      )}

      {review && (
        <div data-purpose="generator-review" className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">{t('flashcards.generate.reviewTitle')}</p>
            <p className="text-xs text-muted">{t('flashcards.generate.reviewHelp')}</p>
            {removed > 0 && <p className="text-xs text-muted">{t('flashcards.generate.removed', { count: removed })}</p>}
          </div>
          <CardReviewList cards={review} onChange={setReview} existingFronts={deckFronts} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={selected.length === 0}
              className="rounded-xl border-2 border-navy px-4 py-2 text-sm font-bold text-navy hover:bg-navy/5 disabled:opacity-50"
            >
              {t('flashcards.generate.add', { count: selected.length })}
            </button>
            <button
              type="button"
              onClick={() => {
                setReview(null)
                setRemoved(0)
              }}
              className="rounded-xl border border-warm-border px-4 py-2 text-sm font-semibold text-ink hover:border-focus-neutral"
            >
              {t('flashcards.generate.discard')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
