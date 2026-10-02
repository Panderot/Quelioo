import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ExtractUrlApiError, extractUrlText } from '../../api/extractUrl'
import type { ExtractUrlErrorCode } from '../../api/extractUrl'
import { LessonApiError, planLesson, verifyAndStoreLessonAccessCode, writeLessonEpisode } from '../../api/lesson'
import type { LessonClientErrorCode } from '../../api/lesson'
import { getArchiveEntries } from '../../lib/archive'
import { extractTextFromFile, FileExtractionError } from '../../lib/fileExtraction'
import type { FileErrorCode } from '../../lib/fileExtraction'
import { LESSON_LEVELS, LESSON_STYLES, LESSON_TONES, estimateEpisodeCostUsd, formatUsd } from '../../lib/lesson'
import type { EpisodePlan, KeyPoint, LessonLevel, LessonOptions, LessonStyle, LessonTone } from '../../lib/lesson'
import { createLessonId, getCachedPlan, lessonSourceHash, planCacheKey, putCachedPlan, putLesson } from '../../lib/lessonStorage'
import type { LessonSourceKind, StoredLesson } from '../../lib/lessonStorage'
import { clearStoredOwnerAccessCode, getStoredOwnerAccessCode } from '../../lib/ownerAccessCode'
import { getAllSolutions } from '../../lib/solutionStorage'
import type { StoredSolution } from '../../lib/solutionStorage'
import { quizSourceText, solutionSourceText } from '../../lib/sourceText'
import { MAX_QUIZ_WORDS, MAX_SOURCE_TEXT_CHARS, MIN_QUIZ_WORDS, countWords } from '../../lib/textStats'
import InputCard from '../InputCard'
import type { FileTabState, InputTab, UrlTabState } from '../InputCard'
import OwnerAccessGate from '../OwnerAccessGate'
import Select from '../Select'
import { ArchiveIcon, CalculatorIcon, ChevronDownIcon, SearchIcon, SpinnerIcon, SunIcon } from '../icons'

const EMPTY_FILE_STATE: FileTabState = { file: null, fileName: '', fileSizeBytes: 0, extractedText: '', wordCount: 0, truncated: false, isExtracting: false, error: null }
const EMPTY_URL_STATE: UrlTabState = { title: '', extractedText: '', wordCount: 0, truncated: false, isFetching: false, error: null, fetched: false }

type Step = 'form' | 'locked' | 'planning' | 'plan' | 'writing'
type ValidationError = 'empty' | 'too_short' | 'too_long' | 'too_long_chars'

interface PlanState {
  title: string
  keyPoints: KeyPoint[]
  episodes: EpisodePlan[]
  costUsd: number
  reused: boolean
}

interface ResolvedSource {
  text: string
  kind: LessonSourceKind
  label: string
}

interface NewLessonPanelProps {
  onClose: () => void
  requiresAccessCode: boolean
  lessons: StoredLesson[]
  onBusyChange: (busy: boolean) => void
}

