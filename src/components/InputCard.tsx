import { useRef } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { FileTabIcon, LanguagesIcon, TextTabIcon, TrashIcon, UrlTabIcon } from './icons'
import Select from './Select'

export type InputTab = 'text' | 'file' | 'url'

const TAB_ORDER: InputTab[] = ['text', 'file', 'url']

const TAB_ICONS: Record<InputTab, typeof TextTabIcon> = {
  text: TextTabIcon,
  file: FileTabIcon,
  url: UrlTabIcon,
}

interface InputCardProps {
  activeTab: InputTab
  onTabChange: (tab: InputTab) => void
  textValue: string
  onTextChange: (value: string) => void
  urlValue: string
  onUrlChange: (value: string) => void
  wordCount: number
  outputLanguage: string
  onOutputLanguageChange: (value: string) => void
  onClear: () => void
  hasError: boolean
}

export default function InputCard({
  activeTab,
  onTabChange,
  textValue,
  onTextChange,
  urlValue,
  onUrlChange,
  wordCount,
  outputLanguage,
  onOutputLanguageChange,
  onClear,
  hasError,
}: InputCardProps) {
  const { t } = useTranslation()
  const tabRefs = useRef<Partial<Record<InputTab, HTMLButtonElement | null>>>({})

  const outputLanguageOptions = [
    { value: 'auto', label: t('inputCard.outputLanguage.auto') },
    { value: 'en', label: t('inputCard.outputLanguage.en') },
    { value: 'tr', label: t('inputCard.outputLanguage.tr') },
    { value: 'es', label: t('inputCard.outputLanguage.es') },
    { value: 'fr', label: t('inputCard.outputLanguage.fr') },
    { value: 'de', label: t('inputCard.outputLanguage.de') },
    { value: 'hi', label: t('inputCard.outputLanguage.hi') },
    { value: 'hyw', label: t('inputCard.outputLanguage.hyw') },
  ]

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TAB_ORDER.indexOf(activeTab)
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TAB_ORDER.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TAB_ORDER.length - 1
    }

    if (nextIndex !== null) {
      event.preventDefault()
      const nextTab = TAB_ORDER[nextIndex]
      onTabChange(nextTab)
      tabRefs.current[nextTab]?.focus()
    }
  }

  return (
    <section
      data-purpose="input-container-card"
      className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6"
    >
      {/* Info row */}
      <div className="flex flex-col items-start justify-between gap-3 border-b border-warm-border pb-2 text-xs sm:flex-row sm:items-center">
        <div className="space-y-0.5">
          <p className="font-medium text-muted">{t('inputCard.wordLimit')}</p>
          <p className="font-bold text-amber-hover">{t('inputCard.wordCount', { count: wordCount })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label id="output-lang-label" htmlFor="output-lang" className="flex items-center gap-1 font-medium text-muted">
            <LanguagesIcon className="h-3.5 w-3.5 text-muted" />
            {t('inputCard.outputLanguageLabel')}
          </label>
          <Select
            id="output-lang"
            labelledBy="output-lang-label"
            variant="boxed"
            value={outputLanguage}
            onChange={onOutputLanguageChange}
            options={outputLanguageOptions}
          />
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Input source" className="flex items-center gap-2 border-b border-warm-border">
        {TAB_ORDER.map((tab) => {
          const Icon = TAB_ICONS[tab]
          const isActive = tab === activeTab
          return (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[tab] = el
              }}
              id={`tab-${tab}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls="input-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab)}
              onKeyDown={handleTabKeyDown}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-all ${
                isActive ? 'border-amber font-bold text-ink' : 'border-transparent font-semibold text-muted hover:text-ink'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-amber-hover' : 'text-muted'}`} />
              <span>{t(`inputCard.tabs.${tab}`)}</span>
            </button>
          )
        })}
      </div>

      {/* Panel */}
      <div id="input-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'text' && (
          <textarea
            id="quiz-content-input"
            rows={9}
            value={textValue}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={t('inputCard.placeholder.text')}
            aria-invalid={hasError}
            className={`min-h-[220px] w-full resize-y rounded-2xl border border-dashed bg-card px-4 py-4 text-sm leading-relaxed text-ink transition-all placeholder:text-muted focus:border-solid md:py-5 ${
              hasError ? 'border-error' : 'border-warm-border'
            }`}
          />
        )}

        {activeTab === 'file' && (
          <div
            className={`flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card px-4 py-8 text-center md:min-h-[240px] ${
              hasError ? 'border-error' : 'border-warm-border'
            }`}
          >
            <FileTabIcon className="h-8 w-8 text-muted" />
            <div>
              <p className="text-sm font-semibold text-ink">{t('inputCard.dropzone.title')}</p>
              <p className="mt-1 text-xs text-muted">{t('inputCard.dropzone.subtitle')}</p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-warm-border bg-paper px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:border-amber"
            >
              {t('inputCard.dropzone.browse')}
            </button>
          </div>
        )}

        {activeTab === 'url' && (
          <input
            type="url"
            value={urlValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUrlChange(event.target.value)}
            placeholder={t('inputCard.placeholder.url')}
            aria-invalid={hasError}
            className={`w-full rounded-2xl border border-dashed bg-card px-4 py-4 text-sm text-ink transition-all placeholder:text-muted focus:border-solid md:py-5 ${
              hasError ? 'border-error' : 'border-warm-border'
            }`}
          />
        )}

        {hasError && <p className="mt-2 text-xs font-medium text-error">{t('inputCard.errorEmpty')}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-start pt-2">
        <button
          type="button"
          id="btn-clear"
          onClick={onClear}
          className="inline-flex items-center gap-2 rounded-xl border border-warm-border bg-card px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:border-error/50 hover:text-error"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          <span>{t('inputCard.clearInput')}</span>
        </button>
      </div>
    </section>
  )
}
