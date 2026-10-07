import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { GenerateApiError, generateQuiz } from '../api/generateQuiz'
import type { GenerateErrorCode } from '../api/generateQuiz'
import { ExtractUrlApiError, extractUrlText } from '../api/extractUrl'
import type { ExtractUrlErrorCode } from '../api/extractUrl'
import {
  MAX_SOURCE_AVOID_STEMS,
  addArchiveEntry,
  cachedPlanForSource,
  createArchiveEntryId,
  getArchiveEntries,
  loadArchive,
  getArchiveEntry,
  previousStemsForSource,
  sourceTextHash,
  updateArchiveEntry,
} from '../lib/archive'
import { estimateAutoQuestionCount } from '../lib/factCoverage'
import type { QuestionType } from '../lib/quizTypes'
import { extractTextFromFile, FileExtractionError } from '../lib/fileExtraction'
import type { FileErrorCode } from '../lib/fileExtraction'
import { supportsOptionsCount } from '../lib/quizTypes'
import { MAX_QUIZ_WORDS, MAX_SOURCE_TEXT_CHARS, MIN_QUIZ_WORDS, countWords } from '../lib/textStats'
import type { GeneratedQuiz } from '../lib/quiz'
import { shuffleQuizOptions } from '../lib/shuffleOptions'
import type { FocusPart } from '../lib/focusSnippets'
import { focusSnippetsFor } from '../lib/focusSnippets'
import { estimateQuizTimeRange } from '../lib/estimateTime'
import type { EstimateDifficulty, EstimateQuestionType } from '../lib/estimateTime'
import { clearDraft, readDraft, useSaveDraft } from '../hooks/useDraft'
import { useIsPageActive } from '../hooks/usePageActive'
import { deletePageDraft, readPageDraft, writePageDraft } from '../lib/pageDraftStorage'
import type { QuizDraft } from '../hooks/useDraft'
import GenerateButton from '../components/GenerateButton'
import InputCard from '../components/InputCard'
import type { FileTabState, InputTab, UrlTabState } from '../components/InputCard'
import ParameterGrid from '../components/ParameterGrid'
import QuizWorkspace from '../components/QuizWorkspace'
import DueReminder from '../components/flashcards/DueReminder'

function firstWords(value: string, maxWords: number): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ')
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface CreatePageLocationState {
  prefillText?: string
}

interface GeneratedResult {
  entryId: string
  quiz: GeneratedQuiz
  sourceText: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  questionType: string
  requestedCount: number
  incomplete: boolean
  supportedCount?: number
  includeExplanations: boolean
  shuffleOptions: boolean
  includeHints: boolean
  focusSnippets: string[]
}

/** Extracted file/URL text and the last quiz, kept in IndexedDB for a reload — never localStorage. */
interface CreatePageDraft {
  file: { fileName: string; fileSizeBytes: number; extractedText: string; wordCount: number; truncated: boolean } | null
  url: { forUrl: string; title: string; extractedText: string; wordCount: number; truncated: boolean } | null
  result: GeneratedResult | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCreatePageDraft(raw: unknown): CreatePageDraft | null {
  if (!isRecord(raw)) return null
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const file = isRecord(raw.file) && typeof raw.file.extractedText === 'string' && raw.file.extractedText
    ? {
        fileName: text(raw.file.fileName),
        fileSizeBytes: count(raw.file.fileSizeBytes),
        extractedText: raw.file.extractedText.slice(0, MAX_SOURCE_TEXT_CHARS),
        wordCount: count(raw.file.wordCount),
        truncated: raw.file.truncated === true,
      }
    : null
  const url = isRecord(raw.url) && typeof raw.url.extractedText === 'string' && raw.url.extractedText
    ? {
        forUrl: text(raw.url.forUrl),
        title: text(raw.url.title),
        extractedText: raw.url.extractedText.slice(0, MAX_SOURCE_TEXT_CHARS),
        wordCount: count(raw.url.wordCount),
        truncated: raw.url.truncated === true,
      }
    : null
  // The quiz itself is re-read from the Archive entry (it holds later edits); the rest is settings.
  const result = isRecord(raw.result) && typeof raw.result.entryId === 'string' && typeof raw.result.sourceText === 'string'
    ? (raw.result as unknown as GeneratedResult)
    : null
  return { file, url, result }
}

const EMPTY_FILE_STATE: FileTabState = {
  file: null,
  fileName: '',
  fileSizeBytes: 0,
  extractedText: '',
  wordCount: 0,
  truncated: false,
  isExtracting: false,
  error: null,
}

const EMPTY_URL_STATE: UrlTabState = {
  title: '',
  extractedText: '',
  wordCount: 0,
  truncated: false,
  isFetching: false,
  error: null,
  fetched: false,
}

export default function CreatePage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const pageActive = useIsPageActive()
  const prefillText = (location.state as CreatePageLocationState | null)?.prefillText

