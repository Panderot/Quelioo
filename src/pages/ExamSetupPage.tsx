import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ExamApiError } from '../api/exam'
import ExamHeaderFields from '../components/exam/ExamHeaderFields'
import InfoTip from '../components/exam/InfoTip'
import { ExamIcon, SpinnerIcon } from '../components/icons'
import InputCard from '../components/InputCard'
import Select from '../components/Select'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useExamSource } from '../hooks/useExamSource'
import { getAuthState } from '../lib/auth/authStore'
import { clearSetupDraft, purgeStaleDrafts, readSetupDraft, writeSetupDraft } from '../lib/exam/drafts'
import { newExamId, settingsWithHeader } from '../lib/exam/factory'
import { bloomTargetCounts, countsForBloom, planBloom } from '../lib/exam/bloom'
import { ExamDistributionError, ExamShortSourceError, generateExamQuestions, reduceCounts } from '../lib/exam/generate'
import type { ExamGenerationState } from '../lib/exam/generate'
import { buildMemory, earlierFromMemories, memoriesForSource } from '../lib/exam/sourceMemory'
import type { StoredMemory } from '../lib/exam/sourceMemory'
import { createExam, listSourceMemories, loadExamDefaults, saveExamDefaults } from '../lib/exam/store'
import { BLOOM_SETTINGS, EXAM_MAX_MINUTES, EXAM_MIN_MINUTES, EXAM_QUESTION_TYPES, MAX_EXAM_QUESTIONS, MAX_EXAM_TYPE_QUESTIONS, defaultExamSettings, emptyCounts, maxQuestionsForWords, totalQuestionCount } from '../lib/exam/types'
import type { BloomLevel, BloomSetting, ExamDistributionRow, ExamFormat, ExamQuestion, ExamQuestionType, ExamSettings, WrittenExam } from '../lib/exam/types'
import { MAX_QUIZ_WORDS, MAX_SOURCE_TEXT_CHARS, MIN_QUIZ_WORDS } from '../lib/textStats'

const COUNT_LABEL_KEYS: Record<ExamQuestionType, string> = {
  'open-ended': 'exam.setup.types.openEnded',
  'short-answer': 'exam.setup.types.shortAnswer',
  'fill-blanks': 'exam.setup.types.fillBlanks',
  'true-false': 'exam.setup.types.trueFalse',
  mcq: 'exam.setup.types.mcq',
  matching: 'exam.setup.types.matching',
}

interface SetupDraft {
  textValue: string
  activeTab: 'text' | 'file' | 'url'
  urlValue: string
  settings: ExamSettings
  topicsText: string
}

function isSetupDraft(value: unknown): value is SetupDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<SetupDraft>
  return typeof draft.textValue === 'string' && typeof draft.settings === 'object' && draft.settings !== null && typeof draft.topicsText === 'string'
}

/** /exams/new?d=<id>: every press of "New written exam" brings a new id, so a new exam never starts from an old form. */
export default function ExamSetupPage() {
  const [params] = useSearchParams()
  const setupId = params.get('d') ?? ''
  return <ExamSetup key={setupId} setupId={setupId} />
}

