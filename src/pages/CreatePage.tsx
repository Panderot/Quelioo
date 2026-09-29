import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { GenerateApiError, generateQuiz } from '../api/generateQuiz'
import type { GenerateErrorCode } from '../api/generateQuiz'
import { addArchiveEntry, createArchiveEntryId, updateArchiveEntry } from '../lib/archive'
import { supportsOptionsCount } from '../lib/quizTypes'
import { MAX_QUIZ_WORDS, MIN_QUIZ_WORDS, countWords } from '../lib/textStats'
import type { GeneratedQuiz } from '../lib/quiz'
import GenerateButton from '../components/GenerateButton'
import InputCard from '../components/InputCard'
import type { InputTab } from '../components/InputCard'
import ParameterGrid from '../components/ParameterGrid'
import QuizWorkspace from '../components/QuizWorkspace'

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
  demo: boolean
  sourceText: string
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  questionType: string
}

export default function CreatePage() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const prefillText = (location.state as CreatePageLocationState | null)?.prefillText

  const [activeTab, setActiveTab] = useState<InputTab>('text')
  const [textValue, setTextValue] = useState(prefillText ?? '')
  const [urlValue, setUrlValue] = useState('')
  const [outputLanguage, setOutputLanguage] = useState('auto')

  const [questionType, setQuestionType] = useState('mcq')
  const [questionCount, setQuestionCount] = useState('3')
  const [difficulty, setDifficulty] = useState('medium')
  const [optionsCount, setOptionsCount] = useState('4')

  const [hasError, setHasError] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<GenerateErrorCode | null>(null)
  const [showTabNotSupported, setShowTabNotSupported] = useState(false)
  const [result, setResult] = useState<GeneratedResult | null>(null)

  const resultRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (prefillText) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  useEffect(() => {
    if (!result) return
    resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [result?.entryId]) // eslint-disable-line react-hooks/exhaustive-deps

  const wordCount = useMemo(() => countWords(textValue), [textValue])

  const activeContent = activeTab === 'text' ? textValue : activeTab === 'url' ? urlValue : ''

  const handleTabChange = (tab: InputTab) => {
    setActiveTab(tab)
    setHasError(false)
    setGenerateError(null)
    setShowTabNotSupported(false)
  }

  const handleClear = () => {
    if (activeTab === 'text') setTextValue('')
    if (activeTab === 'url') setUrlValue('')
    setHasError(false)
    setGenerateError(null)
  }

  const handleTextChange = (value: string) => {
    setTextValue(value)
    if (value.trim()) setHasError(false)
    setGenerateError(null)
  }

  const handleUrlChange = (value: string) => {
    setUrlValue(value)
    if (value.trim()) setHasError(false)
  }

  const persistEntry = (entryId: string, quiz: GeneratedQuiz) => {
    updateArchiveEntry(entryId, (entry) => ({ ...entry, title: quiz.title, quiz }))
  }

  const handleGenerate = async () => {
    setShowTabNotSupported(false)
    setGenerateError(null)

    if (activeTab !== 'text') {
      setShowTabNotSupported(true)
      return
    }

    if (!activeContent.trim()) {
      setHasError(true)
      return
    }

    if (wordCount < MIN_QUIZ_WORDS) {
      setGenerateError('too_short')
      return
    }
    if (wordCount > MAX_QUIZ_WORDS) {
      setGenerateError('too_long')
      return
    }

    setHasError(false)
    setResult(null)
    setIsGenerating(true)

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const uiLanguage = i18n.language
      const needsOptionsCount = supportsOptionsCount(questionType)
      const generated = await generateQuiz(
        {
          text: activeContent,
          questionType,
          questionCount,
          difficulty,
          optionsCount: needsOptionsCount ? optionsCount : undefined,
          outputLanguage,
          uiLanguage,
        },
        controller.signal,
      )

      const id = createArchiveEntryId()
      addArchiveEntry({
        id,
        title: generated.title || firstWords(activeContent, 6) || t('archive.untitled'),
        createdAt: new Date().toISOString(),
        source: activeTab,
        questionType,
        difficulty,
        questionCount,
        optionsCount: needsOptionsCount ? optionsCount : null,
        outputLanguage,
        sourceText: activeContent,
        quiz: { title: generated.title, questions: generated.questions },
        demo: generated.demo,
        studyMode: false,
      })

      setResult({
        entryId: id,
        quiz: { title: generated.title, questions: generated.questions },
        demo: generated.demo,
        sourceText: activeContent,
        difficulty,
        optionsCount: needsOptionsCount ? optionsCount : undefined,
        outputLanguage,
        questionType,
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
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">
          {t('hero.title')}
        </h1>
        <p className="text-sm font-normal text-muted">{t('hero.subtitle')}</p>
      </section>

      <InputCard
        activeTab={activeTab}
        onTabChange={handleTabChange}
        textValue={textValue}
        onTextChange={handleTextChange}
        urlValue={urlValue}
        onUrlChange={handleUrlChange}
        wordCount={wordCount}
        outputLanguage={outputLanguage}
        onOutputLanguageChange={setOutputLanguage}
        onClear={handleClear}
        hasError={hasError}
      />

      <ParameterGrid
        questionType={questionType}
        onQuestionTypeChange={setQuestionType}
        questionCount={questionCount}
        onQuestionCountChange={setQuestionCount}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        optionsCount={optionsCount}
        onOptionsCountChange={setOptionsCount}
      />

      <GenerateButton isLoading={isGenerating} onClick={() => void handleGenerate()} />

      {showTabNotSupported && (
        <div className="-mt-4 space-y-3 rounded-[14px] border border-warm-border bg-card p-5 text-center">
          <p className="text-sm font-medium text-ink">{t('create.notSupported.message')}</p>
          <button
            type="button"
            onClick={() => handleTabChange('text')}
            className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
          >
            {t('create.notSupported.switchTab')}
          </button>
        </div>
      )}

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

      {result && (
        <div ref={resultRef} className="-mt-4">
          <QuizWorkspace
            key={result.entryId}
            initialQuiz={result.quiz}
            demo={result.demo}
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
            uiLanguage={i18n.language}
            onPersist={(quiz) => persistEntry(result.entryId, quiz)}
            archiveLink={{ href: `/archive/${result.entryId}`, label: t('cta.viewInArchive') }}
          />
        </div>
      )}
    </>
  )
}