  // Computed once (memoized, never re-read from localStorage on later renders) so the initial
  // state below can be seeded directly instead of being overwritten a moment later in an effect —
  // which would cascade into an extra render per field and briefly flash the empty defaults. Only
  // the very first evaluation actually matters: each `useState` below reads it eagerly, and React
  // ignores that argument on every render after the first anyway.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally computed once, not on every prefillText change
  const initialDraft: QuizDraft | null = useMemo(() => (prefillText ? null : readDraft()), [])

  const [activeTab, setActiveTab] = useState<InputTab>(initialDraft?.activeTab ?? 'text')
  const [textValue, setTextValue] = useState(initialDraft?.textValue ?? prefillText ?? '')
  const [urlValue, setUrlValue] = useState(initialDraft?.urlValue ?? '')
  const [fileState, setFileState] = useState<FileTabState>(EMPTY_FILE_STATE)
  const [urlState, setUrlState] = useState<UrlTabState>(EMPTY_URL_STATE)
  const [outputLanguage, setOutputLanguage] = useState(initialDraft?.outputLanguage ?? 'auto')
  const [focusParts, setFocusParts] = useState<FocusPart[]>(initialDraft?.focusParts ?? [])

  const [title, setTitle] = useState(initialDraft?.title ?? '')
  const [questionType, setQuestionType] = useState(initialDraft?.questionType ?? 'mcq')
  const [questionCount, setQuestionCount] = useState(initialDraft?.questionCount ?? 'auto')
  const [difficulty, setDifficulty] = useState(initialDraft?.difficulty ?? 'medium')
  const [optionsCount, setOptionsCount] = useState(initialDraft?.optionsCount ?? '4')
  const [includeExplanations, setIncludeExplanations] = useState(initialDraft?.includeExplanations ?? true)
  const [shuffleOptions, setShuffleOptions] = useState(initialDraft?.shuffleOptions ?? true)
  const [includeHints, setIncludeHints] = useState(initialDraft?.includeHints ?? true)

  const [hasError, setHasError] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<GenerateErrorCode | null>(null)
  const [result, setResult] = useState<GeneratedResult | null>(null)
  const [draftRestoredNoticeVisible, setDraftRestoredNoticeVisible] = useState(Boolean(initialDraft))

  const resultRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const fileExtractionTokenRef = useRef(0)
  const urlFetchAbortRef = useRef<AbortController | null>(null)
  /** Last quiz generated from this exact input+settings combination, kept in memory only (never
   * localStorage) so a repeat Generate click on the same source avoids repeating its questions. */
  const lastGenerationRef = useRef<{ key: string; questions: string[] } | null>(null)

  // The page stays mounted between visits, so a later "Create quiz" from Solve arrives as new
  // location state rather than a fresh mount; the first one was already used as the initial text.
  const usedPrefillRef = useRef(prefillText)
  useEffect(() => {
    if (!prefillText || !pageActive) return
    if (usedPrefillRef.current !== prefillText) {
      setActiveTab('text')
      setTextValue(prefillText)
      setFocusParts([])
      setHasError(false)
      setGenerateError(null)
    }
    usedPrefillRef.current = undefined
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillText, pageActive])

