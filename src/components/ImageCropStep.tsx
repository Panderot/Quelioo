import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  addRotation,
  FULL_RECT,
  moveRect,
  resizeRect,
  rotateRectClockwise,
  rotateRectCounterClockwise,
  scaleRect,
} from '../lib/imageCrop'
import type { CropHandle, CropRect, CropRotation, CropSpec } from '../lib/imageCrop'
import { renderPreviewCanvas } from '../lib/imageNormalize'
import type { DecodedImage } from '../lib/imageNormalize'
import { CropIcon, RefreshIcon, RotateLeftIcon, RotateRightIcon, SpinnerIcon } from './icons'

export interface ImageCropStepProps {
  image: DecodedImage
  /** Restores an earlier crop (e.g. "Change crop"); defaults to the whole, unrotated photo. */
  initialCrop?: CropSpec
  /** Applies the chosen area. */
  onApply: (crop: CropSpec) => void
  /** Skips cropping: the whole photo, with any rotation the user already applied. */
  onSkip: (crop: CropSpec) => void
  /** Reports every change of the box or rotation, so the caller can save unconfirmed work. */
  onCropChange?: (crop: CropSpec) => void
}

// Smallest crop box, in CSS pixels on screen, so the box (and its corner handles) never collapses.
const MIN_BOX_PX = 48
// Upscale tiny photos for comfortable cropping, but never past this factor.
const MAX_UPSCALE = 2
// Keyboard nudge, as a fraction of the image.
const KEY_STEP = 0.02
const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const HANDLE_CLASS: Record<CropHandle, string> = {
  nw: 'left-0 top-0 h-6 w-6 cursor-nwse-resize',
  ne: 'right-0 top-0 h-6 w-6 cursor-nesw-resize',
  se: 'right-0 bottom-0 h-6 w-6 cursor-nwse-resize',
  sw: 'left-0 bottom-0 h-6 w-6 cursor-nesw-resize',
  n: 'left-6 right-6 top-0 h-3 cursor-ns-resize',
  s: 'left-6 right-6 bottom-0 h-3 cursor-ns-resize',
  e: 'top-6 bottom-6 right-0 w-3 cursor-ew-resize',
  w: 'top-6 bottom-6 left-0 w-3 cursor-ew-resize',
}

const CORNER_MARK_CLASS: Partial<Record<CropHandle, string>> = {
  nw: 'left-0 top-0 border-t-[3px] border-l-[3px]',
  ne: 'right-0 top-0 border-t-[3px] border-r-[3px]',
  se: 'right-0 bottom-0 border-b-[3px] border-r-[3px]',
  sw: 'left-0 bottom-0 border-b-[3px] border-l-[3px]',
}

type Gesture =
  | { mode: 'move'; startRect: CropRect; startX: number; startY: number }
  | { mode: 'resize'; handle: CropHandle; startRect: CropRect; startX: number; startY: number }
  | { mode: 'pinch'; startRect: CropRect; startDistance: number }

function viewportMaxHeight(): number {
  if (typeof window === 'undefined') return 600
  return window.innerHeight * (window.innerWidth < 768 ? 0.6 : 0.7)
}

