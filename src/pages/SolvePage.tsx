import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { SolveApiError, solveMathPhoto } from '../api/solve'
import type { SolveErrorCode, SolveResult } from '../api/solve'
import type { CropSpec } from '../lib/imageCrop'
import { decodeImageForSolve, encodeCroppedImage, ImageNormalizeError, renderPreviewCanvas } from '../lib/imageNormalize'
import type { DecodedImage, NormalizedImage } from '../lib/imageNormalize'
import MathText from '../components/MathText'
import SolutionView from '../components/SolutionView'
import { deletePageDraft, readPageDraft, writePageDraft } from '../lib/pageDraftStorage'
import { getSolution, saveSolution } from '../lib/solutionStorage'
import PhotoDropZone from '../components/PhotoDropZone'
import { CropIcon, SpinnerIcon, SunIcon } from '../components/icons'
import DueReminder from '../components/flashcards/DueReminder'
import { useIsPageActive } from '../hooks/usePageActive'

// The crop step is only needed once a photo is chosen — keep it out of the initial bundle.
const ImageCropStep = lazy(() => import('../components/ImageCropStep'))

const ACCEPT_ATTR = 'image/*,.heic,.heif,.avif,.tiff,.tif,.bmp,.ico,.svg,.dng'
const MAX_NOTE_CHARS = 500

type DisplayErrorCode = SolveErrorCode | 'unsupported' | 'decode_failed' | 'too_small'

// Shown at most once per page load when the browser can't store solutions (private mode, full disk).
let saveNoteShown = false

// The reload draft keeps a compressed copy of the photo, never the original file.
const DRAFT_PHOTO_MAX_SIDE = 2000
const DRAFT_PHOTO_QUALITY = 0.85
const DRAFT_SAVE_DEBOUNCE_MS = 300

interface DraftPhoto {
  type: string
  bytes: ArrayBuffer
}

/** Unfinished Solve work saved for a reload (IndexedDB, dropped after 24 hours). */
interface SolveDraft {
  photo: DraftPhoto
  crop: CropSpec | null
  /** Set once the crop was applied ("Use this area" / "Whole photo"): the upload JPEG. */
  normalizedDataUrl: string | null
  note: string
  result: SolveResult | null
  choices: string[] | null
  solutionId: string | null
  revealed: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCrop(value: unknown): CropSpec | null {
  if (!isRecord(value)) return null
  const { x, y, w, h, rotation } = value
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return null
  return { x: x as number, y: y as number, w: w as number, h: h as number, rotation }
}

function parseResult(value: unknown): SolveResult | null {
  if (!isRecord(value) || typeof value.question !== 'string' || !Array.isArray(value.steps)) return null
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : [])
  const text = (field: unknown) => (typeof field === 'string' ? field : '')
  return {
    topic: text(value.topic),
    question: value.question,
    intro: text(value.intro),
    steps: strings(value.steps),
    answer: text(value.answer),
    tip: text(value.tip),
    mistakes: strings(value.mistakes).slice(0, 2),
  }
}

function parseSolveDraft(raw: unknown): SolveDraft | null {
  if (!isRecord(raw) || !isRecord(raw.photo) || !(raw.photo.bytes instanceof ArrayBuffer)) return null
  const normalizedDataUrl = typeof raw.normalizedDataUrl === 'string' && raw.normalizedDataUrl.startsWith('data:image/jpeg') ? raw.normalizedDataUrl : null
  return {
    photo: { type: typeof raw.photo.type === 'string' ? raw.photo.type : 'image/jpeg', bytes: raw.photo.bytes },
    crop: parseCrop(raw.crop),
    normalizedDataUrl,
    note: typeof raw.note === 'string' ? raw.note.slice(0, MAX_NOTE_CHARS) : '',
    result: normalizedDataUrl ? parseResult(raw.result) : null,
    choices: normalizedDataUrl && Array.isArray(raw.choices) ? raw.choices.filter((entry): entry is string => typeof entry === 'string') : null,
    solutionId: typeof raw.solutionId === 'string' ? raw.solutionId : null,
    revealed: typeof raw.revealed === 'number' ? raw.revealed : 0,
  }
}

