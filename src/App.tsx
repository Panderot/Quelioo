import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { generateQuiz } from './api/generateQuiz'
import GenerateButton from './components/GenerateButton'
import InputCard from './components/InputCard'
import type { InputTab } from './components/InputCard'
import ParameterGrid from './components/ParameterGrid'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'

function countWords(value: string): number {
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
}

export default function App() {
  const { t } = useTranslation()

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const [activeTab, setActiveTab] = useState<InputTab>('text')
  const [textValue, setTextValue] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [youtubeValue, setYoutubeValue] = useState('')
  const [outputLanguage, setOutputLanguage] = useState('auto')
  const [studyMode, setStudyMode] = useState(false)

  const [questionType, setQuestionType] = useState('mcq')
  const [questionCount, setQuestionCount] = useState('3')
  const [difficulty, setDifficulty] = useState('medium')
  const [optionsCount, setOptionsCount] = useState('4')

  const [hasError, setHasError] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const wordCount = useMemo(() => countWords(textValue), [textValue])

  const activeContent =
    activeTab === 'text' ? textValue : activeTab === 'url' ? urlValue : activeTab === 'youtube' ? youtubeValue : ''

  const handleTabChange = (tab: InputTab) => {
    setActiveTab(tab)
    setHasError(false)
  }

  const handleClear = () => {
    if (activeTab === 'text') setTextValue('')
    if (activeTab === 'url') setUrlValue('')
    if (activeTab === 'youtube') setYoutubeValue('')
    setHasError(false)
  }

  const handleTextChange = (value: string) => {
    setTextValue(value)
    if (value.trim()) setHasError(false)
  }

  const handleUrlChange = (value: string) => {
    setUrlValue(value)
    if (value.trim()) setHasError(false)
  }

  const handleYoutubeChange = (value: string) => {
    setYoutubeValue(value)
    if (value.trim()) setHasError(false)
  }

  const handleGenerate = async () => {
    if (!activeContent.trim()) {
      setHasError(true)
      return
    }

    setHasError(false)
    setIsGenerating(true)
    try {
      await generateQuiz({
        source: activeTab,
        content: activeContent,
        outputLanguage,
        studyMode,
        questionType,
        questionCount,
        difficulty,
        optionsCount,
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-0 md:p-6 lg:p-8">
      <div
        data-purpose="app-viewport-card"
        className="flex min-h-[92vh] w-full max-w-[1520px] flex-col overflow-hidden rounded-none border border-blue-100/40 bg-white shadow-2xl md:rounded-3xl lg:flex-row"
      >
        <Sidebar isMobileOpen={isMobileNavOpen} onCloseMobile={() => setIsMobileNavOpen(false)} />

        <main data-purpose="main-layout" className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white">
          <TopBar onOpenMobileNav={() => setIsMobileNavOpen(true)} freeRunsRemaining={20} />

          <div className="mx-auto w-full max-w-5xl space-y-7 p-6 lg:p-8 xl:p-10">
            <section data-purpose="page-intro" className="space-y-2">
              <h1 className="text-2xl leading-snug font-extrabold tracking-tight text-slate-900 lg:text-3xl">
                {t('hero.title')}
              </h1>
              <p className="text-sm font-normal text-slate-500">{t('hero.subtitle')}</p>
            </section>

            <InputCard
              activeTab={activeTab}
              onTabChange={handleTabChange}
              textValue={textValue}
              onTextChange={handleTextChange}
              urlValue={urlValue}
              onUrlChange={handleUrlChange}
              youtubeValue={youtubeValue}
              onYoutubeChange={handleYoutubeChange}
              wordCount={wordCount}
              outputLanguage={outputLanguage}
              onOutputLanguageChange={setOutputLanguage}
              onClear={handleClear}
              studyMode={studyMode}
              onStudyModeChange={setStudyMode}
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
          </div>
        </main>
      </div>
    </div>
  )
}
