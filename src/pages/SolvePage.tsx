import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { SolveApiError, solveMathPhoto } from '../api/solve'
import type { SolveErrorCode, SolveResult } from '../api/solve'
import { ImageNormalizeError, normalizeImageForSolve } from '../lib/imageNormalize'
import type { NormalizedImage } from '../lib/imageNormalize'
import MathText from '../components/MathText'
import { FileTabIcon, SpinnerIcon, SunIcon } from '../components/icons'

const ACCEPT_ATTR = 'image/*,.heic,.heif,.avif,.tiff,.tif,.bmp,.ico,.svg,.dng'
const MAX_NOTE_CHARS = 500

type DisplayErrorCode = SolveErrorCode | 'unsupported' | 'decode_failed' | 'too_small'

function buildQuizPrefillText(
  result: SolveResult,
  labels: { topic: string; question: string; steps: string; answer: string },
): string {
  const lines = [
    `${labels.topic}: ${result.topic}`,
    '',
    `${labels.question}: ${result.question}`,
    '',
    `${labels.steps}:`,
    ...result.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `${labels.answer}: ${result.answer}`,
  ]
  return lines.join('\n')
}

export default function SolvePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const conversionRef = useRef(0)

  const [normalized, setNormalized] = useState<NormalizedImage | null>(null)
  const [note, setNote] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [isSolving, setIsSolving] = useState(false)
  const [result, setResult] = useState<SolveResult | null>(null)
  const [errorCode, setErrorCode] = useState<DisplayErrorCode | null>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return

    const generation = ++conversionRef.current
    setResult(null)
    setErrorCode(null)
    setNormalized(null)
    setIsConverting(true)

    try {
      const image = await normalizeImageForSolve(file)
      if (conversionRef.current !== generation) return
      setNormalized(image)
    } catch (error) {
      if (conversionRef.current !== generation) return
      setErrorCode(error instanceof ImageNormalizeError ? error.reason : 'decode_failed')
    } finally {
      if (conversionRef.current === generation) setIsConverting(false)
    }
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) void handleFile(file)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void handleFile(event.dataTransfer.files?.[0])
  }

  const handleReset = () => {
    conversionRef.current += 1
    abortRef.current?.abort()
    setNormalized(null)
    setResult(null)
    setErrorCode(null)
    setNote('')
    setIsConverting(false)
  }

  const handleCancelConvert = () => {
    conversionRef.current += 1
    setIsConverting(false)
  }

  const handleCancelSolve = () => {
    abortRef.current?.abort()
  }

  const handleSolve = async () => {
    if (!normalized || isSolving) return
    setIsSolving(true)
    setErrorCode(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const solved = await solveMathPhoto(
        {
          imageBase64: normalized.dataUrl,
          mimeType: normalized.mimeType,
          language: i18n.language,
          note: note.trim(),
        },
        controller.signal,
      )
      setResult(solved)
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorCode(error instanceof SolveApiError ? error.code : 'upstream')
      }
    } finally {
      setIsSolving(false)
      abortRef.current = null
    }
  }

  const handleCreateQuiz = () => {
    if (!result) return
    const prefillText = buildQuizPrefillText(result, {
      topic: t('solve.prefill.topicLabel'),
      question: t('solve.prefill.questionLabel'),
      steps: t('solve.prefill.stepsLabel'),
      answer: t('solve.prefill.answerLabel'),
    })
    navigate('/', { state: { prefillText } })
  }

  return (
    <>
      <section data-purpose="page-intro" className="space-y-2">
        <h1 className="font-serif text-2xl leading-snug font-semibold tracking-tight text-navy lg:text-3xl">
          {t('solve.title')}
        </h1>
        <p className="text-sm font-normal text-muted">{t('solve.subtitle')}</p>
      </section>

      <section data-purpose="solve-upload-card" className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          capture="environment"
          onChange={handleInputChange}
          className="sr-only"
        />

        {!normalized && !isConverting ? (
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
            onDrop={handleDrop}
            className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card px-4 py-8 text-center transition-colors md:min-h-[260px] ${
              isDragging ? 'border-amber' : 'border-warm-border'
            }`}
          >
            <FileTabIcon className="h-8 w-8 text-muted" />
            <div>
              <p className="text-sm font-semibold text-ink">{t('solve.upload.dragTitle')}</p>
              <p className="mt-1 text-xs text-muted">{t('solve.upload.dragSubtitle')}</p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                fileInputRef.current?.click()
              }}
              className="rounded-xl border border-warm-border bg-paper px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:border-amber"
            >
              {t('solve.upload.browse')}
            </button>
            <p className="text-xs text-muted">{t('solve.upload.hint')}</p>
          </div>
        ) : isConverting ? (
          <div
            data-purpose="solve-converting"
            className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-warm-border px-4 py-8 text-center md:min-h-[260px]"
          >
            <SpinnerIcon className="h-8 w-8 text-amber-text" />
            <p className="text-sm font-semibold text-ink">{t('solve.upload.converting')}</p>
            <button
              type="button"
              onClick={handleCancelConvert}
              className="text-xs font-semibold text-amber-text hover:underline"
            >
              {t('solve.cta.cancel')}
            </button>
          </div>
        ) : normalized ? (
          <div className="space-y-3">
            <img
              src={normalized.dataUrl}
              alt={t('solve.title')}
              className="max-h-[360px] w-full rounded-2xl border border-warm-border object-contain"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold text-amber-text hover:underline"
            >
              {t('solve.upload.changePhoto')}
            </button>
          </div>
        ) : null}

        {normalized && (
          <div className="space-y-1.5">
            <label htmlFor="solve-note" className="text-xs font-semibold text-ink">
              {t('solve.note.label')}
            </label>
            <textarea
              id="solve-note"
              rows={2}
              value={note}
              maxLength={MAX_NOTE_CHARS}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('solve.note.placeholder')}
              className="w-full resize-none rounded-xl border border-warm-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-solid"
            />
          </div>
        )}
      </section>

      <section data-purpose="primary-action-cta" className="space-y-2 pt-2 pb-6">
        <button
          type="button"
          onClick={() => void handleSolve()}
          disabled={!normalized || isSolving}
          aria-busy={isSolving}
          className="group flex h-14 w-full items-center justify-center gap-3 rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-all hover:-translate-y-px hover:bg-amber-hover hover:shadow-lg hover:shadow-amber/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
        >
          {isSolving ? <SpinnerIcon className="h-5 w-5 text-navy" /> : <SunIcon className="h-5 w-5 text-navy" />}
          <span className="tracking-wide">{isSolving ? t('solve.cta.solving') : t('solve.cta.solve')}</span>
        </button>
        {isSolving && (
          <button
            type="button"
            onClick={handleCancelSolve}
            className="w-full text-center text-xs font-semibold text-amber-text hover:underline"
          >
            {t('solve.cta.cancel')}
          </button>
        )}
      </section>

      {errorCode && (
        <div
          data-purpose="solve-error"
          role="alert"
          className="-mt-4 space-y-3 rounded-[14px] border border-error/40 bg-error/5 p-5 text-center"
        >
          <p className="text-sm font-semibold text-error">{t(`solve.errors.${errorCode}`)}</p>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center rounded-xl border border-warm-border bg-card px-4 py-2 text-xs font-bold text-navy transition-colors hover:border-amber"
          >
            {t('solve.errors.tryAnother')}
          </button>
        </div>
      )}

      {result && (
        <div data-purpose="solve-result" className="-mt-4 space-y-4 pb-6">
          <section className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
            <p className="text-xs font-bold tracking-wide text-amber-text uppercase">{result.topic}</p>
            <p className="text-sm font-semibold text-ink">
              <MathText text={result.question} />
            </p>

            <ol className="space-y-3">
              {result.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-ink">
                    <MathText text={step} />
                  </span>
                </li>
              ))}
            </ol>

            <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-amber/15 px-4 py-2.5 text-sm font-bold text-navy">
              <span className="text-xs font-semibold tracking-wide text-amber-text uppercase">
                {t('solve.result.answerLabel')}
              </span>
              <MathText text={result.answer} />
            </div>

            <div className="rounded-xl border border-warm-border bg-paper p-3.5 text-xs text-muted">
              <span className="font-semibold text-ink">{t('solve.result.tipLabel')}: </span>
              <MathText text={result.tip} />
            </div>
          </section>

          <button
            type="button"
            onClick={handleCreateQuiz}
            className="inline-flex items-center justify-center rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber"
          >
            {t('solve.cta.createQuiz')}
          </button>

          <p className="text-center text-xs text-muted">{t('solve.footerNote')}</p>
        </div>
      )}
    </>
  )
}
