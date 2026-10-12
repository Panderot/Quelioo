import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ExamApiError } from '../api/exam'
import ExamHeaderFields from '../components/exam/ExamHeaderFields'
import { ExamIcon, SpinnerIcon } from '../components/icons'
import InputCard from '../components/InputCard'
import Select from '../components/Select'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useExamSource } from '../hooks/useExamSource'
import { getAuthState } from '../lib/auth/authStore'
import { clearSetupDraft, purgeStaleDrafts, readSetupDraft, writeSetupDraft } from '../lib/exam/drafts'
import { newExamId } from '../lib/exam/factory'
import { ExamShortSourceError, generateExamQuestions, reduceCounts } from '../lib/exam/generate'
import type { ExamGenerationState } from '../lib/exam/generate'
import { createExam, loadExamDefaults, saveExamDefaults } from '../lib/exam/store'
import { EXAM_LEVELS, EXAM_QUESTION_TYPES, MAX_EXAM_QUESTIONS, MAX_EXAM_TYPE_QUESTIONS, defaultExamSettings, totalQuestionCount } from '../lib/exam/types'
import type { ExamLevel, ExamQuestionType, ExamSettings, WrittenExam } from '../lib/exam/types'
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
  const mixSum = settings.difficultyMix.easy + settings.difficultyMix.medium + settings.difficultyMix.hard
  const durationValid = Number.isInteger(settings.durationMinutes) && settings.durationMinutes >= 5 && settings.durationMinutes <= 300
  const countsValid = total >= 1 && total <= MAX_EXAM_QUESTIONS
  const canGenerate = countsValid && mixSum === 100 && durationValid && !generating

  const levelOptions = useMemo(
    () => EXAM_LEVELS.map((level) => ({ value: level, label: /^\d+$/.test(level) ? t('exam.setup.levelGrade', { grade: level }) : t(`exam.setup.level.${level}`) })),
    [t],
  )

  const setCount = (type: ExamQuestionType, raw: string) => {
    const value = Math.min(MAX_EXAM_TYPE_QUESTIONS, Math.max(0, Number.parseInt(raw, 10) || 0))
    patch({ counts: { ...settings.counts, [type]: value } })
  }

  const handleGenerate = async (acceptMax?: number) => {
    setError(null)
    setShortSource(null)
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
    const counts = acceptMax === undefined ? settings.counts : reduceCounts(settings.counts, acceptMax)
    const finalSettings: ExamSettings = { ...settings, counts, topics: topicsText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30) }
    if (acceptMax !== undefined) setSettings((current) => ({ ...current, counts }))
    const signature = JSON.stringify([text, finalSettings.counts, finalSettings.difficultyMix, finalSettings.level, finalSettings.outputLanguage, finalSettings.contextBased, finalSettings.optionsCount, finalSettings.topics])
    // The plan of the source does not depend on how many questions are asked for: it survives a smaller exam.
    if (generationRef.current?.signature !== signature) generationRef.current = { signature, state: { done: new Map(), plan: generationRef.current?.state.plan } }
    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ done: 0, total: 1, phase: 'plan' })
    try {
      const questions = await generateExamQuestions({
        settings: finalSettings,
        text,
        state: generationRef.current.state,
        acceptFewer: acceptMax !== undefined,
        signal: controller.signal,
        onProgress: (done, totalSections, phase) => setProgress({ done, total: totalSections, phase }),
      })
      if (questions.length === 0) throw new ExamApiError('upstream')
      const now = new Date().toISOString()
      const exam: WrittenExam = {
        id: newExamId(),
        title: defaultTitle(finalSettings, t),
        settings: finalSettings,
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
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      if (caught instanceof ExamShortSourceError) {
        setShortSource(caught.max)
        return
      }
      setError(caught instanceof ExamApiError ? caught.code : 'upstream')
    } finally {
      setProgress(null)
    }
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
              patch({ header })
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
                min={5}
                max={300}
                value={Number.isFinite(settings.durationMinutes) ? settings.durationMinutes : ''}
                onChange={(event) => patch({ durationMinutes: Number.parseInt(event.target.value, 10) })}
                className="h-11 w-full rounded-[10px] border border-warm-border bg-card px-3.5 text-sm text-ink hover:border-focus-neutral"
              />
            </div>
            <div className="space-y-1.5">
              <span id="exam-level-label" className="block text-xs font-bold text-ink">
                {t('exam.setup.levelLabel')}
              </span>
              <Select id="exam-level" labelledBy="exam-level-label" value={settings.level} options={levelOptions} onChange={(value) => patch({ level: value as ExamLevel })} />
            </div>
          </div>
        </section>

        <section data-purpose="exam-setup-counts" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">{t('exam.setup.questionsTitle')}</h2>
            <p data-purpose="exam-total-count" className={`text-xs font-semibold ${countsValid ? 'text-muted' : 'text-error'}`}>
              {t('exam.setup.total', { count: total })}
            </p>
          </div>
          <p className="text-xs text-muted">{t('exam.setup.countsHint', { max: MAX_EXAM_TYPE_QUESTIONS, total: MAX_EXAM_QUESTIONS })}</p>
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
              <input type="checkbox" checked={settings[key]} onChange={(event) => patch({ [key]: event.target.checked })} className="h-4 w-4 accent-amber" />
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
                <button type="button" data-purpose="exam-short-dismiss" onClick={() => setShortSource(null)} className="min-h-10 rounded-xl border border-warm-border bg-card px-4 text-sm font-bold text-navy hover:border-amber">
                  {t('exam.shortSource.dismiss')}
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
  const parts = [grade ? t('exam.setup.titleGrade', { grade }) : '', course, t('exam.setup.titleExam', { term, no: examNo })].filter(Boolean)
  return parts.join(' ').slice(0, 200)
}
