import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { generateQuiz } from '../api/generateQuiz'
import { addArchiveEntry, createArchiveEntryId } from '../lib/archive'
import { supportsOptionsCount } from '../lib/quizTypes'
import GenerateButton from '../components/GenerateButton'
import InputCard from '../components/InputCard'
import type { InputTab } from '../components/InputCard'
import ParameterGrid from '../components/ParameterGrid'

function countWords(value: string): number {
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
}

function firstWords(value: string, maxWords: number): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ')
}

interface CreatePageLocationState {
  prefillText?: string
}

export default function CreatePage() {
  const { t } = useTranslation()
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
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null)

  useEffect(() => {
    if (prefillText) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const wordCount = useMemo(() => countWords(textValue), [textValue])

  const activeContent = activeTab === 'text' ? textValue : activeTab === 'url' ? urlValue : ''

  const handleTabChange = (tab: InputTab) => {
    setActiveTab(tab)
    setHasError(false)
    setSavedQuizId(null)
  }

  const handleClear = () => {
    if (activeTab === 'text') setTextValue('')
    if (activeTab === 'url') setUrlValue('')
    setHasError(false)
    setSavedQuizId(null)
  }

  const handleTextChange = (value: string) => {
    setTextValue(value)
    if (value.trim()) setHasError(false)
    setSavedQuizId(null)
  }

  const handleUrlChange = (value: string) => {
    setUrlValue(value)
    if (value.trim()) setHasError(false)
    setSavedQuizId(null)
  }

  const handleGenerate = async () => {
    if (!activeContent.trim()) {
      setHasError(true)
      return
    }

    setHasError(false)
    setSavedQuizId(null)
    setIsGenerating(true)
    try {
      await generateQuiz({
        source: activeTab,
        content: activeContent,
        outputLanguage,
        questionType,
        questionCount,
        difficulty,
        optionsCount,
      })

      const id = createArchiveEntryId()
      addArchiveEntry({
        id,
        title: firstWords(activeContent, 6) || t('archive.untitled'),
        createdAt: new Date().toISOString(),
        source: activeTab,
        questionType,
        difficulty,
        questionCount,
        optionsCount: supportsOptionsCount(questionType) ? optionsCount : null,
        studyMode: false,
      })
      setSavedQuizId(id)
    } finally {
      setIsGenerating(false)
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

      <GenerateButton isLoading={isGenerating} onClick={handleGenerate} />

      {savedQuizId && (
        <p data-purpose="generate-success" role="status" className="-mt-4 pb-6 text-sm font-medium text-success">
          {t('cta.success')}{' '}
          <Link to="/archive" className="font-semibold text-amber-hover hover:underline">
            {t('cta.viewInArchive')}
          </Link>
        </p>
      )}
    </>
  )
}
