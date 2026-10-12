import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ExamApiError, generateExamRubric, regenerateExamQuestion } from '../api/exam'
import { LoadError, SkeletonList } from '../components/DataStates'
import ExamHeaderFields from '../components/exam/ExamHeaderFields'
import ExportCheckDialog from '../components/exam/ExportCheckDialog'
import PaperPreview from '../components/exam/PaperPreview'
import QuestionEditor from '../components/exam/QuestionEditor'
import { ExamIcon, PlusIcon, RotateLeftIcon, SpinnerIcon } from '../components/icons'
import ConfirmDialog from '../components/live/ConfirmDialog'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getAuthState } from '../lib/auth/authStore'
import { chooseVersion, clearDraft, readDraft, writeDraft } from '../lib/exam/drafts'
import type { ExamDraft } from '../lib/exam/drafts'
import { appendQuestion, examTotal, moveQuestion, moveQuestionTo, removeQuestion, updateQuestion, withStartingPoints } from '../lib/exam/edit'
import { blankQuestion, settingsWithHeader } from '../lib/exam/factory'
import { examPaperLang } from '../lib/exam/paperLabels'
import { exportIssues } from '../lib/exam/problems'
import { rescalePoints, scaleRubric, setQuestionPoints } from '../lib/exam/points'
import { correctAnswerText, repeatsExistingQuestion } from '../lib/exam/quality'
import { getExam, saveExam } from '../lib/exam/store'
import { EXAM_MAX_MINUTES, EXAM_MIN_MINUTES, EXAM_QUESTION_TYPES, EXAM_TOTAL_POINTS } from '../lib/exam/types'
import type { ExamQuestion, ExamQuestionType, WrittenExam } from '../lib/exam/types'
import { getPublicSiteUrl } from '../lib/publicSite'

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'failed' } | { status: 'ready'; exam: WrittenExam; draft: ExamDraft | null }
type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'gone'

const SAVE_DELAY_MS = 1200
const DRAFT_DELAY_MS = 300
const COALESCE_MS = 1500
const MAX_UNDO = 60

const TYPE_LABEL_KEYS: Record<ExamQuestionType, string> = {
  'open-ended': 'exam.setup.types.openEnded',
  'short-answer': 'exam.setup.types.shortAnswer',
  'fill-blanks': 'exam.setup.types.fillBlanks',
  'true-false': 'exam.setup.types.trueFalse',
  mcq: 'exam.setup.types.mcq',
  matching: 'exam.setup.types.matching',
}

/** /exams/:id: the editor. Keyed by id so opening another exam starts from a clean state. */
export default function ExamEditorPage() {
  const { id } = useParams<{ id: string }>()
  return <ExamEditorLoader key={id} id={id ?? ''} />
}

