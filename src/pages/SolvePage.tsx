import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { SolveApiError, solveMathPhoto } from '../api/solve'
import type { SolveErrorCode, SolveResult } from '../api/solve'
import { compressImageForSolve } from '../lib/imageCompression'
import type { CompressedImage } from '../lib/imageCompression'
import DemoBanner from '../components/DemoBanner'
import MathText from '../components/MathText'
import { FileTabIcon, SpinnerIcon, SunIcon } from '../components/icons'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

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

  const [compressed, setCompressed] = useState<CompressedImage | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isSolving, setIsSolving] = useState(false)
  const [result, setResult] = useState<SolveResult | null>(null)
  const [errorCode, setErrorCode] = useState<SolveErrorCode | null>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return

    setResult(null)

    if (!ACCEPTED_TYPES.has(file.type)) {
      setErrorCode('bad_type')
      setCompressed(null)
      return
    }

    try {
      const image = await compressImageForSolve(file)
      if (image.byteLength > MAX_IMAGE_BYTES) {
        setErrorCode('too_large')
        setCompressed(null)
        return
      }
      setErrorCode(null)
      setCompressed(image)
    } catch {
      setErrorCode('upstream')
      setCompressed(null)
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
    setCompressed(null)
    setResult(null)
    setErrorCode(null)
  }

  const handleSolve = async () => {
    if (!compressed) return
    setIsSolving(true)
    setErrorCode(null)
    try {
      const solved = await solveMathPhoto({
        imageBase64: compressed.dataUrl,
        mimeType: compressed.mimeType,
        language: i18n.language,
      })
      setResult(solved)
    } catch (error) {
      setErrorCode(error instanceof SolveApiError ? error.code : 'upstream')
    } finally {
      setIsSolving(false)
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
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleInputChange}
          className="sr-only"
        />

        {!compressed ? (
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
        ) : (
          <div className="space-y-3">
            <img
              src={compressed.dataUrl}
              alt={t('solve.title')}
              className="max-h-[360px] w-full rounded-2xl border border-warm-border object-contain"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold text-amber-hover hover:underline"
            >
              {t('solve.upload.changePhoto')}
            </button>
          </div>
        )}
      </section>

      <section data-purpose="primary-action-cta" className="pt-2 pb-6">
        <button
          type="button"
          onClick={() => void handleSolve()}
          disabled={!compressed || isSolving}
          aria-busy={isSolving}
          className="group flex h-14 w-full items-center justify-center gap-3 rounded-[14px] bg-amber text-base font-bold text-navy shadow-sm transition-all hover:-translate-y-px hover:bg-amber-hover hover:shadow-lg hover:shadow-amber/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
        >
          {isSolving ? <SpinnerIcon className="h-5 w-5 text-navy" /> : <SunIcon className="h-5 w-5 text-navy" />}
          <span className="tracking-wide">{isSolving ? t('solve.cta.solving') : t('solve.cta.solve')}</span>
        </button>
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
          {result.demo && <DemoBanner message={t('solve.demoNotice')} />}

          <section className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
            <p className="text-xs font-bold tracking-wide text-amber-hover uppercase">{result.topic}</p>
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
              <span className="text-xs font-semibold tracking-wide text-amber-hover uppercase">
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