  useEffect(() => {
    if (!initialDraft) return undefined
    const timeout = setTimeout(() => setDraftRestoredNoticeVisible(false), 5000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => abortControllerRef.current?.abort(), [])
  useEffect(() => () => urlFetchAbortRef.current?.abort(), [])

  // Bring back extracted file/URL text and the last quiz after a reload (IndexedDB, ≤24 hours).
  const restoredEntryRef = useRef<string | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    void readPageDraft('create').then((raw) => {
      if (cancelled) return
      const draft = parseCreatePageDraft(raw)
      if (draft?.file) {
        const saved = draft.file
        setFileState((current) =>
          current.file
            ? current
            : {
                ...EMPTY_FILE_STATE,
                file: new File([], saved.fileName),
                fileName: saved.fileName,
                fileSizeBytes: saved.fileSizeBytes,
                extractedText: saved.extractedText,
                wordCount: saved.wordCount,
                truncated: saved.truncated,
              },
        )
      }
      if (draft?.url && draft.url.forUrl === initialDraft?.urlValue) {
        const saved = draft.url
        setUrlState((current) => (current.fetched || current.isFetching ? current : { ...EMPTY_URL_STATE, ...saved, fetched: true }))
      }
      const savedQuiz = draft?.result && !prefillText ? getArchiveEntry(draft.result.entryId)?.quiz : undefined
      if (draft?.result && savedQuiz) {
        const saved = { ...draft.result, quiz: savedQuiz }
        restoredEntryRef.current = saved.entryId
        setResult((current) => current ?? saved)
      }
      setDraftReady(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on mount
  }, [])

  useEffect(() => {
    if (!draftReady || fileState.isExtracting || urlState.isFetching) return undefined
    const draft: CreatePageDraft = {
      file:
        fileState.file && fileState.extractedText
          ? {
              fileName: fileState.fileName,
              fileSizeBytes: fileState.fileSizeBytes,
              extractedText: fileState.extractedText,
              wordCount: fileState.wordCount,
              truncated: fileState.truncated,
            }
          : null,
      url:
        urlState.fetched && urlState.extractedText
          ? { forUrl: urlValue, title: urlState.title, extractedText: urlState.extractedText, wordCount: urlState.wordCount, truncated: urlState.truncated }
          : null,
      result,
    }
    const timer = window.setTimeout(() => {
      if (draft.file || draft.url || draft.result) void writePageDraft('create', draft)
      else void deletePageDraft('create')
    }, 300)
    return () => window.clearTimeout(timer)
  }, [draftReady, fileState, urlState, urlValue, result])

  useEffect(() => {
    if (!result) return
    // A quiz brought back after a reload stays where it is; only a new one scrolls into view.
    if (restoredEntryRef.current === result.entryId) return
    resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [result?.entryId]) // eslint-disable-line react-hooks/exhaustive-deps

  useSaveDraft(
    {
      textValue,
      activeTab,
      urlValue,
      outputLanguage,
      title,
      questionType,
      questionCount,
      difficulty,
      optionsCount,
      includeExplanations,
      shuffleOptions,
      includeHints,
      focusParts,
    },
    true,
  )

  const handleStartFresh = () => {
    clearDraft()
    setDraftRestoredNoticeVisible(false)
    setTextValue('')
    setActiveTab('text')
    setUrlValue('')
    setUrlState(EMPTY_URL_STATE)
    setFileState(EMPTY_FILE_STATE)
    setOutputLanguage('auto')
    setTitle('')
    setQuestionType('mcq')
    setQuestionCount('auto')
    setDifficulty('medium')
    setOptionsCount('4')
    setIncludeExplanations(true)
    setShuffleOptions(true)
    setIncludeHints(true)
    setFocusParts([])
    setHasError(false)
    setGenerateError(null)
    setResult(null)
  }

  const wordCount = useMemo(() => countWords(textValue), [textValue])

  const activeContent =
    activeTab === 'text' ? textValue : activeTab === 'file' ? fileState.extractedText : activeTab === 'url' ? urlState.extractedText : ''

  const activeWordCount = activeTab === 'text' ? wordCount : activeTab === 'file' ? fileState.wordCount : urlState.wordCount
  const activeTruncated = activeTab === 'file' ? fileState.truncated : activeTab === 'url' ? urlState.truncated : false

  const timeEstimateLabel = useMemo(() => {
    // Auto: the count is guessed from the word count until the plan exists (the result shows the real one).
    const isAuto = questionCount === 'auto'
    if (isAuto && activeWordCount < MIN_QUIZ_WORDS) return undefined
    const parsedCount = isAuto ? estimateAutoQuestionCount(Math.min(activeWordCount, MAX_QUIZ_WORDS), questionType as QuestionType) : Number.parseInt(questionCount, 10)
    if (!Number.isFinite(parsedCount) || parsedCount <= 0) return undefined
    const { underAMinute, minMinutes, maxMinutes } = estimateQuizTimeRange({
      questionType: questionType as EstimateQuestionType | 'mixed',
      questionCount: parsedCount,
      difficulty: (difficulty as EstimateDifficulty) ?? 'medium',
      optionsCount: supportsOptionsCount(questionType) ? Number.parseInt(optionsCount, 10) : undefined,
    })
    const time = underAMinute
      ? t('create.timeEstimate.underMinute')
      : minMinutes !== maxMinutes
        ? t('create.timeEstimate.range', { min: minMinutes, max: maxMinutes })
        : minMinutes === 1
          ? t('create.timeEstimate.singleMinute')
          : t('create.timeEstimate.single', { minutes: minMinutes })
    return isAuto ? t('create.timeEstimate.auto', { count: parsedCount, time }) : time
  }, [questionType, questionCount, difficulty, optionsCount, activeWordCount, t])

  const handleTabChange = (tab: InputTab) => {
    setActiveTab(tab)
    setHasError(false)
    setGenerateError(null)
  }

  const handleClear = () => {
    if (activeTab === 'text') {
      setTextValue('')
      setFocusParts([])
    }
    if (activeTab === 'url') {
      setUrlValue('')
      setUrlState(EMPTY_URL_STATE)
    }
    if (activeTab === 'file') setFileState(EMPTY_FILE_STATE)
    setHasError(false)
    setGenerateError(null)
  }

  const handleTextChange = (value: string) => {
    // FocusTextArea already applies sanitizeTextLight before calling this, so its own focus-part
    // reconciliation diffs against the same final text stored here — never a second, divergent pass.
    setTextValue(value)
    if (value.trim()) setHasError(false)
    setGenerateError(null)
  }

  const handleUrlChange = (value: string) => {
    setUrlValue(value)
    if (value.trim()) setHasError(false)
    setGenerateError(null)
    setUrlState((current) => (current.fetched || current.error ? EMPTY_URL_STATE : current))
  }

  const handleFileSelected = async (file: File) => {
    const token = ++fileExtractionTokenRef.current
    setHasError(false)
    setGenerateError(null)
    setFileState({ ...EMPTY_FILE_STATE, file, fileName: file.name, fileSizeBytes: file.size, isExtracting: true })

    try {
      const extracted = await extractTextFromFile(file)
      if (fileExtractionTokenRef.current !== token) return
      setFileState({
        file,
        fileName: file.name,
        fileSizeBytes: file.size,
        extractedText: extracted.text,
        wordCount: extracted.wordCount,
        truncated: extracted.truncated,
        isExtracting: false,
        error: null,
      })
    } catch (error) {
      if (fileExtractionTokenRef.current !== token) return
      const code: FileErrorCode = error instanceof FileExtractionError ? error.code : 'corrupt'
      setFileState({ ...EMPTY_FILE_STATE, file, fileName: file.name, fileSizeBytes: file.size, isExtracting: false, error: code })
    }
  }

  const handleFileRemove = () => {
    fileExtractionTokenRef.current++
    setFileState(EMPTY_FILE_STATE)
  }

  const handleEditFileAsText = () => {
    if (!fileState.extractedText) return
    setTextValue(fileState.extractedText)
    setActiveTab('text')
  }

  const handleUrlFetch = async () => {
    const url = urlValue.trim()
    if (!url) {
      setHasError(true)
      return
    }
    setHasError(false)
    setGenerateError(null)
    urlFetchAbortRef.current?.abort()
    const controller = new AbortController()
    urlFetchAbortRef.current = controller
    setUrlState({ ...EMPTY_URL_STATE, isFetching: true })

    try {
      const extracted = await extractUrlText(url, controller.signal)
      setUrlState({
        title: extracted.title,
        extractedText: extracted.text,
        wordCount: extracted.wordCount,
        truncated: extracted.truncated,
        isFetching: false,
        error: null,
        fetched: true,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const code: ExtractUrlErrorCode = error instanceof ExtractUrlApiError ? error.code : 'network'
      setUrlState({ ...EMPTY_URL_STATE, isFetching: false, error: code })
    }
  }

  const handleEditUrlAsText = () => {
    if (!urlState.extractedText) return
    setTextValue(urlState.extractedText)
    setActiveTab('text')
  }

  const persistEntry = (entryId: string, quiz: GeneratedQuiz) => {
    updateArchiveEntry(entryId, (entry) => ({ ...entry, title: quiz.title, quiz }))
  }

  const handleGenerate = async () => {
    setGenerateError(null)

    if (!activeContent.trim()) {
      setHasError(true)
      return
    }

    if (activeContent.length > MAX_SOURCE_TEXT_CHARS) {
      setGenerateError('too_long_chars')
      return
    }
    if (activeWordCount < MIN_QUIZ_WORDS) {
      setGenerateError('too_short')
      return
    }
    if (activeWordCount > MAX_QUIZ_WORDS) {
      setGenerateError('too_long')
      return
    }

    setHasError(false)
    setResult(null)
    setIsGenerating(true)

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const needsOptionsCount = supportsOptionsCount(questionType)
    const focusSnippets = activeTab === 'text' ? focusSnippetsFor(activeContent, focusParts) : []
    const shuffleApplies = shuffleOptions && needsOptionsCount
    const generationKey = [
      activeContent.trim(),
      questionType,
      questionCount,
      difficulty,
      needsOptionsCount ? optionsCount : '',
      outputLanguage,
      focusSnippets.join('\u0000'),
    ].join('|')
    // Earlier quizzes from the same source text (Archive, matched by hash) plus the last generation
    // with the same settings: new quizzes cover other facts and wordings first.
    const sourceHash = sourceTextHash(activeContent)
    const sameSettings = lastGenerationRef.current?.key === generationKey ? lastGenerationRef.current.questions : []
    await loadArchive() // the account's quizzes, warmed at sign-in (instant once loaded)
    const archiveEntries = getArchiveEntries()
    const avoidQuestions = [...new Set([...sameSettings, ...previousStemsForSource(archiveEntries, sourceHash)])].slice(0, MAX_SOURCE_AVOID_STEMS)
    const plan = cachedPlanForSource(archiveEntries, sourceHash, outputLanguage)

    try {
      const generated = await generateQuiz(
        {
          text: activeContent,
          questionType,
          questionCount,
          difficulty,
          optionsCount: needsOptionsCount ? optionsCount : undefined,
          outputLanguage,
          avoidQuestions,
          title: title.trim() || undefined,
          includeExplanations,
          shuffleOptions: shuffleApplies,
          includeHints,
          focusSnippets,
          plan,
        },
        controller.signal,
      )

      lastGenerationRef.current = {
        key: generationKey,
        questions: generated.questions.map((question) => question.question).slice(0, 30),
      }

      const finalTitle = title.trim() || generated.title || firstWords(activeContent, 6) || t('archive.untitled')
      const questions = shuffleApplies ? shuffleQuizOptions(generated.questions) : generated.questions
      const quiz: GeneratedQuiz = { title: finalTitle, questions, ...(generated.coverage ? { coverage: generated.coverage } : {}) }

      const id = createArchiveEntryId()
      addArchiveEntry({
        id,
        title: finalTitle,
        createdAt: new Date().toISOString(),
        source: activeTab,
        questionType,
        difficulty,
        questionCount,
        optionsCount: needsOptionsCount ? optionsCount : null,
        outputLanguage,
        sourceText: activeContent,
        quiz,
        includeExplanations,
        shuffleOptions: shuffleApplies,
        includeHints,
        focusPartsCount: focusSnippets.length,
        sourceHash,
      })

      setResult({
        entryId: id,
        quiz,
        sourceText: activeContent,
        difficulty,
        optionsCount: needsOptionsCount ? optionsCount : undefined,
        outputLanguage,
        questionType,
        requestedCount: generated.requestedCount,
        incomplete: generated.incomplete,
        supportedCount: generated.supportedCount,
        includeExplanations,
        shuffleOptions: shuffleApplies,
        includeHints,
        focusSnippets,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setGenerateError(error instanceof GenerateApiError ? error.code : 'network')
    } finally {
      if (abortControllerRef.current === controller) setIsGenerating(false)
    }
  }

  return (
    <>
      <DueReminder />
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">
          {t('hero.title')}
        </h1>
        <p className="text-sm font-normal text-muted">{t('hero.subtitle')}</p>
      </section>

      {draftRestoredNoticeVisible && (
        <div
          data-print-hide
          className="-mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warm-border bg-card px-4 py-2.5 text-xs"
        >
          <span className="font-medium text-muted">{t('create.draft.restored')}</span>
          <button type="button" onClick={handleStartFresh} className="font-bold text-amber-text hover:underline">
            {t('create.draft.startFresh')}
          </button>
        </div>
      )}

      <div data-print-hide className="space-y-7">
        <InputCard
          activeTab={activeTab}
          onTabChange={handleTabChange}
          textValue={textValue}
          onTextChange={handleTextChange}
          urlValue={urlValue}
          onUrlChange={handleUrlChange}
          fileState={fileState}
          onFileSelected={(file) => void handleFileSelected(file)}
          onFileRemove={handleFileRemove}
          onEditFileAsText={handleEditFileAsText}
          urlState={urlState}
          onUrlFetch={() => void handleUrlFetch()}
          onEditUrlAsText={handleEditUrlAsText}
          wordCount={activeWordCount}
          truncated={activeTruncated}
          outputLanguage={outputLanguage}
          onOutputLanguageChange={setOutputLanguage}
          onClear={handleClear}
          hasError={hasError}
          focusParts={focusParts}
          onFocusPartsChange={setFocusParts}
        />

        <ParameterGrid
          title={title}
          onTitleChange={setTitle}
          questionType={questionType}
          onQuestionTypeChange={setQuestionType}
          questionCount={questionCount}
          onQuestionCountChange={setQuestionCount}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          optionsCount={optionsCount}
          onOptionsCountChange={setOptionsCount}
          includeExplanations={includeExplanations}
          onIncludeExplanationsChange={setIncludeExplanations}
          shuffleOptions={shuffleOptions}
          onShuffleOptionsChange={setShuffleOptions}
          includeHints={includeHints}
          onIncludeHintsChange={setIncludeHints}
        />

        <GenerateButton isLoading={isGenerating} onClick={() => void handleGenerate()} timeEstimateLabel={timeEstimateLabel} />

        {generateError && (
          <div role="alert" className="-mt-4 space-y-3 rounded-[14px] border border-error/40 bg-error/5 p-5 text-center">
            <p className="text-sm font-semibold text-error">{t(`create.errors.${generateError}`)}</p>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
            >
              {t('create.errors.retry')}
            </button>
          </div>
        )}

        {isGenerating && (
          <ul className="-mt-4 animate-pulse space-y-4" aria-hidden>
            {[0, 1, 2].map((index) => (
              <li key={index} className="h-32 rounded-[14px] border border-warm-border bg-card" />
            ))}
          </ul>
        )}
      </div>

      {result && (
        <div ref={resultRef} className="-mt-4">
          <QuizWorkspace
            key={result.entryId}
            quizId={result.entryId}
            initialQuiz={result.quiz}
            sourceText={result.sourceText}
            meta={{
              questionCount: result.quiz.questions.length,
              questionType: result.questionType,
              difficulty: result.difficulty,
              outputLanguage: result.outputLanguage,
            }}
            difficulty={result.difficulty}
            optionsCount={result.optionsCount}
            outputLanguage={result.outputLanguage}
            requestedCount={result.requestedCount}
            incomplete={result.incomplete}
            supportedCount={result.supportedCount}
            onPersist={(quiz) => persistEntry(result.entryId, quiz)}
            archiveLink={{ href: `/archive/${result.entryId}`, label: t('cta.viewInArchive') }}
            includeExplanations={result.includeExplanations}
            shuffleOptions={result.shuffleOptions}
            includeHints={result.includeHints}
            focusSnippets={result.focusSnippets}
          />
        </div>
      )}
    </>
  )
}