function ExamSetup({ setupId }: { setupId: string }) {
  const { t } = useTranslation()
  useDocumentTitle(t('exam.setup.title'))
  const navigate = useNavigate()
  const userId = getAuthState().user?.id ?? ''

  const [initial] = useState(() => {
    if (!userId || !setupId) return null
    const stored = readSetupDraft(userId, setupId)?.value
    return isSetupDraft(stored) ? stored : null
  })
  const source = useExamSource({ textValue: initial?.textValue, activeTab: initial?.activeTab, urlValue: initial?.urlValue })
  const [settings, setSettings] = useState<ExamSettings>(() => (initial ? { ...defaultExamSettings(), ...initial.settings, header: { ...defaultExamSettings().header, ...initial.settings.header } } : defaultExamSettings()))
  const [topicsText, setTopicsText] = useState(initial?.topicsText ?? '')
  const [progress, setProgress] = useState<{ done: number; total: number; phase: 'plan' | 'write' | 'check' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState(false)
  /** The source holds fewer distinct facts than questions asked for: how many questions it can carry. */
  const [shortSource, setShortSource] = useState<number | null>(null)
  /** Rows of the teacher's own distribution that the source has too little content for. */
  const [shortRows, setShortRows] = useState<{ row: number; text: string; wanted: number; found: number }[] | null>(null)
  /** The exam came out with questions missing: what passed, waiting for the teacher's choice (nothing is saved yet). */
  const [partial, setPartial] = useState<{ questions: ExamQuestion[]; requested: number; missing: number; settings: ExamSettings; text: string } | null>(null)
  const generationRef = useRef<{ signature: string; state: ExamGenerationState } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const generating = progress !== null
  const headerTouched = useRef(initial !== null)

  // The teacher's remembered header (school, name, course ...) fills a fresh form.
  useEffect(() => {
    if (headerTouched.current) return
    let cancelled = false
    void loadExamDefaults().then((header) => {
      if (cancelled || headerTouched.current || !header) return
      setSettings((current) => ({ ...current, header: { ...current.header, ...header, academicYear: current.header.academicYear } }))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (userId) purgeStaleDrafts(userId, Date.now())
  }, [userId])

  // What the teacher's earlier exams remember about their sources (V1): a new exam from the same source avoids what they tested.
  const [memories, setMemories] = useState<StoredMemory[]>([])
  useEffect(() => {
    let cancelled = false
    void listSourceMemories().then((stored) => {
      if (!cancelled) setMemories(stored)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const deferredSource = useDeferredValue(source.content)
  const sameSource = useMemo(() => (deferredSource.trim().split(/\s+/).length >= 30 ? memoriesForSource(deferredSource, memories) : []), [deferredSource, memories])

  // The form (not the extracted file/page text) survives a reload for a few days.
  useEffect(() => {
    if (!userId || !setupId) return undefined
    const timer = window.setTimeout(() => {
      const draft: SetupDraft = { textValue: source.textValue, activeTab: source.activeTab, urlValue: source.urlValue, settings, topicsText }
      writeSetupDraft(userId, setupId, draft)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [userId, setupId, source.textValue, source.activeTab, source.urlValue, settings, topicsText])

  useEffect(() => () => abortRef.current?.abort(), [])

  const patch = (change: Partial<ExamSettings>) => {
    setSettings((current) => ({ ...current, ...change }))
    setError(null)
  }
  const total = totalQuestionCount(settings.counts)
  const earlierFacts = useMemo(() => new Set(earlierFromMemories(sameSource).map((entry) => entry.fact)).size, [sameSource])
  // Few enough words that the new exam cannot avoid everything the earlier ones tested.
  const previousNote = sameSource.length > 0 && maxQuestionsForWords(source.wordCount) < earlierFacts + totalQuestionCount(settings.counts)
  const mixSum = settings.difficultyMix.easy + settings.difficultyMix.medium + settings.difficultyMix.hard
  const durationValid = settings.durationMinutes === null || (Number.isInteger(settings.durationMinutes) && settings.durationMinutes >= EXAM_MIN_MINUTES && settings.durationMinutes <= EXAM_MAX_MINUTES)
  const meb = settings.format === 'meb'
  const distributionOn = settings.distribution.length > 0
  const distributionSum = settings.distribution.reduce((sum, row) => sum + row.count, 0)
  const distributionValid = !distributionOn || (distributionSum === total && settings.distribution.every((row) => row.text.trim() && row.count > 0))
  const bloomTargets = useMemo(() => bloomTargetCounts(settings.bloom, settings.level, total), [settings.bloom, settings.level, total])
  const bloomPlan = useMemo(() => planBloom(settings.counts, bloomTargets), [settings.counts, bloomTargets])
  const countsValid = total >= 1 && total <= MAX_EXAM_QUESTIONS
  const canGenerate = countsValid && mixSum === 100 && durationValid && distributionValid && !generating

  const bloomOptions = useMemo(() => BLOOM_SETTINGS.map((value) => ({ value, label: t(`exam.setup.bloom.${value}`) })), [t])
  const formatOptions = useMemo(() => (['free', 'meb'] as ExamFormat[]).map((value) => ({ value, label: t(`exam.setup.format.${value}`) })), [t])
  const bloomName = (level: BloomLevel) => t(`exam.bloom.names.${level}`)
  const bloomPreview = ([1, 2, 3, 4, 5, 6] as BloomLevel[]).filter((level) => bloomPlan.achieved[level - 1] > 0).map((level) => `${bloomName(level)} ${bloomPlan.achieved[level - 1]}`).join(' · ')

  const previousCounts = useRef<Record<ExamQuestionType, number> | null>(null)
  const setFormat = (format: ExamFormat) => {
    if (format === settings.format) return
    if (format === 'meb') {
      previousCounts.current = settings.counts
      const open = settings.counts['open-ended']
      const short = settings.counts['short-answer']
      const counts = { ...emptyCounts(), 'open-ended': open + short === 0 ? 5 : open, 'short-answer': open + short === 0 ? 5 : short }
      patch({ format, counts, answerKey: true })
    } else {
      patch({ format, counts: previousCounts.current ?? settings.counts })
    }
  }
  const setDistribution = (distribution: ExamDistributionRow[]) => patch({ distribution })
  const setRow = (index: number, change: Partial<ExamDistributionRow>) => setDistribution(settings.distribution.map((row, position) => (position === index ? { ...row, ...change } : row)))

  const setCount = (type: ExamQuestionType, raw: string) => {
    const value = Math.min(MAX_EXAM_TYPE_QUESTIONS, Math.max(0, Number.parseInt(raw, 10) || 0))
    patch({ counts: { ...settings.counts, [type]: value } })
  }

  const handleGenerate = async (acceptMax?: number) => {
    setError(null)
    setShortSource(null)
    setShortRows(null)
    setPartial(null)
    const text = source.content.trim()
    if (!text) {
      setSourceError(true)
      source.markError()
      setError('empty')
      return
    }
    setSourceError(false)
    if (source.wordCount < MIN_QUIZ_WORDS) {
      setError('too_short')
      return
    }
    if (source.wordCount > MAX_QUIZ_WORDS) {
      setError('too_long')
      return
    }
    // A source this short cannot carry the questions asked for: say so before any AI call is made.
    const byWords = maxQuestionsForWords(source.wordCount)
    if (acceptMax === undefined && total > byWords) {
      setShortSource(byWords)
      return
    }
    const counts = acceptMax === undefined ? settings.counts : reduceCounts(settings.counts, acceptMax)
    // MEB common written exam: open-ended and short-answer questions only, the key and the grading rubric always on.
    const mebCounts = settings.format === 'meb' ? { ...emptyCounts(), 'open-ended': counts['open-ended'], 'short-answer': counts['short-answer'] } : counts
    const finalSettings: ExamSettings = { ...settings, counts: mebCounts, ...(settings.format === 'meb' ? { answerKey: true } : {}), topics: topicsText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30) }
    if (acceptMax !== undefined) setSettings((current) => ({ ...current, counts }))
    const signature = JSON.stringify([text, finalSettings.counts, finalSettings.difficultyMix, finalSettings.level, finalSettings.outputLanguage, finalSettings.contextBased, finalSettings.optionsCount, finalSettings.topics, finalSettings.bloom, finalSettings.format, finalSettings.distribution, finalSettings.header.course])
    // The plan of the source does not depend on how many questions are asked for: it survives a smaller exam.
    if (generationRef.current?.signature !== signature) generationRef.current = { signature, state: { done: new Map(), plan: generationRef.current?.state.plan, planKey: generationRef.current?.state.planKey } }
    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ done: 0, total: 1, phase: 'plan' })
    try {
      const result = await generateExamQuestions({
        settings: finalSettings,
        text,
        state: generationRef.current.state,
        acceptFewer: acceptMax !== undefined,
        earlier: earlierFromMemories(sameSource),
        signal: controller.signal,
        onProgress: (done, totalSections, phase) => setProgress({ done, total: totalSections, phase }),
      })
      if (result.questions.length === 0) throw new ExamApiError('upstream')
      // Questions that could not be written without breaking a rule are left out; nothing is saved until the teacher chooses.
      if (result.missing > 0) {
        setPartial({ questions: result.questions, requested: result.requested, missing: result.missing, settings: finalSettings, text })
        return
      }
      await saveFinished(result.questions, finalSettings, text)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      if (caught instanceof ExamShortSourceError) {
        setShortSource(caught.max)
        return
      }
      if (caught instanceof ExamDistributionError) {
        setShortRows(caught.rows)
        return
      }
      setError(caught instanceof ExamApiError ? caught.code : 'upstream')
    } finally {
      setProgress(null)
    }
  }

  /** Saves one finished exam (the only place an exam is created, so a retry never makes a second one). */
  const saveFinished = async (questions: ExamQuestion[], finalSettings: ExamSettings, text: string) => {
    const counts = emptyCounts()
    for (const question of questions) counts[question.type] += 1
    const now = new Date().toISOString()
    const exam: WrittenExam = {
      id: newExamId(),
      title: defaultTitle(finalSettings, t),
      settings: { ...finalSettings, counts, sourceMemory: buildMemory(text, questions) },
      questions,
      sourceQuizId: null,
      sourceText: text.slice(0, MAX_SOURCE_TEXT_CHARS),
      createdAt: now,
      updatedAt: now,
    }
    const saved = await createExam(exam)
    if (saved.status !== 'ok') {
      setError('save')
      return
    }
    void saveExamDefaults(finalSettings.header)
    if (userId && setupId) clearSetupDraft(userId, setupId)
    generationRef.current = null
    navigate(`/exams/${exam.id}`)
  }

  /** Back to the source: the text and the settings stay as they are. */
  const goToSource = () => {
    setShortSource(null)
    setShortRows(null)
    setPartial(null)
    const field = document.getElementById('quiz-content-input')
    field?.scrollIntoView({ block: 'center' })
    field?.focus()
  }

  const errorKey = error === null ? null : ['empty', 'too_short', 'too_long', 'model', 'not_configured', 'rate_limited', 'unauthorized', 'network', 'quality', 'save'].includes(error) ? error : 'upstream'

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold text-navy">
          <ExamIcon className="h-7 w-7 text-amber-text" />
          {t('exam.setup.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted">{t('exam.setup.intro')}</p>
      </section>

      <div className="space-y-7">
        <InputCard
          activeTab={source.activeTab}
          onTabChange={source.setTab}
          textValue={source.textValue}
          onTextChange={source.setText}
          urlValue={source.urlValue}
          onUrlChange={source.setUrl}
          fileState={source.fileState}
          onFileSelected={(file) => void source.selectFile(file)}
          onFileRemove={source.removeFile}
          onEditFileAsText={source.editFileAsText}
          urlState={source.urlState}
          onUrlFetch={() => void source.fetchUrl()}
          onEditUrlAsText={source.editUrlAsText}
          wordCount={source.wordCount}
          truncated={source.truncated}
          outputLanguage={settings.outputLanguage}
          onOutputLanguageChange={(value) => patch({ outputLanguage: value })}
          onClear={source.clear}
          hasError={source.hasError || sourceError}
          wordLimitKey="exam.setup.wordLimit"
          focusParts={[]}
          onFocusPartsChange={() => undefined}
          focusEnabled={false}
        />

        <section className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
          <label htmlFor="exam-topics" className="block text-sm font-bold text-ink">
            {t('exam.setup.topics')}
          </label>
          <p className="text-xs text-muted">{t('exam.setup.topicsHint')}</p>
          <textarea
            id="exam-topics"
            value={topicsText}
            rows={3}
            onChange={(event) => setTopicsText(event.target.value)}
            className="w-full rounded-[10px] border border-warm-border bg-card px-3.5 py-2.5 text-sm text-ink hover:border-focus-neutral"
          />
        </section>

        <section data-purpose="exam-setup-header" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
          <h2 className="text-sm font-bold text-ink">{t('exam.setup.headerTitle')}</h2>
          <ExamHeaderFields
            header={settings.header}
            onChange={(header) => {
              headerTouched.current = true
              setSettings((current) => settingsWithHeader(current, header))
              setError(null)
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="exam-duration" className="block text-xs font-bold text-ink">
                {t('exam.setup.duration')}
              </label>
              <input
                id="exam-duration"
                type="number"
                min={EXAM_MIN_MINUTES}
                max={EXAM_MAX_MINUTES}
                step={1}
                value={settings.durationMinutes ?? ''}
                aria-invalid={!durationValid}
                onChange={(event) => patch({ durationMinutes: event.target.value === '' ? null : Number(event.target.value) })}
                className={`h-11 w-full rounded-[10px] border bg-card px-3.5 text-sm text-ink hover:border-focus-neutral ${durationValid ? 'border-warm-border' : 'border-error'}`}
              />
              <p data-purpose="exam-duration-hint" className={`text-xs ${durationValid ? 'text-muted' : 'font-semibold text-error'}`}>
                {t('exam.setup.durationHint', { min: EXAM_MIN_MINUTES, max: EXAM_MAX_MINUTES })}
              </p>
            </div>
          </div>
        </section>

        <section data-purpose="exam-setup-counts" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">{t('exam.setup.questionsTitle')}</h2>
            <p data-purpose="exam-total-count" className={`text-xs font-semibold ${countsValid ? 'text-muted' : 'text-error'}`}>
              {t('exam.setup.total', { count: total })}
            </p>
            {total >= 30 && countsValid && (
              <p data-purpose="exam-estimate" className="text-xs text-muted">
                {t('exam.setup.estimate', { count: total, minutes: Math.ceil((total * 4.5) / 60) })}
              </p>
            )}
          </div>
          <p className="text-xs text-muted">{t('exam.setup.countsHint', { max: MAX_EXAM_TYPE_QUESTIONS, total: MAX_EXAM_QUESTIONS })}</p>
          {previousNote && (
            <p data-purpose="exam-previous-note" className="text-xs font-semibold text-navy">
              {t('exam.setup.previousExams', { count: sameSource.length })}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXAM_QUESTION_TYPES.map((type) => (
              <div key={type} className="space-y-1.5">
                <label htmlFor={`exam-count-${type}`} className="block text-xs font-bold text-ink">
                  {t(COUNT_LABEL_KEYS[type])}
                </label>
                <input
                  id={`exam-count-${type}`}
                  type="number"
                  min={0}
                  max={MAX_EXAM_TYPE_QUESTIONS}
                  value={settings.counts[type]}
                  disabled={meb && type !== 'open-ended' && type !== 'short-answer'}
                  onChange={(event) => setCount(type, event.target.value)}
                  className="h-11 w-full rounded-[10px] border border-warm-border bg-card px-3.5 text-sm text-ink hover:border-focus-neutral"
                />
              </div>
            ))}
          </div>
          {settings.counts.mcq > 0 && (
            <div className="max-w-xs space-y-1.5">
              <span id="exam-options-label" className="block text-xs font-bold text-ink">
                {t('exam.setup.optionsCount')}
              </span>
              <Select
                id="exam-options"
                labelledBy="exam-options-label"
                value={String(settings.optionsCount)}
                options={[4, 5].map((count) => ({ value: String(count), label: t('exam.setup.optionsValue', { count }) }))}
                onChange={(value) => patch({ optionsCount: value === '5' ? 5 : 4 })}
              />
            </div>
          )}
        </section>

        <section data-purpose="exam-setup-bloom" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
          <h2 className="text-sm font-bold text-ink">{t('exam.setup.bloomTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span id="exam-bloom-label" className="block text-xs font-bold text-ink">
                  {t('exam.setup.bloomLabel')}
                </span>
                <InfoTip label={t('exam.setup.bloomInfoLabel')} text={t('exam.setup.bloomInfo')} />
              </div>
              <Select id="exam-bloom" labelledBy="exam-bloom-label" value={settings.bloom} options={bloomOptions} onChange={(value) => patch({ bloom: value as BloomSetting })} />
            </div>
            <div className="space-y-1.5">
              <span id="exam-format-label" className="block text-xs font-bold text-ink">
                {t('exam.setup.formatLabel')}
              </span>
              <Select id="exam-format" labelledBy="exam-format-label" value={settings.format} options={formatOptions} onChange={(value) => setFormat(value as ExamFormat)} />
            </div>
          </div>
          {bloomPreview && (
            <p data-purpose="exam-bloom-preview" className="text-xs font-semibold text-muted">
              {t('exam.setup.bloomPreview', { parts: bloomPreview })}
            </p>
          )}
          {bloomPlan.capped.map((entry) => (
            <p key={`${entry.type}-${entry.wanted}`} data-purpose="exam-bloom-note" className="text-xs font-semibold text-navy">
              {t(entry.wanted >= 5 ? 'exam.setup.bloomCapOpen' : 'exam.setup.bloomCapMcq', { type: t(COUNT_LABEL_KEYS[entry.type]), cap: bloomName(entry.used), wanted: bloomName(entry.wanted) })}
            </p>
          ))}
          {bloomPlan.capped.length > 0 && !meb && (
            <button
              type="button"
              data-purpose="exam-bloom-adjust"
              onClick={() => patch({ counts: countsForBloom(settings.counts, bloomTargets) })}
              className="inline-flex min-h-9 items-center rounded-[10px] border border-warm-border bg-card px-3.5 text-xs font-bold text-navy hover:border-focus-neutral"
            >
              {t('exam.setup.bloomAdjust')}
            </button>
          )}
          {meb && (
            <p data-purpose="exam-meb-hint" className="text-xs text-muted">
              {t('exam.setup.formatMebHint')}
            </p>
          )}
          <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              data-purpose="exam-distribution-toggle"
              checked={distributionOn}
              onChange={(event) => setDistribution(event.target.checked ? [{ text: '', count: total }] : [])}
              className="h-4 w-4 accent-amber"
            />
            {t('exam.setup.distributionToggle')}
          </label>
          {distributionOn && (
            <div data-purpose="exam-distribution" className="space-y-2">
              <p className="text-xs text-muted">{t('exam.setup.distributionHint')}</p>
              {settings.distribution.map((row, index) => (
                <div key={index} className="flex items-center gap-2" data-purpose="exam-distribution-row">
                  <input
                    aria-label={t('exam.setup.distributionRowText', { number: index + 1 })}
                    value={row.text}
                    maxLength={300}
                    placeholder={t('exam.setup.distributionPlaceholder')}
                    onChange={(event) => setRow(index, { text: event.target.value })}
                    className="h-11 min-w-0 flex-1 rounded-[10px] border border-warm-border bg-card px-3.5 text-sm text-ink hover:border-focus-neutral"
                  />
                  <input
                    type="number"
                    min={1}
                    max={MAX_EXAM_QUESTIONS}
                    aria-label={t('exam.setup.distributionRowCount', { number: index + 1 })}
                    value={row.count}
                    onChange={(event) => setRow(index, { count: Math.min(MAX_EXAM_QUESTIONS, Math.max(0, Number.parseInt(event.target.value, 10) || 0)) })}
                    className="h-11 w-20 rounded-[10px] border border-warm-border bg-card px-3 text-sm text-ink hover:border-focus-neutral"
                  />
                  <button
                    type="button"
                    aria-label={t('exam.setup.distributionRemove', { number: index + 1 })}
                    onClick={() => setDistribution(settings.distribution.filter((_, position) => position !== index))}
                    className="h-11 min-w-11 rounded-[10px] border border-warm-border text-sm font-bold text-navy hover:border-amber"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  data-purpose="exam-distribution-add"
                  onClick={() => setDistribution([...settings.distribution, { text: '', count: 1 }])}
                  className="min-h-9 rounded-lg border border-warm-border px-3 text-xs font-bold text-navy hover:border-amber"
                >
                  {t('exam.setup.distributionAdd')}
                </button>
                <p data-purpose="exam-distribution-sum" className={`text-xs font-semibold ${distributionValid ? 'text-muted' : 'text-error'}`}>
                  {t('exam.setup.distributionSum', { sum: distributionSum, total })}
                </p>
              </div>
            </div>
          )}
        </section>

        <section data-purpose="exam-setup-mix" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">{t('exam.setup.mixTitle')}</h2>
            <p data-purpose="exam-mix-sum" className={`text-xs font-semibold ${mixSum === 100 ? 'text-muted' : 'text-error'}`}>
              {mixSum === 100 ? t('exam.setup.mixOk') : t('exam.setup.mixBad', { sum: mixSum })}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {(['easy', 'medium', 'hard'] as const).map((level) => (
              <div key={level} className="space-y-1.5">
                <label htmlFor={`exam-mix-${level}`} className="block text-xs font-bold text-ink">
                  {t(`exam.setup.mix.${level}`)}
                </label>
                <input
                  id={`exam-mix-${level}`}
                  type="number"
                  min={0}
                  max={100}
                  value={settings.difficultyMix[level]}
                  onChange={(event) => patch({ difficultyMix: { ...settings.difficultyMix, [level]: Math.min(100, Math.max(0, Number.parseInt(event.target.value, 10) || 0)) } })}
                  className="h-11 w-full rounded-[10px] border border-warm-border bg-card px-3.5 text-sm text-ink hover:border-focus-neutral"
                />
              </div>
            ))}
          </div>
        </section>

        <section data-purpose="exam-setup-options" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
          <h2 className="text-sm font-bold text-ink">{t('exam.setup.optionsTitle')}</h2>
          {(
            [
              ['contextBased', 'exam.setup.contextBased'],
              ['answerKey', 'exam.setup.answerKey'],
              ['groups', 'exam.setup.groups'],
              ['topicTable', 'exam.setup.topicTable'],
              ['footer', 'exam.setup.footer'],
            ] as const
          ).map(([key, labelKey]) => (
            <label key={key} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={settings[key]} disabled={meb && key === 'answerKey'} onChange={(event) => patch({ [key]: event.target.checked })} className="h-4 w-4 accent-amber" />
              {t(labelKey)}
            </label>
          ))}
        </section>

        <section className="space-y-3 pb-6">
          {shortSource !== null && (
            <div role="status" data-purpose="exam-short-source" className="space-y-2 rounded-[14px] border border-amber/50 bg-amber/10 p-4 text-center">
              <p className="text-sm font-semibold text-navy">{t('exam.shortSource.message', { max: shortSource })}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" data-purpose="exam-short-continue" onClick={() => void handleGenerate(shortSource)} disabled={generating} className="min-h-10 rounded-xl bg-amber px-4 text-sm font-bold text-navy hover:bg-amber-hover disabled:opacity-60">
                  {t('exam.shortSource.continue', { max: shortSource })}
                </button>
                <button type="button" data-purpose="exam-short-add-text" onClick={goToSource} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber">
                  {t('exam.shortSource.addText')}
                </button>
                <button type="button" data-purpose="exam-short-dismiss" onClick={() => setShortSource(null)} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber">
                  {t('exam.shortSource.dismiss')}
                </button>
              </div>
            </div>
          )}
          {shortRows !== null && (
            <div role="status" data-purpose="exam-short-rows" className="space-y-2 rounded-[14px] border border-amber/50 bg-amber/10 p-4 text-center">
              {shortRows.map((row) => (
                <p key={row.row} className="text-sm font-semibold text-navy">
                  {t('exam.distributionShort.row', { row: row.text, found: row.found, wanted: row.wanted })}
                </p>
              ))}
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" data-purpose="exam-rows-add-text" onClick={goToSource} className="min-h-10 rounded-xl bg-amber px-4 text-sm font-bold text-navy hover:bg-amber-hover">
                  {t('exam.shortSource.addText')}
                </button>
                <button type="button" data-purpose="exam-rows-continue" onClick={() => void handleGenerate(total)} disabled={generating} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber disabled:opacity-60">
                  {t('exam.distributionShort.continue')}
                </button>
                <button type="button" data-purpose="exam-rows-dismiss" onClick={() => setShortRows(null)} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber">
                  {t('exam.distributionShort.change')}
                </button>
              </div>
            </div>
          )}
          {partial && (
            <div role="status" data-purpose="exam-partial" className="space-y-3 rounded-[14px] border border-amber/50 bg-amber/10 p-4 text-center">
              <p className="text-sm font-semibold text-navy">{t('exam.partial.message', { ready: partial.questions.length, missing: partial.missing })}</p>
              {partial.missing / partial.requested > 0.2 && <p data-purpose="exam-partial-recommend" className="text-sm text-navy">{t('exam.partial.recommend')}</p>}
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" data-purpose="exam-partial-add-text" onClick={goToSource} disabled={generating} className={`min-h-10 rounded-xl px-4 text-sm font-bold text-navy disabled:opacity-60 ${partial.missing / partial.requested > 0.2 ? 'order-first bg-amber hover:bg-amber-hover' : 'border border-warm-border bg-card hover:border-amber'}`}>
                  {t('exam.partial.addText')}
                </button>
                <button type="button" data-purpose="exam-partial-continue" onClick={() => void saveFinished(partial.questions, partial.settings, partial.text)} disabled={generating} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber disabled:opacity-60">
                  {t('exam.partial.continue', { ready: partial.questions.length })}
                </button>
                <button type="button" data-purpose="exam-partial-retry" onClick={() => void handleGenerate()} disabled={generating} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber disabled:opacity-60">
                  {t('exam.partial.retry')}
                </button>
              </div>
            </div>
          )}
          {errorKey && (
            <div role="alert" data-purpose="exam-generate-error" className="space-y-2 rounded-[14px] border border-error/40 bg-error/5 p-4 text-center">
              <p className="text-sm font-semibold text-error">{t(`exam.errors.${errorKey}`)}</p>
              {error !== 'empty' && error !== 'too_short' && error !== 'too_long' && (
                <button type="button" data-purpose="exam-retry" onClick={() => void handleGenerate()} disabled={!canGenerate} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber disabled:opacity-60">
                  {t('exam.errors.retry')}
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            data-purpose="exam-generate"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            aria-busy={generating}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-all hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {generating && <SpinnerIcon className="h-5 w-5 text-navy" />}
            <span className="tracking-wide">{generating ? t('exam.setup.generating') : t('exam.setup.generate')}</span>
          </button>
          {progress && (
            <p role="status" data-purpose="exam-progress" className="text-center text-xs font-semibold text-muted">
              {progress.phase === 'write' ? t('exam.setup.progress', { done: progress.done, total: progress.total }) : t(`exam.setup.phase.${progress.phase}`)}
            </p>
          )}
        </section>
      </div>
    </>
  )
}

function defaultTitle(settings: ExamSettings, t: (key: string, options?: Record<string, unknown>) => string): string {
  const { course, grade, term, examNo } = settings.header
  const cleanGrade = grade.trim().replace(/[.]+$/, '')
  const parts = [cleanGrade ? (/^\d+$/.test(cleanGrade) ? t('exam.setup.titleGrade', { grade: cleanGrade }) : cleanGrade) : '', course.trim(), t('exam.setup.titleExam', { term, no: examNo })]
  // Only the parts that are filled in, joined by single spaces.
  return parts.map((part) => part.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 200)
}