function ExamEditorLoader({ id }: { id: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const userId = getAuthState().user?.id ?? ''

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const server = await getExam(id)
        if (cancelled) return
        const draft = userId ? readDraft(userId, id) : null
        const choice = chooseVersion(draft, server)
        if (!server && !draft) {
          setState({ status: 'missing' })
          return
        }
        if (choice === 'server' && userId) clearDraft(userId, id)
        if (choice === 'draft' && draft) {
          setState({ status: 'ready', exam: draft.exam, draft: null })
          return
        }
        setState({ status: 'ready', exam: server as WrittenExam, draft: choice === 'ask' ? draft : null })
      } catch {
        if (!cancelled) setState({ status: 'failed' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, userId, attempt])

  if (state.status === 'loading') return <SkeletonList rows={3} />
  if (state.status === 'failed') return <LoadError onRetry={() => setAttempt((value) => value + 1)} />
  if (state.status === 'missing') {
    return (
      <div data-purpose="exam-not-found" className="flex flex-col items-center gap-3 rounded-[14px] border border-warm-border bg-card p-10 text-center">
        <ExamIcon className="h-8 w-8 text-muted" />
        <p className="text-sm font-semibold text-ink">{t('exam.edit.notFound')}</p>
        <Link to="/exams" className="rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy hover:border-amber">
          {t('exam.edit.backToList')}
        </Link>
      </div>
    )
  }
  return <ExamEditor initial={state.exam} pendingDraft={state.draft} userId={userId} />
}

interface ExamEditorProps {
  initial: WrittenExam
  pendingDraft: ExamDraft | null
  userId: string
}

function ExamEditor({ initial, pendingDraft, userId }: ExamEditorProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  useDocumentTitle(initial.title)

  const [exam, setExam] = useState<WrittenExam>(initial)
  const [choice, setChoice] = useState<ExamDraft | null>(pendingDraft)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [undoDepth, setUndoDepth] = useState(0)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const [addType, setAddType] = useState<ExamQuestionType>('open-ended')
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [rubricBusy, setRubricBusy] = useState<string | null>(null)
  const [notices, setNotices] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [exportError, setExportError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pendingExport, setPendingExport] = useState<{ run: () => void | Promise<void> } | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const examRef = useRef(exam)
  const baseRef = useRef(initial.updatedAt)
  const historyRef = useRef<WrittenExam[]>([])
  const lastEditRef = useRef<{ key: string; at: number } | null>(null)
  const versionRef = useRef(0)
  const savedVersionRef = useRef(0)
  const savingRef = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const draftTimer = useRef<number | null>(null)
  const conflictRef = useRef(false)
  const choiceOpen = choice !== null

  const runSave = useCallback(async () => {
    if (savingRef.current || conflictRef.current) return
    if (versionRef.current === savedVersionRef.current) return
    savingRef.current = true
    const sentVersion = versionRef.current
    const sent = examRef.current
    setSaveState('saving')
    const result = await saveExam(sent, baseRef.current)
    savingRef.current = false
    if (result.status === 'ok') {
      baseRef.current = result.updatedAt
      savedVersionRef.current = sentVersion
      if (versionRef.current === sentVersion) {
        if (userId) clearDraft(userId, sent.id)
        setSaveState('saved')
      } else {
        setSaveState('dirty')
        void runSave()
      }
    } else if (result.status === 'conflict') {
      conflictRef.current = true
      setSaveState('conflict')
    } else if (result.status === 'missing') {
      conflictRef.current = true
      setSaveState('gone')
    } else {
      setSaveState('error')
    }
  }, [userId])

  const scheduleSave = useCallback(() => {
    versionRef.current += 1
    if (conflictRef.current) return
    setSaveState((current) => (current === 'saving' ? current : 'dirty'))
    if (draftTimer.current) window.clearTimeout(draftTimer.current)
    draftTimer.current = window.setTimeout(() => {
      if (userId) writeDraft(userId, examRef.current, baseRef.current)
    }, DRAFT_DELAY_MS)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void runSave(), SAVE_DELAY_MS)
  }, [runSave, userId])

  /** Makes `next` the current exam; edits to the same field within 1.5 s form one undo step. */
  const commit = useCallback(
    (next: WrittenExam, coalesce?: string) => {
      const now = Date.now()
      const last = lastEditRef.current
      const joins = coalesce !== undefined && last !== null && last.key === coalesce && now - last.at < COALESCE_MS
      if (!joins) {
        historyRef.current = [...historyRef.current.slice(-(MAX_UNDO - 1)), examRef.current]
        setUndoDepth(historyRef.current.length)
      }
      lastEditRef.current = coalesce === undefined ? null : { key: coalesce, at: now }
      examRef.current = next
      setExam(next)
      scheduleSave()
    },
    [scheduleSave],
  )

  const undo = () => {
    const previous = historyRef.current.pop()
    if (!previous) return
    setUndoDepth(historyRef.current.length)
    lastEditRef.current = null
    examRef.current = previous
    setExam(previous)
    scheduleSave()
  }

  // Leaving the page: write what is pending now (the draft already covers a closed tab).
  useEffect(() => {
    const timers = { saveTimer, draftTimer }
    return () => {
      if (timers.saveTimer.current) window.clearTimeout(timers.saveTimer.current)
      if (timers.draftTimer.current) window.clearTimeout(timers.draftTimer.current)
      if (versionRef.current !== savedVersionRef.current) {
        if (userId) writeDraft(userId, examRef.current, baseRef.current)
        if (!conflictRef.current) void saveExam(examRef.current, baseRef.current)
      }
    }
  }, [userId])

  const useDraftCopy = () => {
    if (!choice) return
    examRef.current = choice.exam
    setExam(choice.exam)
    setChoice(null)
    scheduleSave()
  }
  const useServerCopy = () => {
    if (userId) clearDraft(userId, initial.id)
    setChoice(null)
  }

  const reloadFromServer = async () => {
    const fresh = await getExam(initial.id)
    if (!fresh) {
      setSaveState('gone')
      return
    }
    if (userId) clearDraft(userId, initial.id)
    historyRef.current = []
    setUndoDepth(0)
    baseRef.current = fresh.updatedAt
    examRef.current = fresh
    versionRef.current = 0
    savedVersionRef.current = 0
    conflictRef.current = false
    setExam(fresh)
    setSaveState('saved')
  }

  const total = examTotal(exam)
  const paperLang = examPaperLang(exam)
  const totalOk = total === EXAM_TOTAL_POINTS
  const minutes = exam.settings.durationMinutes
  const durationValid = minutes === null || (Number.isInteger(minutes) && minutes >= EXAM_MIN_MINUTES && minutes <= EXAM_MAX_MINUTES)
  const canRegenerate = exam.sourceText.trim().length > 0

  const patchQuestion = (question: ExamQuestion, coalesce?: string) => commit(updateQuestion(examRef.current, question.id, () => question), coalesce ? `${question.id}:${coalesce}` : undefined)

  const regenerate = async (question: ExamQuestion) => {
    if (regenerating) return
    setRegenerating(question.id)
    setNotices((current) => ({ ...current, [question.id]: '' }))
    const { settings } = examRef.current
    try {
      const others = examRef.current.questions.filter((other) => other.id !== question.id)
      const rejected: string[] = []
      let fresh: ExamQuestion | null = null
      // The new question must not repeat another one (stem, answer, scenario); a repeat is asked for once more.
      for (let attempt = 0; attempt < 2 && fresh === null; attempt += 1) {
        const candidate = await regenerateExamQuestion({
          text: examRef.current.sourceText,
          type: question.type,
          difficulty: question.difficulty,
          level: settings.level,
          outputLanguage: settings.outputLanguage,
          contextBased: settings.contextBased,
          optionsCount: settings.optionsCount,
          topics: settings.topics,
          avoidStems: [...others.map((other) => other.stem), ...rejected].slice(-40),
          avoidAnswers: [...others, question].map(correctAnswerText).filter(Boolean).slice(-40),
          avoidFacts: [...others, question].map((other) => other.fact).filter((fact): fact is string => Boolean(fact)).slice(-40),
          course: settings.header.course,
          slots: [{ bloom: question.bloomLevel ?? 2, difficulty: question.difficulty }],
          ...(question.type === 'true-false' && question.answerBool !== undefined ? { trueFalseAnswer: question.answerBool } : {}),
          replaceStem: question.stem,
        })
        // The replaced question counts as an existing one too: the new question is a different fact or form, never the same one reworded.
        if (repeatsExistingQuestion(candidate, [...others, question])) rejected.push(candidate.stem)
        else fresh = candidate
      }
      if (!fresh) throw new ExamApiError('quality')
      commit(updateQuestion(examRef.current, question.id, (current) => setQuestionPoints({ ...fresh, id: current.id, ...(current.bloomLevel !== undefined ? { bloomLevel: current.bloomLevel } : {}) }, current.points)))
    } catch (error) {
      setNotices((current) => ({ ...current, [question.id]: t(`exam.errors.${error instanceof ExamApiError ? error.code : 'upstream'}`, { defaultValue: t('exam.errors.upstream') }) }))
    } finally {
      setRegenerating(null)
    }
  }

  const generateRubric = async (question: ExamQuestion) => {
    if (rubricBusy) return
    setRubricBusy(question.id)
    setNotices((current) => ({ ...current, [question.id]: '' }))
    try {
      const rubric = await generateExamRubric({ stem: question.stem, answer: question.answer, type: question.type, outputLanguage: examRef.current.settings.outputLanguage, level: examRef.current.settings.level })
      commit(updateQuestion(examRef.current, question.id, (current) => ({ ...current, rubric: scaleRubric(rubric, current.points) })))
    } catch (error) {
      setNotices((current) => ({ ...current, [question.id]: t(`exam.errors.${error instanceof ExamApiError ? error.code : 'upstream'}`, { defaultValue: t('exam.errors.upstream') }) }))
    } finally {
      setRubricBusy(null)
    }
  }

  const handleDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault()
    const moving = dragRef.current
    dragRef.current = null
    setDragId(null)
    setOverId(null)
    if (!moving || moving === targetId) return
    const to = examRef.current.questions.findIndex((question) => question.id === targetId)
    commit(moveQuestionTo(examRef.current, moving, to))
  }

  /** Runs an export; first tells the teacher about a points total other than 100, an empty course or class and unfinished questions. */
  const guarded = (run: () => void | Promise<void>) => {
    if (exportIssues(examRef.current) === null) void run()
    else setPendingExport({ run })
  }

  const openPrint = async (part: 'exam' | 'key', group: 'A' | 'B' | 'both') => {
    // The print view reads the saved copy: save first.
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    if (!conflictRef.current) {
      while (savingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 50))
      await runSave()
    }
    window.open(`${getPublicSiteUrl()}/exams/${exam.id}/print?part=${part}&group=${group}`, '_blank')
  }

  const download = async (kind: 'exam' | 'key' | 'groupB' | 'zip') => {
    if (exporting) return
    setExporting(true)
    setExportError(false)
    try {
      const docx = await import('../lib/exam/docx')
      const current = examRef.current
      if (kind === 'zip') {
        const bytes = await docx.buildExamZip(current)
        docx.downloadBlob(bytes, docx.examZipName(current), 'application/zip')
      } else {
        const part = kind === 'key' ? 'key' : 'exam'
        const group = kind === 'groupB' ? 'B' : kind === 'key' && current.settings.groups ? 'both' : 'A'
        const bytes = await docx.buildExamDocx(current, part, group)
        docx.downloadBlob(bytes, docx.examFileName(current, part, group), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      }
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  const outline = useMemo(() => exam.questions.map((question) => question.id), [exam.questions])
  const saveLabel = t(`exam.edit.save.${saveState}`)
  const buttonClass = 'min-h-10 rounded-xl border border-warm-border bg-card px-3.5 text-sm font-semibold text-ink transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <>
      <section data-purpose="page-intro" className="space-y-3">
        <Link to="/exams" className="text-xs font-bold text-amber-text hover:underline">
          ← {t('exam.edit.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <ExamIcon className="h-7 w-7 shrink-0 text-amber-text" />
          <label className="sr-only" htmlFor="exam-title">
            {t('exam.edit.title')}
          </label>
          <input
            id="exam-title"
            data-purpose="exam-title"
            value={exam.title}
            maxLength={200}
            onChange={(event) => commit({ ...examRef.current, title: event.target.value }, 'title')}
            className="min-w-[12rem] flex-1 basis-full rounded-lg border border-transparent sm:basis-0 bg-transparent px-2 py-1 font-serif text-2xl font-semibold text-navy hover:border-warm-border focus:border-warm-border"
          />
          <p role="status" data-purpose="exam-save-state" data-state={saveState} className={`text-xs font-semibold ${saveState === 'error' || saveState === 'conflict' || saveState === 'gone' ? 'text-error' : 'text-muted'}`}>
            {saveLabel}
          </p>
        </div>
      </section>

      {choiceOpen && (
        <div role="alert" data-purpose="exam-draft-choice" className="space-y-3 rounded-[14px] border border-amber/60 bg-amber/10 p-4">
          <p className="text-sm font-semibold text-ink">{t('exam.edit.draftChoice')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-purpose="exam-use-draft" onClick={useDraftCopy} className={buttonClass}>
              {t('exam.edit.useDraft')}
            </button>
            <button type="button" data-purpose="exam-use-server" onClick={useServerCopy} className={buttonClass}>
              {t('exam.edit.useServer')}
            </button>
          </div>
        </div>
      )}

      {(saveState === 'conflict' || saveState === 'gone') && (
        <div role="alert" data-purpose="exam-conflict" className="space-y-3 rounded-[14px] border border-error/50 bg-error/5 p-4">
          <p className="text-sm font-semibold text-error">{saveState === 'conflict' ? t('exam.edit.conflict') : t('exam.edit.gone')}</p>
          {saveState === 'conflict' ? (
            <button type="button" data-purpose="exam-reload" onClick={() => void reloadFromServer()} className={buttonClass}>
              {t('exam.edit.reload')}
            </button>
          ) : (
            <button type="button" onClick={() => navigate('/exams')} className={buttonClass}>
              {t('exam.edit.backToList')}
            </button>
          )}
        </div>
      )}
      {saveState === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-error/50 bg-error/5 p-4">
          <p className="text-sm font-semibold text-error">{t('exam.edit.saveFailed')}</p>
          <button type="button" onClick={() => void runSave()} className={buttonClass}>
            {t('exam.errors.retry')}
          </button>
        </div>
      )}

      <div className="flex gap-2 lg:hidden" role="tablist" aria-label={t('exam.edit.view')}>
        {(['edit', 'preview'] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={mobileView === view}
            data-purpose={`exam-view-${view}`}
            onClick={() => setMobileView(view)}
            className={`min-h-10 flex-1 rounded-xl border px-3 text-sm font-semibold ${mobileView === view ? 'border-amber bg-amber/15 text-navy' : 'border-warm-border bg-card text-ink'}`}
          >
            {t(`exam.edit.view_${view}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className={`space-y-4 ${mobileView === 'edit' ? '' : 'hidden lg:block'}`}>
      <section data-purpose="exam-toolbar" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p data-purpose="exam-total" data-valid={totalOk} className={`text-sm font-bold ${totalOk ? 'text-ink' : 'text-error'}`}>
                {t('exam.edit.total', { total, max: EXAM_TOTAL_POINTS })}
              </p>
              {!totalOk && <span role="alert" className="text-xs font-semibold text-error">{t('exam.edit.totalWarning', { total })}</span>}
              <button type="button" data-purpose="exam-redistribute" onClick={() => commit({ ...examRef.current, questions: rescalePoints(examRef.current.questions, EXAM_TOTAL_POINTS) })} disabled={exam.questions.length === 0} className={buttonClass}>
                {t('exam.edit.redistribute')}
              </button>
              <button type="button" data-purpose="exam-undo" onClick={undo} disabled={undoDepth === 0} className={`${buttonClass} inline-flex items-center gap-1.5`}>
                <RotateLeftIcon className="h-4 w-4" />
                {t('exam.edit.undo')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-warm-border pt-4">
              <label className="text-xs font-bold text-ink" htmlFor="exam-add-type">
                {t('exam.edit.addQuestion')}
              </label>
              <select id="exam-add-type" value={addType} onChange={(event) => setAddType(event.target.value as ExamQuestionType)} className="h-10 rounded-xl border border-warm-border bg-card px-3 text-sm text-ink">
                {EXAM_QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(TYPE_LABEL_KEYS[type])}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-purpose="exam-add-question"
                onClick={() => commit(appendQuestion(examRef.current, withStartingPoints(blankQuestion(addType))))}
                disabled={exam.questions.length >= 40}
                className={`${buttonClass} inline-flex items-center gap-1.5`}
              >
                <PlusIcon className="h-4 w-4" />
                {t('exam.edit.add')}
              </button>
            </div>

            <div data-purpose="exam-output" className="space-y-2 border-t border-warm-border pt-4">
              <p className="text-xs font-bold text-ink">{t('exam.edit.output')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-purpose="exam-print" onClick={() => guarded(() => openPrint('exam', 'A'))} disabled={exam.questions.length === 0} className={buttonClass}>
                  {t('exam.edit.printExam')}
                </button>
                {exam.settings.answerKey && (
                  <button type="button" data-purpose="exam-print-key" onClick={() => guarded(() => openPrint('key', exam.settings.groups ? 'both' : 'A'))} disabled={exam.questions.length === 0} className={buttonClass}>
                    {t('exam.edit.printKey')}
                  </button>
                )}
                {exam.settings.groups && (
                  <button type="button" data-purpose="exam-print-b" onClick={() => guarded(() => openPrint('exam', 'B'))} disabled={exam.questions.length === 0} className={buttonClass}>
                    {t('exam.edit.printGroupB')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-purpose="exam-docx" onClick={() => guarded(() => download('exam'))} disabled={exporting || exam.questions.length === 0} className={buttonClass}>
                  {t('exam.edit.wordExam')}
                </button>
                {exam.settings.answerKey && (
                  <button type="button" data-purpose="exam-docx-key" onClick={() => guarded(() => download('key'))} disabled={exporting || exam.questions.length === 0} className={buttonClass}>
                    {t('exam.edit.wordKey')}
                  </button>
                )}
                {exam.settings.groups && (
                  <button type="button" data-purpose="exam-docx-b" onClick={() => guarded(() => download('groupB'))} disabled={exporting || exam.questions.length === 0} className={buttonClass}>
                    {t('exam.edit.wordGroupB')}
                  </button>
                )}
                <button type="button" data-purpose="exam-docx-zip" onClick={() => guarded(() => download('zip'))} disabled={exporting || exam.questions.length === 0} className={buttonClass}>
                  {exporting ? <SpinnerIcon className="inline h-4 w-4" /> : t('exam.edit.wordAll')}
                </button>
              </div>
              {exportError && (
                <p role="alert" className="text-xs font-semibold text-error">
                  {t('exam.edit.exportFailed')}
                </p>
              )}
            </div>

            {(!exam.settings.header.course.trim() || !exam.settings.header.grade.trim()) && (
              <p data-purpose="exam-header-hint" role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber/60 bg-amber/10 px-3 py-2 text-xs font-semibold text-navy">
                {t('exam.edit.headerHint')}
                <button type="button" data-purpose="exam-header-hint-open" onClick={() => setDetailsOpen(true)} className="font-bold text-amber-text hover:underline">
                  {t('exam.edit.headerHintOpen')}
                </button>
              </p>
            )}
            <details className="border-t border-warm-border pt-4" data-purpose="exam-details" open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
              <summary className="cursor-pointer text-sm font-bold text-ink">{t('exam.edit.details')}</summary>
              <div className="mt-4 space-y-4">
                <ExamHeaderFields header={exam.settings.header} onChange={(header) => commit({ ...examRef.current, settings: settingsWithHeader(examRef.current.settings, header) }, 'header')} idPrefix="editor-header" />
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="editor-duration" className="block text-xs font-bold text-ink">
                      {t('exam.setup.duration')}
                    </label>
                    <input
                      id="editor-duration"
                      type="number"
                      min={EXAM_MIN_MINUTES}
                      max={EXAM_MAX_MINUTES}
                      step={1}
                      value={exam.settings.durationMinutes ?? ''}
                      aria-invalid={!durationValid}
                      onChange={(event) => commit({ ...examRef.current, settings: { ...examRef.current.settings, durationMinutes: event.target.value === '' ? null : Number(event.target.value) } }, 'duration')}
                      className={`h-11 w-28 rounded-[10px] border bg-card px-3.5 text-sm text-ink ${durationValid ? 'border-warm-border' : 'border-error'}`}
                    />
                  </div>
                  {(
                    [
                      ['answerKey', 'exam.setup.answerKey'],
                      ['groups', 'exam.setup.groups'],
                      ['topicTable', 'exam.setup.topicTable'],
                      ['footer', 'exam.setup.footer'],
                    ] as const
                  ).map(([key, labelKey]) => (
                    <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={exam.settings[key]} onChange={(event) => commit({ ...examRef.current, settings: { ...examRef.current.settings, [key]: event.target.checked } })} className="h-4 w-4 accent-amber" />
                      {t(labelKey)}
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </section>
          <div data-purpose="exam-questions" className="space-y-4">
          {exam.questions.length === 0 && <p className="rounded-[14px] border border-dashed border-warm-border p-6 text-center text-sm text-muted">{t('exam.edit.noQuestions')}</p>}
          {exam.questions.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              number={index + 1}
              count={exam.questions.length}
              onChange={patchQuestion}
              onMove={(delta) => commit(moveQuestion(examRef.current, question.id, delta))}
              onDelete={() => setDeleting(question.id)}
              onRegenerate={() => void regenerate(question)}
              regenerating={regenerating === question.id}
              canRegenerate={canRegenerate}
              onGenerateRubric={() => void generateRubric(question)}
              rubricBusy={rubricBusy === question.id}
              notice={notices[question.id] || undefined}
              lang={paperLang}
              dragging={dragId === question.id}
              dragOver={overId === question.id && dragId !== question.id}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', question.id)
                dragRef.current = question.id
                setDragId(question.id)
              }}
              onDragOver={(event) => {
                if (!dragRef.current) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (overId !== question.id) setOverId(question.id)
              }}
              onDrop={(event) => handleDrop(event, question.id)}
              onDragEnd={() => {
                dragRef.current = null
                setDragId(null)
                setOverId(null)
              }}
            />
          ))}
          {outline.length > 0 && <p className="sr-only">{t('exam.edit.questionCount', { count: outline.length })}</p>}
          </div>
        </div>

        <div className={`${mobileView === 'preview' ? '' : 'hidden lg:block'} lg:sticky lg:top-4`}>
          <PaperPreview exam={exam} />
        </div>
      </div>

      {pendingExport && (
        <ExportCheckDialog
          issues={exportIssues(exam)}
          onRedistribute={() => commit({ ...examRef.current, questions: rescalePoints(examRef.current.questions, EXAM_TOTAL_POINTS) })}
          onContinue={() => {
            const { run } = pendingExport
            setPendingExport(null)
            void run()
          }}
          onCancel={() => setPendingExport(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('exam.edit.deleteTitle')}
          body={t('exam.edit.deleteBody')}
          confirmLabel={t('exam.edit.deleteYes')}
          cancelLabel={t('exam.edit.deleteNo')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            commit(removeQuestion(examRef.current, deleting))
            setDeleting(null)
          }}
        />
      )}
    </>
  )
}