const chipClass = (selected: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${selected ? 'border-amber bg-amber/15 text-amber-text' : 'border-warm-border bg-card text-ink hover:border-focus-neutral'}`
const fieldLabel = 'mb-1 block text-[11px] font-bold tracking-wide text-muted uppercase'

export default function NewLessonPanel({ onClose, requiresAccessCode, lessons, onBusyChange }: NewLessonPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const uid = useId()

  const [activeTab, setActiveTab] = useState<InputTab>('text')
  const [textValue, setTextValue] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [fileState, setFileState] = useState<FileTabState>(EMPTY_FILE_STATE)
  const [urlState, setUrlState] = useState<UrlTabState>(EMPTY_URL_STATE)
  const [language, setLanguage] = useState('auto')
  const [picked, setPicked] = useState<{ kind: 'quiz' | 'solution'; label: string; text: string } | null>(null)
  const [picker, setPicker] = useState<'quiz' | 'solution' | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [solutions, setSolutions] = useState<StoredSolution[] | null>(null)

  const [style, setStyle] = useState<LessonStyle>('two_hosts')
  const [level, setLevel] = useState<LessonLevel>('general')
  const [tone, setTone] = useState<LessonTone>('normal')

  const [step, setStep] = useState<Step>('form')
  const [hasError, setHasError] = useState(false)
  const [error, setError] = useState<ValidationError | LessonClientErrorCode | null>(null)
  const [plan, setPlan] = useState<PlanState | null>(null)
  const [showKeyPoints, setShowKeyPoints] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileTokenRef = useRef(0)
  const urlAbortRef = useRef<AbortController | null>(null)

  const archiveEntries = useMemo(() => getArchiveEntries(), [])

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => () => urlAbortRef.current?.abort(), [])
  useEffect(() => onBusyChange(step === 'writing' || step === 'planning'), [step, onBusyChange])
  useEffect(() => {
    if (picker === 'solution' && solutions === null) void getAllSolutions().then(setSolutions)
  }, [picker, solutions])

  const options: LessonOptions = { style, level, tone, language }

  const resetResult = () => {
    setError(null)
    setPlan(null)
    if (step === 'plan') setStep('form')
  }

  const source = (): ResolvedSource => {
    if (activeTab === 'file') return { text: fileState.extractedText, kind: 'file', label: fileState.fileName }
    if (activeTab === 'url') return { text: urlState.extractedText, kind: 'url', label: urlState.title || urlValue.trim() }
    // A picked quiz/solution fills the text tab; it stays that source until the text is cleared.
    if (picked) return { text: textValue, kind: picked.kind, label: picked.label }
    return { text: textValue, kind: 'text', label: '' }
  }

  const wordCount = activeTab === 'text' ? countWords(textValue) : activeTab === 'file' ? fileState.wordCount : urlState.wordCount
  const truncated = activeTab === 'file' ? fileState.truncated : activeTab === 'url' ? urlState.truncated : false

  const validate = (text: string): ValidationError | null => {
    if (!text.trim()) return 'empty'
    if (text.length > MAX_SOURCE_TEXT_CHARS) return 'too_long_chars'
    const words = countWords(text)
    if (words < MIN_QUIZ_WORDS) return 'too_short'
    if (words > MAX_QUIZ_WORDS) return 'too_long'
    return null
  }

  const handleFileSelected = async (file: File) => {
    const token = ++fileTokenRef.current
    resetResult()
    setHasError(false)
    setFileState({ ...EMPTY_FILE_STATE, file, fileName: file.name, fileSizeBytes: file.size, isExtracting: true })
    try {
      const extracted = await extractTextFromFile(file)
      if (fileTokenRef.current !== token) return
      setFileState({ file, fileName: file.name, fileSizeBytes: file.size, extractedText: extracted.text, wordCount: extracted.wordCount, truncated: extracted.truncated, isExtracting: false, error: null })
    } catch (caught) {
      if (fileTokenRef.current !== token) return
      const code: FileErrorCode = caught instanceof FileExtractionError ? caught.code : 'corrupt'
      setFileState({ ...EMPTY_FILE_STATE, file, fileName: file.name, fileSizeBytes: file.size, error: code })
    }
  }

  const handleUrlFetch = async () => {
    const url = urlValue.trim()
    if (!url) {
      setHasError(true)
      return
    }
    resetResult()
    urlAbortRef.current?.abort()
    const controller = new AbortController()
    urlAbortRef.current = controller
    setUrlState({ ...EMPTY_URL_STATE, isFetching: true })
    try {
      const extracted = await extractUrlText(url, controller.signal)
      setUrlState({ title: extracted.title, extractedText: extracted.text, wordCount: extracted.wordCount, truncated: extracted.truncated, isFetching: false, error: null, fetched: true })
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      const code: ExtractUrlErrorCode = caught instanceof ExtractUrlApiError ? caught.code : 'network'
      setUrlState({ ...EMPTY_URL_STATE, error: code })
    }
  }

  const switchToText = (text: string) => {
    setPicked(null)
    setTextValue(text)
    setActiveTab('text')
    resetResult()
  }

  const pickSource = (kind: 'quiz' | 'solution', label: string, text: string) => {
    setTextValue(text)
    setActiveTab('text')
    setPicked({ kind, label, text })
    setPicker(null)
    setPickerSearch('')
    setHasError(false)
    resetResult()
  }

  const fail = (code: LessonClientErrorCode) => {
    if (code === 'locked') {
      // The stored code no longer works (changed on the server): ask for it again.
      clearStoredOwnerAccessCode()
      setStep('locked')
      return
    }
    setError(code)
    setStep(plan ? 'plan' : 'form')
  }

  const handlePlan = async () => {
    setError(null)
    const resolved = source()
    const invalid = validate(resolved.text)
    if (invalid) {
      if (invalid === 'empty') setHasError(true)
      else setError(invalid)
      return
    }
    setHasError(false)
    if (requiresAccessCode && !getStoredOwnerAccessCode()) {
      setStep('locked')
      return
    }
    const key = planCacheKey(resolved.text, level, language)
    const cached = await getCachedPlan(key)
    if (cached) {
      setPlan({ title: cached.title, keyPoints: cached.keyPoints, episodes: cached.episodes, costUsd: 0, reused: true })
      setStep('plan')
      return
    }
    setStep('planning')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await planLesson({ text: resolved.text, level, language }, controller.signal)
      await putCachedPlan({ key, title: result.title, keyPoints: result.keyPoints, episodes: result.episodes })
      setPlan({ title: result.title, keyPoints: result.keyPoints, episodes: result.episodes, costUsd: result.usage.costUsd, reused: false })
      setStep('plan')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      fail(caught instanceof LessonApiError ? caught.code : 'network')
    }
  }

  const handleWrite = async () => {
    if (!plan) return
    const resolved = source()
    setError(null)
    setStep('writing')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await writeLessonEpisode({ text: resolved.text, keyPoints: plan.keyPoints, episodes: plan.episodes, part: 1, ...options }, controller.signal)
      const now = new Date().toISOString()
      const lesson: StoredLesson = {
        id: createLessonId(),
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        title: plan.title || result.episode.title || resolved.label || t('lessons.untitled'),
        sourceKind: resolved.kind,
        sourceLabel: resolved.label,
        sourceText: resolved.text,
        sourceHash: lessonSourceHash(resolved.text, options),
        options,
        keyPoints: plan.keyPoints,
        episodes: plan.episodes.map((episode) =>
          episode.part === 1
            ? { ...episode, script: result.episode, costUsd: result.usage.costUsd, cachedShare: result.usage.cachedShare }
            : { ...episode, script: null, costUsd: null, cachedShare: null },
        ),
        planCostUsd: plan.costUsd,
      }
      const saved = await putLesson(lesson)
      navigate(`/lessons/${saved.id}`)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setStep('plan')
        return
      }
      fail(caught instanceof LessonApiError ? caught.code : 'network')
    }
  }

  const cancelRequest = () => {
    abortRef.current?.abort()
    setStep(plan ? 'plan' : 'form')
  }

  const resolvedForPlan = plan ? source() : null
  const existing = resolvedForPlan ? lessons.find((lesson) => lesson.sourceHash === lessonSourceHash(resolvedForPlan.text, options)) : undefined
  const partCost = resolvedForPlan ? estimateEpisodeCostUsd(resolvedForPlan.text.length) : 0
  const busy = step === 'planning' || step === 'writing'

  const filteredQuizzes = archiveEntries.filter((entry) => !pickerSearch.trim() || entry.title.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
  const filteredSolutions = (solutions ?? []).filter(
    (entry) => !pickerSearch.trim() || `${entry.result.topic} ${entry.result.question}`.toLowerCase().includes(pickerSearch.trim().toLowerCase()),
  )

  return (
    <section data-purpose="new-lesson" className="space-y-5 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold text-navy">{t('lessons.new.heading')}</h2>
        <button type="button" onClick={onClose} disabled={busy} className="text-xs font-semibold text-muted hover:text-ink disabled:opacity-50">
          {t('lessons.new.close')}
        </button>
      </div>

      <fieldset disabled={busy} className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">{t('lessons.new.otherSources')}</span>
          <button type="button" onClick={() => setPicker(picker === 'quiz' ? null : 'quiz')} aria-expanded={picker === 'quiz'} className={chipClass(picker === 'quiz')}>
            <span className="flex items-center gap-1.5">
              <ArchiveIcon className="h-3.5 w-3.5" />
              {t('lessons.new.fromQuiz')}
            </span>
          </button>
          <button type="button" onClick={() => setPicker(picker === 'solution' ? null : 'solution')} aria-expanded={picker === 'solution'} className={chipClass(picker === 'solution')}>
            <span className="flex items-center gap-1.5">
              <CalculatorIcon className="h-3.5 w-3.5" />
              {t('lessons.new.fromSolution')}
            </span>
          </button>
        </div>

        {picker && (
          <div data-purpose="lesson-source-picker" className="space-y-3 rounded-xl border border-warm-border bg-paper p-4">
            <p className="text-sm font-semibold text-ink">{t(picker === 'quiz' ? 'lessons.new.pickQuiz' : 'lessons.new.pickSolution')}</p>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                placeholder={t('lessons.new.pickerSearch')}
                aria-label={t('lessons.new.pickerSearch')}
                className="w-full rounded-lg border border-warm-border bg-card py-2 pr-3 pl-9 text-sm text-ink"
              />
            </div>
            {picker === 'quiz' && archiveEntries.length === 0 && <p className="text-sm text-muted">{t('lessons.new.noQuizzes')}</p>}
            {picker === 'solution' && solutions !== null && solutions.length === 0 && <p className="text-sm text-muted">{t('lessons.new.noSolutions')}</p>}
            <ul className="max-h-64 divide-y divide-warm-border overflow-y-auto rounded-lg border border-warm-border bg-card empty:hidden">
              {picker === 'quiz' &&
                filteredQuizzes.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" onClick={() => pickSource('quiz', entry.title, quizSourceText(entry))} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-paper">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{entry.title}</span>
                      <span className="shrink-0 text-xs text-muted">{t('songsPage.pickerQuestionCount', { count: entry.quiz.questions.length })}</span>
                    </button>
                  </li>
                ))}
              {picker === 'solution' &&
                filteredSolutions.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => pickSource('solution', entry.result.topic || entry.result.question.slice(0, 60), solutionSourceText(entry.result))}
                      className="w-full px-3 py-2.5 text-left hover:bg-paper"
                    >
                      <span className="block truncate text-sm font-medium text-ink">{entry.result.topic || entry.result.question}</span>
                      <span className="block truncate text-xs text-muted">{entry.result.question}</span>
                    </button>
                  </li>
                ))}
            </ul>
            {picker === 'quiz' && archiveEntries.length === 0 && (
              <Link to="/" className="text-xs font-semibold text-amber-text hover:underline">
                {t('archive.empty.cta')}
              </Link>
            )}
          </div>
        )}

        {picked && activeTab === 'text' && (
          <div className="-mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warm-border bg-paper px-4 py-2.5 text-xs">
            <span className="font-medium text-ink">{t('lessons.new.usingSource', { label: picked.label })}</span>
            <button type="button" onClick={() => switchToText('')} className="font-bold text-amber-text hover:underline">
              {t('lessons.new.clearSource')}
            </button>
          </div>
        )}

        <InputCard
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab)
            setHasError(false)
            resetResult()
          }}
          textValue={textValue}
          onTextChange={(value) => {
            setTextValue(value)
            if (!value.trim()) setPicked(null)
            if (value.trim()) setHasError(false)
            resetResult()
          }}
          urlValue={urlValue}
          onUrlChange={(value) => {
            setUrlValue(value)
            setUrlState((current) => (current.fetched || current.error ? EMPTY_URL_STATE : current))
            resetResult()
          }}
          fileState={fileState}
          onFileSelected={(file) => void handleFileSelected(file)}
          onFileRemove={() => {
            fileTokenRef.current++
            setFileState(EMPTY_FILE_STATE)
            resetResult()
          }}
          onEditFileAsText={() => fileState.extractedText && switchToText(fileState.extractedText)}
          urlState={urlState}
          onUrlFetch={() => void handleUrlFetch()}
          onEditUrlAsText={() => urlState.extractedText && switchToText(urlState.extractedText)}
          wordCount={wordCount}
          truncated={truncated}
          outputLanguage={language}
          onOutputLanguageChange={(value) => {
            setLanguage(value)
            resetResult()
          }}
          onClear={() => {
            if (activeTab === 'text') switchToText('')
            if (activeTab === 'url') {
              setUrlValue('')
              setUrlState(EMPTY_URL_STATE)
            }
            if (activeTab === 'file') setFileState(EMPTY_FILE_STATE)
            setHasError(false)
            resetResult()
          }}
          hasError={hasError}
          focusParts={[]}
          onFocusPartsChange={() => {}}
          focusEnabled={false}
          wordLimitKey="lessons.new.wordLimit"
        />

        <section data-purpose="lesson-options" className="space-y-3">
          <h3 className="px-1 text-xs font-bold tracking-wider text-muted uppercase">{t('lessons.new.optionsEyebrow')}</h3>
          <div className="grid rounded-[14px] border border-warm-border bg-card sm:grid-cols-2">
            <div className="border-b border-warm-border p-4 sm:col-span-2">
              <span className={fieldLabel}>{t('lessons.new.lengthLabel')}</span>
              <p className="text-sm font-semibold text-ink">{t('lessons.new.lengthValue')}</p>
            </div>
            <div className="border-b border-warm-border p-4 sm:col-span-2" role="radiogroup" aria-labelledby={`${uid}-style`}>
              <span id={`${uid}-style`} className={fieldLabel}>
                {t('lessons.new.styleLabel')}
              </span>
              <div className="flex flex-wrap gap-2">
                {LESSON_STYLES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={style === value}
                    onClick={() => {
                      setStyle(value)
                      resetResult()
                    }}
                    className={chipClass(style === value)}
                  >
                    {t(`lessons.styles.${value}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-b border-warm-border p-4 sm:border-b-0">
              <span id={`${uid}-level`} className={fieldLabel}>
                {t('lessons.new.levelLabel')}
              </span>
              <Select
                id={`${uid}-level-select`}
                value={level}
                options={LESSON_LEVELS.map((value) => ({ value, label: t(`lessons.levels.${value}`) }))}
                onChange={(value) => {
                  setLevel(value as LessonLevel)
                  resetResult()
                }}
                labelledBy={`${uid}-level`}
              />
            </div>
            <div className="p-4 sm:border-l sm:border-warm-border" role="radiogroup" aria-labelledby={`${uid}-tone`}>
              <span id={`${uid}-tone`} className={fieldLabel}>
                {t('lessons.new.toneLabel')}
              </span>
              <div className="flex flex-wrap gap-2">
                {LESSON_TONES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={tone === value}
                    onClick={() => {
                      setTone(value)
                      resetResult()
                    }}
                    className={chipClass(tone === value)}
                  >
                    {t(`lessons.tones.${value}`)}
                  </button>
                ))}
              </div>
              {tone === 'fun' && <p className="mt-2 text-xs text-muted">{t('lessons.new.toneFunHelp')}</p>}
            </div>
          </div>
        </section>
      </fieldset>

      {step === 'locked' && (
        <OwnerAccessGate
          verify={verifyAndStoreLessonAccessCode}
          onUnlocked={() => {
            setStep('form')
            void handlePlan()
          }}
        />
      )}

      {(step === 'form' || step === 'planning') && (
        <button
          type="button"
          onClick={() => void handlePlan()}
          disabled={step === 'planning'}
          aria-busy={step === 'planning'}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-all hover:-translate-y-px hover:bg-amber-hover hover:shadow-lg hover:shadow-amber/30 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        >
          {step === 'planning' ? <SpinnerIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
          {step === 'planning' ? t('lessons.new.planning') : t('lessons.new.plan')}
        </button>
      )}
      {step === 'planning' && (
        <button type="button" onClick={cancelRequest} className="mx-auto -mt-2 block text-xs font-semibold text-muted hover:text-ink">
          {t('lessons.new.cancel')}
        </button>
      )}

      {error && (
        <div role="alert" className="space-y-3 rounded-[14px] border border-error/40 bg-error/5 p-4 text-center">
          <p className="text-sm font-semibold text-error">{t(`lessons.errors.${error}`)}</p>
          {error !== 'rate_limited' && !['too_short', 'too_long', 'too_long_chars', 'empty'].includes(error) && (
            <button
              type="button"
              onClick={() => void (plan ? handleWrite() : handlePlan())}
              className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
            >
              {t('lessons.errors.retry')}
            </button>
          )}
        </div>
      )}

      {plan && (step === 'plan' || step === 'writing') && (
        <div data-purpose="lesson-plan" className="space-y-4 rounded-[14px] border border-warm-border bg-paper p-4 md:p-5">
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('lessons.plan.heading')}</p>
          <div className="space-y-1">
            <p className="font-serif text-lg font-semibold text-navy">
              {plan.episodes.length > 1 ? t('lessons.plan.series', { count: plan.episodes.length }) : t('lessons.plan.single')}
            </p>
            <button
              type="button"
              onClick={() => setShowKeyPoints((value) => !value)}
              aria-expanded={showKeyPoints}
              className="flex items-center gap-1 text-sm font-semibold text-amber-text hover:underline"
            >
              {t('lessons.plan.keyPoints', { count: plan.keyPoints.length })}
              <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showKeyPoints ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {showKeyPoints && (
            <ol className="space-y-2 text-sm text-ink">
              {plan.episodes.map((episode) => (
                <li key={episode.part} className="space-y-1">
                  {plan.episodes.length > 1 && <p className="text-xs font-bold text-muted">{t('lessons.detail.partTab', { n: episode.part })}</p>}
                  <ul className="list-disc space-y-1 pl-5">
                    {episode.keyPointIds.map((id) => (
                      <li key={id}>{plan.keyPoints.find((point) => point.id === id)?.text}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <p data-purpose="lesson-cost-estimate" className="text-xs text-muted">
            {plan.episodes.length > 1
              ? t('lessons.plan.costSeries', { part: formatUsd(partCost), total: formatUsd(partCost * plan.episodes.length) })
              : t('lessons.plan.costSingle', { part: formatUsd(partCost) })}
          </p>
          {plan.episodes.length > 1 && <p className="text-xs text-muted">{t('lessons.plan.onDemand')}</p>}
          {plan.reused && <p className="text-xs text-muted">{t('lessons.plan.reusedKeyPoints')}</p>}

          {existing && step === 'plan' && (
            <div data-purpose="lesson-existing" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-xs">
              <span className="font-medium text-ink">{t('lessons.plan.existing')}</span>
              <Link to={`/lessons/${existing.id}`} className="rounded-lg bg-amber px-3 py-1.5 font-bold text-navy hover:bg-amber-hover">
                {t('lessons.plan.openExisting')}
              </Link>
            </div>
          )}

          {step === 'writing' ? (
            <div role="status" className="flex flex-col items-center gap-2 py-2 text-center">
              <SpinnerIcon className="h-6 w-6 text-amber" />
              <p className="text-sm font-semibold text-ink">{t('lessons.plan.writing')}</p>
              <button type="button" onClick={cancelRequest} className="text-xs font-semibold text-muted hover:text-ink">
                {t('lessons.new.cancel')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleWrite()}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors ${
                  existing ? 'border-2 border-navy text-navy hover:bg-navy/5' : 'bg-amber text-navy hover:bg-amber-hover'
                }`}
              >
                {existing ? t('lessons.plan.createAnyway') : plan.episodes.length > 1 ? t('lessons.plan.writeFirst') : t('lessons.plan.writeSingle')}
              </button>
              <button type="button" onClick={() => setStep('form')} className="h-11 rounded-xl border border-warm-border bg-card px-5 text-sm font-semibold text-ink hover:border-focus-neutral">
                {t('lessons.plan.back')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