async function encodeDraftPhoto(image: DecodedImage): Promise<DraftPhoto | null> {
  try {
    const canvas = renderPreviewCanvas(image, 0, DRAFT_PHOTO_MAX_SIDE)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', DRAFT_PHOTO_QUALITY))
    return blob ? { type: 'image/jpeg', bytes: await blob.arrayBuffer() } : null
  } catch {
    return null
  }
}

async function decodeDraftPhoto(photo: DraftPhoto): Promise<DecodedImage | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([photo.bytes], { type: photo.type }))
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  } catch {
    return null
  }
}

export default function SolvePage() {
  const { t, i18n } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const conversionRef = useRef(0)
  // The full-resolution decoded photo; crops are always cut from it, never from the upload JPEG.
  const decodedRef = useRef<DecodedImage | null>(null)

  const [decoded, setDecoded] = useState<DecodedImage | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [cropSpec, setCropSpec] = useState<CropSpec | undefined>(undefined)
  const [normalized, setNormalized] = useState<NormalizedImage | null>(null)
  const [note, setNote] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [isSolving, setIsSolving] = useState(false)
  const [result, setResult] = useState<SolveResult | null>(null)
  // Each new result gets a fresh view (reveal/explain state) and, once saved, its Solutions record id.
  const [resultVersion, setResultVersion] = useState(0)
  const [savedSolution, setSavedSolution] = useState<{ version: number; id: string } | null>(null)
  const [choices, setChoices] = useState<string[] | null>(null)
  const [errorCode, setErrorCode] = useState<DisplayErrorCode | null>(null)
  const [saveUnavailable, setSaveUnavailable] = useState(false)
  // The crop box while the crop step is open, before it is applied (kept for a reload).
  const [liveCrop, setLiveCrop] = useState<CropSpec | undefined>(undefined)
  const [revealed, setRevealed] = useState(0)
  // The Solutions record's extras when a solved draft comes back after a reload.
  const [restoredExtras, setRestoredExtras] = useState<Record<string, unknown> | undefined>(undefined)
  const [isRestoring, setIsRestoring] = useState(true)
  const draftReadyRef = useRef(false)
  const draftPhotoRef = useRef<{ image: DecodedImage; photo: Promise<DraftPhoto | null> } | null>(null)
  const pageActive = useIsPageActive()

  const replaceDecoded = (next: DecodedImage | null) => {
    decodedRef.current?.release()
    decodedRef.current = next
    setDecoded(next)
  }

  useEffect(() => () => decodedRef.current?.release(), [])

  // Bring back unfinished work after a reload; a photo picked meanwhile wins over the draft.
  useEffect(() => {
    let cancelled = false
    const generation = conversionRef.current
    void (async () => {
      const draft = parseSolveDraft(await readPageDraft('solve'))
      const image = draft ? await decodeDraftPhoto(draft.photo) : null
      const record = draft?.result && draft.solutionId && image ? await getSolution(draft.solutionId).catch(() => null) : null
      if (cancelled) {
        image?.release()
        return
      }
      if (draft && image && conversionRef.current === generation) {
        replaceDecoded(image)
        draftPhotoRef.current = { image, photo: Promise.resolve(draft.photo) }
        setCropSpec(draft.crop ?? undefined)
        setLiveCrop(draft.crop ?? undefined)
        if (draft.normalizedDataUrl) {
          const dataUrl = draft.normalizedDataUrl
          setNormalized({ dataUrl, mimeType: 'image/jpeg', byteLength: Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4) })
          setIsCropping(false)
        } else {
          setIsCropping(true)
        }
        setNote(draft.note)
        setChoices(draft.choices)
        if (draft.result) {
          setResult(draft.result)
          setResultVersion(1)
          setRevealed(draft.revealed)
          setRestoredExtras(record?.extras)
          if (record) setSavedSolution({ version: 1, id: record.id })
        }
      } else {
        image?.release()
      }
      draftReadyRef.current = true
      setIsRestoring(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Save unfinished work (debounced); no photo means nothing to keep.
  useEffect(() => {
    if (!draftReadyRef.current || isRestoring) return undefined
    if (!decoded) {
      void deletePageDraft('solve')
      return undefined
    }
    const image = decoded
    const timer = window.setTimeout(() => {
      if (draftPhotoRef.current?.image !== image) draftPhotoRef.current = { image, photo: encodeDraftPhoto(image) }
      void draftPhotoRef.current.photo.then((photo) => {
        if (!photo || decodedRef.current !== image) return
        const confirmed = !isCropping && normalized !== null
        const draft: SolveDraft = {
          photo,
          crop: (isCropping ? (liveCrop ?? cropSpec) : cropSpec) ?? null,
          normalizedDataUrl: confirmed ? normalized.dataUrl : null,
          note,
          result: confirmed ? result : null,
          choices: confirmed ? choices : null,
          solutionId: confirmed && result && savedSolution?.version === resultVersion ? savedSolution.id : null,
          revealed,
        }
        void writePageDraft('solve', draft)
      })
    }, DRAFT_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [decoded, isCropping, liveCrop, cropSpec, normalized, note, result, choices, savedSolution, resultVersion, revealed, isRestoring])

  const clearOutcome = () => {
    abortRef.current?.abort()
    setResult(null)
    setChoices(null)
    setErrorCode(null)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return

    const generation = ++conversionRef.current
    clearOutcome()
    setNormalized(null)
    setIsCropping(false)
    setCropSpec(undefined)
    setLiveCrop(undefined)
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
    } catch (error) {
      if (conversionRef.current !== generation) return
      setErrorCode(error instanceof ImageNormalizeError ? error.reason : 'decode_failed')
    } finally {
      if (conversionRef.current === generation) setIsConverting(false)
    }
  }

  const handleCropDone = (crop: CropSpec) => {
    if (!decoded) return
    clearOutcome()
    try {
      setNormalized(encodeCroppedImage(decoded, crop))
      setCropSpec(crop)
      setIsCropping(false)
    } catch {
      setErrorCode('decode_failed')
    }
  }

  const handleChangeCrop = () => {
    if (!decoded) return
    clearOutcome()
    setIsCropping(true)
  }

  // The document-level paste listener is registered once; route it to the latest handleFile.
  const handleFileRef = useRef(handleFile)
  useEffect(() => {
    handleFileRef.current = handleFile
  })

  useEffect(() => {
    // While another page is shown, a paste belongs to that page.
    if (!pageActive) return undefined
    const handlePaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) void handleFileRef.current(file)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [pageActive])

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleReset = () => {
    conversionRef.current += 1
    clearOutcome()
    setNormalized(null)
    setIsCropping(false)
    setCropSpec(undefined)
    setLiveCrop(undefined)
    replaceDecoded(null)
    setNote('')
    setIsConverting(false)
    void deletePageDraft('solve')
  }

  const handleCancelConvert = () => {
    conversionRef.current += 1
    setIsConverting(false)
  }

  const handleCancelSolve = () => {
    abortRef.current?.abort()
  }

  const persistSolution = async (solved: SolveResult, imageDataUrl: string, version: number) => {
    try {
      const record = await saveSolution({ result: solved, imageDataUrl, language: i18n.language })
      setSavedSolution({ version, id: record.id })
    } catch {
      // Solve keeps working without storage; tell the student once that it won't be saved.
      if (!saveNoteShown) {
        saveNoteShown = true
        setSaveUnavailable(true)
      }
    }
  }

  const handleSolve = async (problem?: string) => {
    if (!normalized || isSolving || isCropping) return
    setIsSolving(true)
    setErrorCode(null)
    setResult(null)
    setSaveUnavailable(false)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const outcome = await solveMathPhoto(
        {
          imageBase64: normalized.dataUrl,
          mimeType: normalized.mimeType,
          language: i18n.language,
          note: note.trim(),
          ...(problem ? { problem } : {}),
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (outcome.kind === 'choices') {
        setChoices(outcome.problems)
      } else {
        setChoices(null)
        const version = resultVersion + 1
        setResultVersion(version)
        setResult(outcome.result)
        setRevealed(0)
        setRestoredExtras(undefined)
        void persistSolution(outcome.result, normalized.dataUrl, version)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorCode(error instanceof SolveApiError ? error.code : 'upstream')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsSolving(false)
    }
  }

  return (
    <>
      <DueReminder />
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

        {!decoded && !isConverting && isRestoring ? (
          <div className="min-h-[220px] md:min-h-[260px]" aria-hidden />
        ) : !decoded && !isConverting ? (
          <PhotoDropZone onBrowse={() => fileInputRef.current?.click()} onFile={(file) => void handleFile(file)} />
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
        ) : decoded && isCropping ? (
          <Suspense
            fallback={
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
                <SpinnerIcon className="h-8 w-8 text-amber-text" />
                <p className="text-sm font-semibold text-ink">{t('crop.preparing')}</p>
              </div>
            }
          >
            <ImageCropStep
              image={decoded}
              initialCrop={cropSpec}
              onApply={handleCropDone}
              onSkip={handleCropDone}
              onCropChange={setLiveCrop}
            />
          </Suspense>
        ) : normalized ? (
          <div className="space-y-3">
            <img
              data-purpose="solve-cropped-preview"
              src={normalized.dataUrl}
              alt={t('solve.upload.croppedAlt')}
              className="mx-auto block max-h-[60vh] max-w-full rounded-2xl border border-warm-border object-contain md:max-h-[70vh]"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={handleChangeCrop}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-text hover:underline"
              >
                <CropIcon className="h-3.5 w-3.5" />
                {t('solve.upload.changeCrop')}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-amber-text hover:underline"
              >
                {t('solve.upload.replacePhoto')}
              </button>
              <button
                type="button"
                data-purpose="solve-new-question"
                onClick={handleReset}
                className="text-xs font-semibold text-amber-text hover:underline"
              >
                {t('solve.upload.newQuestion')}
              </button>
            </div>
          </div>
        ) : null}

        {normalized && !isCropping && (
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
          disabled={!normalized || isSolving || isCropping}
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

      {choices && !result && (
        <section
          data-purpose="solve-choices"
          aria-labelledby="solve-choices-title"
          className="-mt-4 mb-6 space-y-4 rounded-[14px] border border-warm-border bg-card p-5 md:p-6"
        >
          <div className="space-y-1">
            <h2 id="solve-choices-title" className="font-serif text-lg font-semibold text-navy">
              {t('solve.choices.title')}
            </h2>
            <p className="text-xs text-muted">{t('solve.choices.subtitle')}</p>
          </div>
          <ul className="space-y-2">
            {choices.map((problem, index) => (
              <li key={`${index}-${problem}`}>
                <button
                  type="button"
                  onClick={() => void handleSolve(problem)}
                  disabled={isSolving}
                  className="flex w-full rounded-xl border border-warm-border bg-paper px-4 py-3 text-left text-sm text-ink transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {/* The model's own description already carries the problem's visible number/label. */}
                  <span className="min-w-0 flex-1 break-words">
                    <MathText text={problem} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleChangeCrop}
            disabled={isSolving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-amber disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <CropIcon className="h-4 w-4" />
            {t('solve.choices.cropAction')}
          </button>
        </section>
      )}

      {result && (
        <SolutionView
          key={resultVersion}
          result={result}
          solutionId={savedSolution?.version === resultVersion ? savedSolution.id : null}
          initialExtras={restoredExtras}
          initialRevealed={revealed}
          onRevealedChange={setRevealed}
          className="-mt-4"
        >
          {saveUnavailable && (
            <p data-purpose="solve-save-note" role="status" className="text-xs text-muted">
              {t('solve.saveUnavailable')}
            </p>
          )}
        </SolutionView>
      )}
    </>
  )
}
