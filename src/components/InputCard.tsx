import { useRef } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { FileTabIcon, LanguagesIcon, TextTabIcon, TrashIcon, UrlTabIcon, YoutubeTabIcon } from './icons'

export type InputTab = 'text' | 'file' | 'url' | 'youtube'

const TAB_ORDER: InputTab[] = ['text', 'file', 'url', 'youtube']

const TAB_ICONS: Record<InputTab, typeof TextTabIcon> = {
  text: TextTabIcon,
  file: FileTabIcon,
  url: UrlTabIcon,
  youtube: YoutubeTabIcon,
}

interface InputCardProps {
  activeTab: InputTab
  onTabChange: (tab: InputTab) => void
  textValue: string
  onTextChange: (value: string) => void
  urlValue: string
  onUrlChange: (value: string) => void
  youtubeValue: string
  onYoutubeChange: (value: string) => void
  wordCount: number
  outputLanguage: string
  onOutputLanguageChange: (value: string) => void
  onClear: () => void
  studyMode: boolean
  onStudyModeChange: (value: boolean) => void
  hasError: boolean
}

export default function InputCard({
  activeTab,
  onTabChange,
  textValue,
  onTextChange,
  urlValue,
  onUrlChange,
  youtubeValue,
  onYoutubeChange,
  wordCount,
  outputLanguage,
  onOutputLanguageChange,
  onClear,
  studyMode,
  onStudyModeChange,
  hasError,
}: InputCardProps) {
  const { t } = useTranslation()
  const tabRefs = useRef<Partial<Record<InputTab, HTMLButtonElement | null>>>({})

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
      className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm md:p-6"
    >
      {/* Info row */}
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 pb-2 text-xs sm:flex-row sm:items-center">
        <div className="space-y-0.5">
          <p className="font-medium text-slate-600">
            <Trans
              i18nKey="inputCard.freePlan"
              components={{
                bold: <span className="font-semibold text-slate-900" />,
                upgrade: (
                  <span className="cursor-pointer font-semibold text-brand-600 hover:underline" />
                ),
              }}
            />
          </p>
          <p className="font-bold text-brand-600">{t('inputCard.wordCount', { count: wordCount })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="output-lang" className="flex items-center gap-1 font-medium text-slate-500">
            <LanguagesIcon className="h-3.5 w-3.5 text-slate-400" />
            {t('inputCard.outputLanguageLabel')}
          </label>
          <select
            id="output-lang"
            value={outputLanguage}
            onChange={(event) => onOutputLanguageChange(event.target.value)}
            className="rounded-lg border-slate-200 bg-slate-50 py-1.5 pr-8 pl-3 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:ring-brand-500"
          >
            <option value="auto">{t('inputCard.outputLanguage.auto')}</option>
            <option value="en">{t('inputCard.outputLanguage.en')}</option>
            <option value="tr">{t('inputCard.outputLanguage.tr')}</option>
            <option value="es">{t('inputCard.outputLanguage.es')}</option>
            <option value="fr">{t('inputCard.outputLanguage.fr')}</option>
            <option value="de">{t('inputCard.outputLanguage.de')}</option>
            <option value="hi">{t('inputCard.outputLanguage.hi')}</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Input source" className="flex items-center gap-2 border-b border-slate-200">
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
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 ${
                isActive
                  ? 'border-brand-600 font-bold text-brand-600'
                  : 'border-transparent font-semibold text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
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
            className={`min-h-[220px] w-full resize-y rounded-2xl border bg-slate-50/50 p-4 text-sm leading-relaxed text-slate-800 transition-all placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:outline-none md:p-5 ${
              hasError
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500/10'
            }`}
          />
        )}

        {activeTab === 'file' && (
          <div
            className={`flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-slate-50/50 p-8 text-center md:min-h-[240px] ${
              hasError ? 'border-rose-400' : 'border-slate-200'
            }`}
          >
            <FileTabIcon className="h-8 w-8 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-slate-700">{t('inputCard.dropzone.title')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('inputCard.dropzone.subtitle')}</p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35"
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
            className={`w-full rounded-2xl border bg-slate-50/50 p-4 text-sm text-slate-800 transition-all placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:outline-none md:p-5 ${
              hasError
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500/10'
            }`}
          />
        )}

        {activeTab === 'youtube' && (
          <input
            type="url"
            value={youtubeValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onYoutubeChange(event.target.value)}
            placeholder={t('inputCard.placeholder.youtube')}
            aria-invalid={hasError}
            className={`w-full rounded-2xl border bg-slate-50/50 p-4 text-sm text-slate-800 transition-all placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:outline-none md:p-5 ${
              hasError
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500/10'
            }`}
          />
        )}

        {hasError && <p className="mt-2 text-xs font-medium text-rose-600">{t('inputCard.errorEmpty')}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          id="btn-clear"
          onClick={onClear}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          <span>{t('inputCard.clearInput')}</span>
        </button>

        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="text-sm" aria-hidden>
              📚
            </span>
            {t('inputCard.studyMode')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={studyMode}
            aria-label={t('inputCard.studyMode')}
            onClick={() => onStudyModeChange(!studyMode)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 ${
              studyMode ? 'bg-brand-600' : 'bg-slate-200'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full border border-slate-300 bg-white transition-transform ${
                studyMode ? 'translate-x-5 border-white' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`text-xs font-semibold ${studyMode ? 'text-brand-600' : 'text-slate-500'}`}>
            {studyMode ? t('inputCard.studyModeOn') : t('inputCard.studyModeOff')}
          </span>
        </div>
      </div>
    </section>
  )
}
