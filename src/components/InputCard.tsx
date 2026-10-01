import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import type { ExtractUrlErrorCode } from '../api/extractUrl'
import type { FileErrorCode } from '../lib/fileExtraction'
import type { FocusPart } from '../lib/focusSnippets'
import { CheckIcon, ChevronDownIcon, FileTabIcon, LanguagesIcon, PencilIcon, SpinnerIcon, TextTabIcon, TrashIcon, UrlTabIcon } from './icons'
import OutputLanguageSelect from './OutputLanguageSelect'
import FocusTextArea from './FocusTextArea'
import { MAX_QUIZ_WORDS } from '../lib/textStats'

export type InputTab = 'text' | 'file' | 'url'

export interface FileTabState {
  file: File | null
  fileName: string
  fileSizeBytes: number
  extractedText: string
  wordCount: number
  truncated: boolean
  isExtracting: boolean
  error: FileErrorCode | null
}

export interface UrlTabState {
  title: string
  extractedText: string
  wordCount: number
  truncated: boolean
  isFetching: boolean
  error: ExtractUrlErrorCode | null
  fetched: boolean
}

const TAB_ORDER: InputTab[] = ['text', 'file', 'url']

const TAB_ICONS: Record<InputTab, typeof TextTabIcon> = {
  text: TextTabIcon,
  file: FileTabIcon,
  url: UrlTabIcon,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface InputCardProps {
  activeTab: InputTab
  onTabChange: (tab: InputTab) => void
  textValue: string
  onTextChange: (value: string) => void
  urlValue: string
  onUrlChange: (value: string) => void
  fileState: FileTabState
  onFileSelected: (file: File) => void
  onFileRemove: () => void
  onEditFileAsText: () => void
  urlState: UrlTabState
  onUrlFetch: () => void
  onEditUrlAsText: () => void
  wordCount: number
  truncated: boolean
  outputLanguage: string
  onOutputLanguageChange: (value: string) => void
  onClear: () => void
  hasError: boolean
  focusParts: FocusPart[]
  onFocusPartsChange: (parts: FocusPart[]) => void
}

export default function InputCard({
  activeTab,
  onTabChange,
  textValue,
  onTextChange,
  urlValue,
  onUrlChange,
  fileState,
  onFileSelected,
  onFileRemove,
  onEditFileAsText,
  urlState,
  onUrlFetch,
  onEditUrlAsText,
  wordCount,
  truncated,
  outputLanguage,
  onOutputLanguageChange,
  onClear,
  hasError,
  focusParts,
  onFocusPartsChange,
}: InputCardProps) {
  const { t, i18n } = useTranslation()
  const tabRefs = useRef<Partial<Record<InputTab, HTMLButtonElement | null>>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const isOverWordLimit = wordCount > MAX_QUIZ_WORDS

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

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onFileSelected(file)
  }

  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <section
      data-purpose="input-container-card"
      className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6"
    >
      {/* Info row */}
      <div data-purpose="info-row" className="flex flex-col items-start gap-3 border-b border-warm-border pb-4 text-xs sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 leading-normal">
          <p className="font-medium text-muted">{t('inputCard.wordLimit')}</p>
          <p data-purpose="word-counter" className={isOverWordLimit ? 'text-error' : 'text-muted'}>
            <span className="font-normal">{t('inputCard.wordCount.label')}</span>{' '}
            <span className="font-medium">{wordCount.toLocaleString(i18n.language)}</span>{' '}
            <span className="font-normal">{t('inputCard.wordCount.max')}</span>
          </p>
        </div>
        <div data-purpose="output-language-row" className="flex w-full shrink-0 flex-col items-start gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label
            id="output-lang-label"
            htmlFor="output-lang"
            className="flex items-center gap-1 font-medium whitespace-nowrap text-muted"
          >
            <LanguagesIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
            {t('inputCard.outputLanguageLabel')}
          </label>
          <div className="w-full sm:w-[168px]">
            <OutputLanguageSelect
              id="output-lang"
              labelledBy="output-lang-label"
              value={outputLanguage}
              onChange={onOutputLanguageChange}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Input source" className="-mt-1 flex items-center gap-2 border-b border-warm-border">
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
          <FocusTextArea
            id="quiz-content-input"
            value={textValue}
            onChange={onTextChange}
            placeholder={t('inputCard.placeholder.text')}
            hasError={hasError}
            focusParts={focusParts}
            onFocusPartsChange={onFocusPartsChange}
          />
        )}

        {activeTab === 'file' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileInputChange}
              className="sr-only"
            />

            {!fileState.file ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card px-4 py-8 text-center transition-colors md:min-h-[240px] ${
                  hasError ? 'border-error' : isDragging ? 'border-amber' : 'border-warm-border'
                }`}
              >
                <FileTabIcon className="h-8 w-8 text-muted" />
                <div>
                  <p className="text-sm font-semibold text-ink">{t('inputCard.dropzone.title')}</p>
                  <p className="mt-1 text-xs text-muted">{t('inputCard.dropzone.subtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                  className="rounded-xl border border-warm-border bg-paper px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:border-amber"
                >
                  {t('inputCard.dropzone.browse')}
                </button>
                <p className="text-xs text-muted">{t('inputCard.file.privacyHelper')}</p>
              </div>
            ) : fileState.isExtracting ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-warm-border bg-card px-4 py-8 text-center md:min-h-[240px]">
                <SpinnerIcon className="h-6 w-6 text-amber-hover" />
                <p className="text-sm font-medium text-muted">{t('inputCard.file.extracting')}</p>
              </div>
            ) : fileState.error ? (
              <div
                role="alert"
                className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-error bg-error/5 px-4 py-8 text-center md:min-h-[240px]"
              >
                <p className="text-sm font-semibold text-error">{t(`inputCard.file.errors.${fileState.error}`)}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
                >
                  {t('inputCard.file.chooseAnother')}
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-warm-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <FileTabIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-hover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{fileState.fileName}</p>
                      <p className="text-xs text-muted">
                        {formatFileSize(fileState.fileSizeBytes)} · {t('inputCard.file.wordCount', { count: fileState.wordCount })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onFileRemove}
                    aria-label={t('inputCard.file.remove')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-warm-border/50 hover:text-error"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                {fileState.truncated && <p className="text-xs font-medium text-amber-text">{t('inputCard.truncatedNote')}</p>}

                <div className="flex flex-wrap items-center gap-2 border-t border-warm-border pt-3">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen((open) => !open)}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-text hover:underline"
                  >
                    {isPreviewOpen ? t('inputCard.file.hidePreview') : t('inputCard.file.showPreview')}
                    <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${isPreviewOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <span className="mx-1 h-4 w-px bg-warm-border" />
                  <button
                    type="button"
                    onClick={onEditFileAsText}
                    className="flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    {t('inputCard.file.editAsText')}
                  </button>
                </div>

                {isPreviewOpen && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-warm-border bg-paper p-3.5 text-xs whitespace-pre-wrap text-muted">
                    {fileState.extractedText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'url' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={urlValue}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onUrlChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onUrlFetch()
                  }
                }}
                placeholder={t('inputCard.placeholder.url')}
                aria-invalid={hasError}
                className={`min-w-0 flex-1 rounded-2xl border border-dashed bg-card px-4 py-4 text-sm text-ink transition-all placeholder:text-muted focus:border-solid md:py-5 ${
                  hasError ? 'border-error' : 'border-warm-border'
                }`}
              />
              <button
                type="button"
                onClick={onUrlFetch}
                disabled={urlState.isFetching || !urlValue.trim()}
                className="shrink-0 rounded-xl bg-amber px-4 py-3.5 text-sm font-bold text-navy transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber md:py-4.5"
              >
                {urlState.isFetching ? <SpinnerIcon className="h-4 w-4 text-navy" /> : t('inputCard.url.fetch')}
              </button>
            </div>

            {urlState.isFetching && <p className="text-xs font-medium text-muted">{t('inputCard.url.fetching')}</p>}

            {urlState.error && (
              <div role="alert" className="space-y-2 rounded-2xl border border-error/40 bg-error/5 p-4 text-center">
                <p className="text-sm font-semibold text-error">{t(`inputCard.url.errors.${urlState.error}`)}</p>
                <button
                  type="button"
                  onClick={onUrlFetch}
                  className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
                >
                  {t('inputCard.url.retry')}
                </button>
              </div>
            )}

            {urlState.fetched && !urlState.error && (
              <div className="space-y-3 rounded-2xl border border-warm-border bg-card p-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{urlState.title || urlValue}</p>
                    <p className="text-xs text-muted">{t('inputCard.file.wordCount', { count: urlState.wordCount })}</p>
                  </div>
                </div>

                {urlState.truncated && <p className="text-xs font-medium text-amber-text">{t('inputCard.truncatedNote')}</p>}

                <div className="flex flex-wrap items-center gap-2 border-t border-warm-border pt-3">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen((open) => !open)}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-text hover:underline"
                  >
                    {isPreviewOpen ? t('inputCard.file.hidePreview') : t('inputCard.file.showPreview')}
                    <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${isPreviewOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <span className="mx-1 h-4 w-px bg-warm-border" />
                  <button
                    type="button"
                    onClick={onEditUrlAsText}
                    className="flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    {t('inputCard.file.editAsText')}
                  </button>
                </div>

                {isPreviewOpen && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-warm-border bg-paper p-3.5 text-xs whitespace-pre-wrap text-muted">
                    {urlState.extractedText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'text' && truncated && <p className="mt-2 text-xs font-medium text-amber-text">{t('inputCard.truncatedNote')}</p>}
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