function pointerDistance(points: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...points.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Reusable crop step: shows the WHOLE photo (contain-fit, never clipped) with a movable, resizable
 * crop box. Mouse, touch (drag + pinch) and keyboard (arrows move, Shift+arrows resize) all work.
 * It only reports a CropSpec — the caller cuts the final image from the full-resolution original.
 */
export default function ImageCropStep({ image, initialCrop, onApply, onSkip, onCropChange }: ImageCropStepProps) {
  const { t } = useTranslation()
  const instructionsId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<Gesture | null>(null)

  const [rotation, setRotation] = useState<CropRotation>(initialCrop?.rotation ?? 0)
  const [rect, setRect] = useState<CropRect>(
    initialCrop ? { x: initialCrop.x, y: initialCrop.y, w: initialCrop.w, h: initialCrop.h } : FULL_RECT,
  )
  // Mirrors `rect` synchronously for pointer/keyboard handlers; only ever written via updateRect().
  const rectRef = useRef(rect)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [maxHeight, setMaxHeight] = useState(viewportMaxHeight)

  const onCropChangeRef = useRef(onCropChange)
  useEffect(() => {
    onCropChangeRef.current = onCropChange
  })
  useEffect(() => {
    onCropChangeRef.current?.({ ...rect, rotation })
  }, [rect, rotation])

  // One downscaled, unrotated copy of the photo; rotations are rendered from it, not the original.
  const basePreview = useMemo(() => {
    const canvas = renderPreviewCanvas(image, 0)
    return { canvas, width: canvas.width, height: canvas.height }
  }, [image])

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    const rotated = renderPreviewCanvas(
      { source: basePreview.canvas, width: basePreview.width, height: basePreview.height, release: () => {} },
      rotation,
    )
    rotated.toBlob(
      (blob) => {
        if (cancelled || !blob) return
        url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      },
      'image/jpeg',
      0.92,
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [basePreview, rotation])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      setContainerWidth(container.clientWidth)
      setMaxHeight(viewportMaxHeight())
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const quarterTurn = rotation === 90 || rotation === 270
  const naturalWidth = quarterTurn ? image.height : image.width
  const naturalHeight = quarterTurn ? image.width : image.height
  const aspect = naturalWidth / naturalHeight
  const displayWidth = Math.max(1, Math.floor(Math.min(containerWidth, maxHeight * aspect, naturalWidth * MAX_UPSCALE)))
  const displayHeight = Math.max(1, Math.floor(displayWidth / aspect))
  const minW = Math.min(1, MIN_BOX_PX / displayWidth)
  const minH = Math.min(1, MIN_BOX_PX / displayHeight)

  const updateRect = (next: CropRect) => {
    rectRef.current = next
    setRect(next)
  }

  const startSingleGesture = (target: Element | null, x: number, y: number) => {
    const handle = target?.closest<HTMLElement>('[data-crop-handle]')?.dataset.cropHandle as CropHandle | undefined
    if (handle) {
      gestureRef.current = { mode: 'resize', handle, startRect: rectRef.current, startX: x, startY: y }
    } else if (target?.closest('[data-crop-box]')) {
      gestureRef.current = { mode: 'move', startRect: rectRef.current, startX: x, startY: y }
    } else {
      gestureRef.current = null
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer already released (fast taps) — moves still arrive while it stays over the stage.
    }
    const points = pointersRef.current
    points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (points.size === 2) {
      gestureRef.current = { mode: 'pinch', startRect: rectRef.current, startDistance: Math.max(1, pointerDistance(points)) }
    } else if (points.size === 1) {
      startSingleGesture(event.target as Element, event.clientX, event.clientY)
      ;(event.target as HTMLElement).closest<HTMLElement>('[data-crop-box]')?.focus({ preventScroll: true })
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const points = pointersRef.current
    if (!points.has(event.pointerId)) return
    points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = gestureRef.current
    if (!gesture) return

    if (gesture.mode === 'pinch') {
      if (points.size < 2) return
      updateRect(scaleRect(gesture.startRect, pointerDistance(points) / gesture.startDistance, minW, minH))
      return
    }
    const dx = (event.clientX - gesture.startX) / displayWidth
    const dy = (event.clientY - gesture.startY) / displayHeight
    updateRect(
      gesture.mode === 'move'
        ? moveRect(gesture.startRect, dx, dy)
        : resizeRect(gesture.startRect, gesture.handle, dx, dy, minW, minH),
    )
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const points = pointersRef.current
    if (!points.delete(event.pointerId)) return
    if (points.size === 1 && gestureRef.current?.mode === 'pinch') {
      // One finger lifted after a pinch: keep dragging the box with the remaining finger.
      const [remaining] = [...points.values()]
      gestureRef.current = { mode: 'move', startRect: rectRef.current, startX: remaining.x, startY: remaining.y }
    } else if (points.size === 0) {
      gestureRef.current = null
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = rectRef.current
    let next: CropRect | null = null
    if (event.shiftKey) {
      if (event.key === 'ArrowRight') next = resizeRect(current, 'e', KEY_STEP, 0, minW, minH)
      if (event.key === 'ArrowLeft') next = resizeRect(current, 'e', -KEY_STEP, 0, minW, minH)
      if (event.key === 'ArrowDown') next = resizeRect(current, 's', 0, KEY_STEP, minW, minH)
      if (event.key === 'ArrowUp') next = resizeRect(current, 's', 0, -KEY_STEP, minW, minH)
    } else {
      if (event.key === 'ArrowRight') next = moveRect(current, KEY_STEP, 0)
      if (event.key === 'ArrowLeft') next = moveRect(current, -KEY_STEP, 0)
      if (event.key === 'ArrowDown') next = moveRect(current, 0, KEY_STEP)
      if (event.key === 'ArrowUp') next = moveRect(current, 0, -KEY_STEP)
    }
    if (next) {
      event.preventDefault()
      updateRect(next)
    }
  }

  const rotate = (delta: 90 | -90) => {
    setRotation((current) => addRotation(current, delta))
    updateRect(delta === 90 ? rotateRectClockwise(rectRef.current) : rotateRectCounterClockwise(rectRef.current))
  }

  const reset = () => {
    setRotation(0)
    updateRect(FULL_RECT)
  }

  const percent = (value: number) => `${value * 100}%`
  const toolButton =
    'inline-flex items-center justify-center gap-1.5 rounded-xl border border-warm-border bg-card px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-amber'

  return (
    <div data-purpose="crop-step" className="space-y-3">
      <div ref={containerRef} className="w-full">
        <div
          data-purpose="crop-stage"
          className="relative mx-auto touch-none select-none"
          style={{ width: displayWidth, height: displayHeight, visibility: containerWidth > 0 ? 'visible' : 'hidden' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {previewUrl ? (
            <img
              data-purpose="crop-image"
              src={previewUrl}
              alt={t('crop.imageAlt')}
              draggable={false}
              className="block h-full w-full rounded-lg border border-warm-border object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg border border-warm-border">
              <SpinnerIcon className="h-6 w-6 text-amber-text" />
            </div>
          )}

          {/* Dim everything outside the crop box. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-navy/45" style={{ height: percent(rect.y) }} />
            <div className="absolute inset-x-0 bottom-0 bg-navy/45" style={{ height: percent(1 - rect.y - rect.h) }} />
            <div
              className="absolute left-0 bg-navy/45"
              style={{ top: percent(rect.y), height: percent(rect.h), width: percent(rect.x) }}
            />
            <div
              className="absolute right-0 bg-navy/45"
              style={{ top: percent(rect.y), height: percent(rect.h), width: percent(1 - rect.x - rect.w) }}
            />
          </div>

          <div
            data-crop-box=""
            data-purpose="crop-box"
            role="group"
            tabIndex={0}
            aria-label={t('crop.boxLabel')}
            aria-describedby={instructionsId}
            onKeyDown={handleKeyDown}
            className="absolute cursor-move border-2 border-amber outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            style={{ left: percent(rect.x), top: percent(rect.y), width: percent(rect.w), height: percent(rect.h) }}
          >
            {HANDLES.map((handle) => (
              <div key={handle} data-crop-handle={handle} className={`absolute ${HANDLE_CLASS[handle]}`}>
                {CORNER_MARK_CLASS[handle] && (
                  <span className={`absolute h-3.5 w-3.5 border-amber ${CORNER_MARK_CLASS[handle]}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p id={instructionsId} className="text-center text-xs text-muted">
        {t('crop.instructions')}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => rotate(-90)} className={toolButton}>
          <RotateLeftIcon className="h-4 w-4" />
          {t('crop.rotateLeft')}
        </button>
        <button type="button" onClick={() => rotate(90)} className={toolButton}>
          <RotateRightIcon className="h-4 w-4" />
          {t('crop.rotateRight')}
        </button>
        <button type="button" onClick={reset} className={toolButton}>
          <RefreshIcon className="h-4 w-4" />
          {t('crop.reset')}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => onApply({ ...rectRef.current, rotation })}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-navy bg-card px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-navy/5 sm:w-auto"
        >
          <CropIcon className="h-4 w-4" />
          {t('crop.useArea')}
        </button>
        <button
          type="button"
          onClick={() => onSkip({ ...FULL_RECT, rotation })}
          className="inline-flex w-full items-center justify-center rounded-xl border border-warm-border bg-card px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-amber sm:w-auto"
        >
          {t('crop.useWhole')}
        </button>
      </div>
    </div>
  )
}
