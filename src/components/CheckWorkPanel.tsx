import { lazy, Suspense, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { ChangeEvent, Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchCheckWorkGrade, fetchCheckWorkReading } from '../api/checkWork'
import type { CheckWorkErrorCode, CheckWorkReadLine, CheckWorkResult, CheckWorkStepState } from '../api/checkWork'
import { SolveExtraApiError } from '../api/postJson'
import type { SolveResult } from '../api/solve'
import type { CropSpec } from '../lib/imageCrop'
import { decodeImageForSolve, encodeCroppedImage, ImageNormalizeError } from '../lib/imageNormalize'
import type { DecodedImage, NormalizedImage, NormalizeFailureReason } from '../lib/imageNormalize'
import MathText from './MathText'
import PhotoDropZone from './PhotoDropZone'
import type { PanelHandle } from './SimilarProblems'
import { CheckIcon, CropIcon, PencilIcon, QuestionIcon, SpinnerIcon, WarningIcon, XIcon } from './icons'
import { useIsPageActive } from '../hooks/usePageActive'

const ImageCropStep = lazy(() => import('./ImageCropStep'))

const ACCEPT_ATTR = 'image/*,.heic,.heif,.avif,.tiff,.tif,.bmp,.ico,.svg,.dng'

type PanelError = { source: 'photo'; code: NormalizeFailureReason } | { source: 'api'; code: CheckWorkErrorCode }

interface CheckWorkPanelProps {
  source: SolveResult
  /** The latest check, saved in the Solutions record. */
  value: CheckWorkResult | null
  onChange: (value: CheckWorkResult) => void
  ref?: Ref<PanelHandle>
}

const outlineButton =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto'
const primaryButton =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-navy bg-card px-4 py-2 text-sm font-bold text-navy transition-colors hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto'
const linkButton = 'text-xs font-semibold text-amber-text hover:underline disabled:opacity-60'

/**
 * "Check my solution": the student photographs their own work, confirms (or fixes) how it was read,
 * and the confirmed steps are graded — math engine first, AI second.
 */
export default function CheckWorkPanel({ source, value, onChange, ref }: CheckWorkPanelProps) {
  const { t, i18n } = useTranslation()
  const headingId = useId()
  const sectionRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const conversionRef = useRef(0)
  const decodedRef = useRef<DecodedImage | null>(null)

  const pageActive = useIsPageActive()
  const [visible, setVisible] = useState(value !== null)
  // The upload area is open until a check succeeds; "Check a new photo" opens it again.
  const [uploadOpen, setUploadOpen] = useState(false)
  const [scrollToken, setScrollToken] = useState(0)
  const [decoded, setDecoded] = useState<DecodedImage | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [cropSpec, setCropSpec] = useState<CropSpec | undefined>(undefined)
  const [normalized, setNormalized] = useState<NormalizedImage | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<PanelError | null>(null)
  // The reading the student confirms (or fixes) before grading.
  const [reading, setReading] = useState<CheckWorkReadLine[] | null>(null)
  const [draft, setDraft] = useState<CheckWorkReadLine[]>([])
  const [editing, setEditing] = useState(false)

  const replaceDecoded = (next: DecodedImage | null) => {
    decodedRef.current?.release()
    decodedRef.current = next
    setDecoded(next)
  }

  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
      decodedRef.current?.release()
    },
    [],
  )

  const resetPhoto = () => {
    conversionRef.current += 1
    setNormalized(null)
    setIsCropping(false)
    setCropSpec(undefined)
    replaceDecoded(null)
    setIsConverting(false)
    clearReading()
  }

  const clearReading = () => {
    setReading(null)
    setDraft([])
    setEditing(false)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file || checking) return
    const generation = ++conversionRef.current
    setError(null)
    clearReading()
    setNormalized(null)
    setIsCropping(false)
    setCropSpec(undefined)
    replaceDecoded(null)
    setIsConverting(true)
    try {
      const image = await decodeImageForSolve(file)
      if (conversionRef.current !== generation) {
        image.release()
        return
      }
      replaceDecoded(image)
      setIsCropping(true)
    } catch (caught) {
      if (conversionRef.current !== generation) return
      setError({ source: 'photo', code: caught instanceof ImageNormalizeError ? caught.reason : 'decode_failed' })
    } finally {
      if (conversionRef.current === generation) setIsConverting(false)
    }
  }

  const handleCropDone = (crop: CropSpec) => {
    if (!decoded) return
    try {
      setNormalized(encodeCroppedImage(decoded, crop))
      setCropSpec(crop)
      setIsCropping(false)
      setError(null)
      clearReading()
    } catch {
      setError({ source: 'photo', code: 'decode_failed' })
    }
  }

  // While the upload area is open, a pasted image is the student's work — not a new problem for Solve.
  const acceptsPaste = pageActive && visible && uploadOpen && !checking && !isCropping
  const handleFileRef = useRef(handleFile)
  useEffect(() => {
    handleFileRef.current = handleFile
  })
  useEffect(() => {
    if (!acceptsPaste) return
    const handlePaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return
      event.stopPropagation()
      void handleFileRef.current(file)
    }
    // Capture on window runs before Solve's document-level paste listener.
    window.addEventListener('paste', handlePaste, true)
    return () => window.removeEventListener('paste', handlePaste, true)
  }, [acceptsPaste])

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0])
    event.target.value = ''
  }

  const showResult = (result: CheckWorkResult) => {
    onChange(result)
    resetPhoto()
    setUploadOpen(false)
    setScrollToken((token) => token + 1)
  }

  /** Runs one request; the shared busy / cancel / error handling for reading and grading. */
  const run = async (task: (signal: AbortSignal) => Promise<void>) => {
    if (checking || abortRef.current) return
    setChecking(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await task(controller.signal)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError({ source: 'api', code: caught instanceof SolveExtraApiError ? (caught.code as CheckWorkErrorCode) : 'upstream' })
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setChecking(false)
    }
  }

  const base = { question: source.question, steps: source.steps, answer: source.answer, language: i18n.language }

  const handleRead = () => {
    if (!normalized) return
    void run(async (signal) => {
      const outcome = await fetchCheckWorkReading({ ...base, imageBase64: normalized.dataUrl, mimeType: normalized.mimeType }, signal)
      if (outcome.kind === 'result') {
        showResult(outcome.result)
        return
      }
      setReading(outcome.lines)
      setDraft(outcome.lines)
      setEditing(false)
    })
  }

  /** Grades the confirmed lines — the raw reading ("Yes, check it") or the student's fixed version. */
  const handleGrade = (lines: string[]) => {
    const studentSteps = lines.map((line) => line.trim()).filter(Boolean)
    if (studentSteps.length === 0) return
    void run(async (signal) => showResult(await fetchCheckWorkGrade({ ...base, studentSteps }, signal)))
  }

  const handleRetry = () => (reading ? handleGrade((editing ? draft : reading).map((line) => line.text)) : handleRead())

  const handleCancelCheck = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setChecking(false)
  }

  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true)
      setUploadOpen(true)
      setScrollToken((token) => token + 1)
    },
  }))

  useEffect(() => {
    if (scrollToken > 0) sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [scrollToken])

  if (!visible) return null

  const errorMessage = error ? (error.source === 'photo' ? t(`solve.errors.${error.code}`) : t(`solve.check.errors.${error.code}`)) : null

  return (
    <section
      ref={sectionRef}
      data-purpose="check-work-panel"
      aria-labelledby={headingId}
      aria-busy={checking}
      className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6"
    >
      <div className="space-y-1">
        <h2 id={headingId} className="font-serif text-lg font-semibold text-navy">
          {t('solve.check.title')}
        </h2>
        {uploadOpen && <p className="text-xs text-muted">{t('solve.check.subtitle')}</p>}
      </div>

      {uploadOpen && (
        <div data-purpose="check-work-upload" className="space-y-3">
          <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} capture="environment" onChange={handleInputChange} className="sr-only" tabIndex={-1} />

          {isConverting ? (
            <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-warm-border px-4 py-6 text-center">
              <SpinnerIcon className="h-7 w-7 text-amber-text" />
              <p className="text-sm font-semibold text-ink">{t('solve.upload.converting')}</p>
              <button type="button" onClick={resetPhoto} className="text-xs font-semibold text-amber-text hover:underline">
                {t('solve.cta.cancel')}
              </button>
            </div>
          ) : decoded && isCropping ? (
            <Suspense
              fallback={
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-center">
                  <SpinnerIcon className="h-7 w-7 text-amber-text" />
                  <p className="text-sm font-semibold text-ink">{t('crop.preparing')}</p>
                </div>
              }
            >
              <ImageCropStep image={decoded} initialCrop={cropSpec} onApply={handleCropDone} onSkip={handleCropDone} />
            </Suspense>
          ) : normalized ? (
            <div className="space-y-3">
              <img
                data-purpose="check-work-preview"
                src={normalized.dataUrl}
                alt={t('solve.check.previewAlt')}
                className="mx-auto block max-h-[50vh] max-w-full rounded-2xl border border-warm-border object-contain"
              />
              {reading ? (
                <ReadConfirm
                  lines={reading}
                  draft={draft}
                  editing={editing}
                  busy={checking}
                  onDraftChange={setDraft}
                  onConfirm={() => handleGrade(reading.map((line) => line.text))}
                  onStartEditing={() => setEditing(true)}
                  onCheckEdited={() => handleGrade(draft.map((line) => line.text))}
                  onCancelEditing={() => {
                    setDraft(reading)
                    setEditing(false)
                  }}
                  onRetake={() => fileInputRef.current?.click()}
                  onCancelRequest={handleCancelCheck}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button type="button" onClick={() => setIsCropping(true)} disabled={checking} className={`inline-flex items-center gap-1.5 ${linkButton}`}>
                      <CropIcon className="h-3.5 w-3.5" />
                      {t('solve.upload.changeCrop')}
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={checking} className={linkButton}>
                      {t('solve.upload.replacePhoto')}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button type="button" onClick={handleRead} disabled={checking} className={primaryButton}>
                      {checking ? <SpinnerIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
                      {checking ? t('solve.check.reading') : t('solve.check.submit')}
                    </button>
                    {checking && (
                      <button type="button" onClick={handleCancelCheck} className={linkButton}>
                        {t('solve.cta.cancel')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <PhotoDropZone
              title={t('solve.check.dropTitle')}
              onBrowse={() => fileInputRef.current?.click()}
              onFile={(file) => void handleFile(file)}
              className="min-h-[180px]"
            />
          )}

          {errorMessage && (
            <p data-purpose="check-work-error" role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-error">
              <span>{errorMessage}</span>
              {error?.source === 'api' && error.code !== 'rate_limited' && normalized && !checking && (
                <button type="button" onClick={handleRetry} className="font-semibold underline">
                  {t('solve.explain.retry')}
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {value && <CheckWorkResultView result={value} source={source} />}

      {value && !uploadOpen && (
        <button type="button" onClick={() => setUploadOpen(true)} className={outlineButton}>
          {t('solve.check.uploadAgain')}
        </button>
      )}
    </section>
  )
}

interface ReadConfirmProps {
  lines: CheckWorkReadLine[]
  draft: CheckWorkReadLine[]
  editing: boolean
  busy: boolean
  onDraftChange: (draft: CheckWorkReadLine[]) => void
  onConfirm: () => void
  onStartEditing: () => void
  onCheckEdited: () => void
  onCancelEditing: () => void
  onRetake: () => void
  onCancelRequest: () => void
}

/** "Did I read your work correctly?" — nothing is graded until the student confirms or fixes the reading. */
function ReadConfirm(props: ReadConfirmProps) {
  const { lines, draft, editing, busy, onDraftChange } = props
  const { t } = useTranslation()
  const headingId = useId()
  const shown = editing ? draft : lines
  const lowCount = shown.filter((line) => line.lowConfidence).length
  const canCheck = draft.some((line) => line.text.trim())
  const busyLabel = (
    <>
      <SpinnerIcon className="h-4 w-4" />
      {t('solve.check.checking')}
    </>
  )

  // An edited line is the student's own version now — no longer "hard to read".
  const updateLine = (index: number, text: string) => onDraftChange(draft.map((line, i) => (i === index ? { text, lowConfidence: false } : line)))

  return (
    <div data-purpose="check-work-confirm" role="group" aria-labelledby={headingId} className="space-y-3 rounded-xl border border-warm-border bg-paper p-4">
      <div className="space-y-1">
        <h3 id={headingId} className="text-sm font-bold text-navy">
          {t('solve.check.confirm.title')}
        </h3>
        <p className="text-xs text-muted">{t('solve.check.confirm.hint')}</p>
      </div>

      {lowCount >= 2 && (
        <p data-purpose="check-work-many-low" className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs font-semibold text-amber-text">
          <WarningIcon className="mt-px h-4 w-4 shrink-0" />
          <span>{t('solve.check.confirm.manyLow')}</span>
        </p>
      )}

      <ol className="space-y-2">
        {shown.map((line, index) => (
          <li
            key={index}
            data-purpose="check-work-read-line"
            data-low={line.lowConfidence ? 'true' : 'false'}
            className={`rounded-lg px-3 py-2 text-sm ${line.lowConfidence ? 'border-2 border-dashed border-amber bg-amber/5' : 'border border-warm-border bg-card'}`}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold text-muted">{index + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                {editing ? (
                  <>
                    <textarea
                      value={line.text}
                      rows={1}
                      onChange={(event) => updateLine(index, event.target.value)}
                      disabled={busy}
                      aria-label={t('solve.check.confirm.lineLabel', { n: index + 1 })}
                      className="block w-full resize-y rounded-lg border border-warm-border bg-card px-2.5 py-1.5 font-mono text-sm text-ink focus:border-amber focus:outline-none"
                    />
                    {line.text.trim() && (
                      <div data-purpose="check-work-line-preview" className="break-words text-ink">
                        <MathText text={line.text} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="break-words text-ink">
                    <MathText text={line.text} />
                  </div>
                )}
                {line.lowConfidence && (
                  <p data-purpose="check-work-low-line" className="flex items-center gap-1.5 text-xs font-semibold text-amber-text">
                    <WarningIcon className="h-3.5 w-3.5 shrink-0" />
                    {t('solve.check.confirm.lowLine')}
                  </p>
                )}
              </div>
              {editing && draft.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDraftChange(draft.filter((_, i) => i !== index))}
                  disabled={busy}
                  aria-label={t('solve.check.confirm.removeLine', { n: index + 1 })}
                  className="mt-1 shrink-0 text-muted transition-colors hover:text-ink disabled:opacity-60"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {editing && (
        <button type="button" onClick={() => onDraftChange([...draft, { text: '', lowConfidence: false }])} disabled={busy} className={linkButton}>
          + {t('solve.check.confirm.addLine')}
        </button>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {editing ? (
          <>
            <button type="button" onClick={props.onCheckEdited} disabled={busy || !canCheck} className={primaryButton}>
              {busy ? (
                busyLabel
              ) : (
                <>
                  <CheckIcon className="h-4 w-4" />
                  {t('solve.check.confirm.checkEdited')}
                </>
              )}
            </button>
            {!busy && (
              <button type="button" onClick={props.onCancelEditing} className={outlineButton}>
                {t('solve.cta.cancel')}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={props.onConfirm} disabled={busy} className={primaryButton}>
              {busy ? (
                busyLabel
              ) : (
                <>
                  <CheckIcon className="h-4 w-4" />
                  {t('solve.check.confirm.yes')}
                </>
              )}
            </button>
            {!busy && (
              <button type="button" onClick={props.onStartEditing} className={outlineButton}>
                <PencilIcon className="h-4 w-4" />
                {t('solve.check.confirm.fix')}
              </button>
            )}
          </>
        )}
        {busy ? (
          <button type="button" onClick={props.onCancelRequest} className={linkButton}>
            {t('solve.cta.cancel')}
          </button>
        ) : (
          <button type="button" onClick={props.onRetake} className={linkButton}>
            {t('solve.check.confirm.retake')}
          </button>
        )}
      </div>
    </div>
  )
}

function CheckWorkResultView({ result, source }: { result: CheckWorkResult; source: SolveResult }) {
  const { t } = useTranslation()
  const { verdict, studentSteps, firstWrongStep, unsureStep } = result
  const stepNumber = (index: number | null) => (index === null ? 0 : index + 1)

  let summary: string
  let tone: 'success' | 'error' | 'warning'
  switch (verdict) {
    case 'correct':
      tone = 'success'
      summary = unsureStep === null ? t('solve.check.verdict.correct') : t('solve.check.verdict.correctWithUnsure', { step: stepNumber(unsureStep) })
      break
    case 'has_error':
      tone = 'error'
      if (firstWrongStep === null) summary = t('solve.check.verdict.hasErrorNoStep')
      else if (result.finalAnswerCorrect) summary = t('solve.check.verdict.finalRightStepWrong', { step: stepNumber(firstWrongStep) })
      else summary = t('solve.check.verdict.has_error', { step: stepNumber(firstWrongStep) })
      break
    case 'incomplete':
      tone = firstWrongStep === null ? 'warning' : 'error'
      summary = firstWrongStep === null ? t('solve.check.verdict.incomplete') : t('solve.check.verdict.incompleteWithError', { step: stepNumber(firstWrongStep) })
      break
    case 'unsure':
      tone = 'warning'
      summary = unsureStep === null ? t('solve.check.verdict.hasErrorNoStep') : t('solve.check.verdict.unsure', { step: stepNumber(unsureStep) })
      break
    default:
      tone = 'warning'
      summary = t(`solve.check.verdict.${verdict}`)
  }

  const toneClass = {
    success: 'border-success/40 bg-success/10 text-success',
    error: 'border-error/40 bg-error/5 text-error',
    warning: 'border-amber/40 bg-amber/10 text-amber-text',
  }[tone]
  const ToneIcon = tone === 'success' ? CheckIcon : verdict === 'unsure' || verdict === 'uncertain' ? QuestionIcon : WarningIcon
  const showStepNote = result.explanation && firstWrongStep === null && verdict !== 'correct'
  const showReference = verdict === 'uncertain' || (verdict === 'has_error' && firstWrongStep === null)
  const showSteps = studentSteps.length > 0 && verdict !== 'different_problem' && verdict !== 'unreadable'

  return (
    <div data-purpose="check-work-result" data-verdict={verdict} className="space-y-4">
      <div role="status" className={`flex gap-2.5 rounded-xl border p-3.5 text-sm font-semibold ${toneClass}`}>
        <ToneIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p data-purpose="check-work-summary">{summary}</p>
          {showStepNote && (
            <p className="font-normal text-ink">
              <MathText text={result.explanation} />
            </p>
          )}
        </div>
      </div>

      {showSteps && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">{t('solve.check.stepsHeading')}</h3>
          <ol className="space-y-2">
            {studentSteps.map((step, index) => (
              <StepRow key={index} index={index} step={step} state={result.stepStates[index] ?? 'unchecked'} result={result} />
            ))}
          </ol>
        </div>
      )}

      {showReference && (
        <div data-purpose="check-work-reference" className="space-y-2 rounded-xl border border-warm-border bg-paper p-3.5">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">{t('solve.check.referenceHeading')}</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
            {source.steps.map((step, index) => (
              <li key={index} className="break-words">
                <MathText text={step} />
              </li>
            ))}
          </ol>
          <p className="break-words text-sm font-semibold text-ink">
            <MathText text={source.answer} />
          </p>
        </div>
      )}
    </div>
  )
}

/** One student step at one of three levels — each with its own icon and text, never color alone. */
function StepRow({ index, step, state, result }: { index: number; step: string; state: CheckWorkStepState; result: CheckWorkResult }) {
  const { t } = useTranslation()
  const frame = {
    mistake: 'border-2 border-error bg-error/5',
    unsure: 'border-2 border-dashed border-amber bg-amber/5',
    ok: 'border border-transparent',
    unchecked: 'border border-transparent',
  }[state]

  return (
    <li data-purpose="check-work-step" data-state={state} className={`rounded-xl px-3 py-2 text-sm ${frame}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold text-muted">{index + 1}</span>
        <span className={`min-w-0 flex-1 break-words ${state === 'unchecked' ? 'text-muted' : 'text-ink'}`}>
          <MathText text={step} />
        </span>
        {state === 'ok' && (
          <span data-purpose="check-work-ok" className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
            <CheckIcon className="h-4 w-4" />
            <span>{t('solve.check.levels.ok')}</span>
          </span>
        )}
      </div>

      {state === 'mistake' && (
        <div data-purpose="check-work-wrong" className="mt-2 ml-7.5 space-y-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-error">
            <XIcon className="h-4 w-4 shrink-0" />
            <span>{t('solve.check.levels.mistake')}</span>
            {result.errorType && (
              <span data-purpose="check-work-error-type" className="rounded-full bg-error/10 px-2 py-0.5 font-semibold">
                {t(`solve.check.errorTypes.${result.errorType}`)}
              </span>
            )}
          </p>
          {result.explanation && (
            <p data-purpose="check-work-explanation" className="text-sm text-ink">
              <MathText text={result.explanation} />
            </p>
          )}
          {result.correctedStep && (
            <div data-purpose="check-work-corrected" className="rounded-xl border border-warm-border bg-paper p-3 text-sm text-ink">
              <span className="text-xs font-semibold tracking-wide text-success uppercase">{t('solve.check.correctedLabel')}: </span>
              <MathText text={result.correctedStep} />
            </div>
          )}
        </div>
      )}

      {state === 'unsure' && (
        <div data-purpose="check-work-unsure" className="mt-2 ml-7.5 space-y-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-amber-text">
            <QuestionIcon className="h-4 w-4 shrink-0" />
            <span>{t('solve.check.levels.unsure')}</span>
          </p>
          {result.unsureHint && index === result.unsureStep && (
            <p data-purpose="check-work-hint" className="text-sm text-ink">
              <MathText text={result.unsureHint} />
            </p>
          )}
        </div>
      )}
    </li>
  )
}

