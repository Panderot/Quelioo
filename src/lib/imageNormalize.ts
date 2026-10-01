import { decodeIco } from './icoDecode'
import { detectImageFormat } from './imageFormat'
import type { DetectedImageFormat } from './imageFormat'
import { decodeHeicToJpegBlob } from './heicDecode'
import { extractLargestEmbeddedJpeg } from './rawPreviewExtract'
import { decodeTiffFirstPage } from './tiffDecode'
import { FULL_CROP, toSourceRegion } from './imageCrop'
import type { CropRotation, CropSpec } from './imageCrop'

export type NormalizeFailureReason = 'too_large' | 'unsupported' | 'decode_failed' | 'too_small'

export class ImageNormalizeError extends Error {
  reason: NormalizeFailureReason

  constructor(reason: NormalizeFailureReason) {
    super(reason)
    this.reason = reason
  }
}

export interface NormalizedImage {
  dataUrl: string
  mimeType: 'image/jpeg'
  byteLength: number
}

/** A photo decoded at full resolution (EXIF orientation applied), kept around so crops can be
 * re-encoded from the original pixels instead of an already-downscaled JPEG. */
export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

interface DrawableSource {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

// Phone photos and RAW files can be large; this is the original-file ceiling, before normalization.
const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024
const MIN_DIMENSION = 200
// Largest dimension first; falls back to smaller renders only if quality backoff alone isn't enough.
const DIMENSION_STEPS = [1600, 1200, 900]
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4]
// Stays comfortably under the server's own cap (api/_lib/solve.ts) once base64-encoded.
const TARGET_MAX_BYTES = 2.2 * 1024 * 1024
// On-screen crop preview: sharp enough for high-DPI phones without holding a full-size copy.
const PREVIEW_MAX_SIDE = 2048

function scaledDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longestSide = Math.max(width, height)
  if (longestSide <= maxDimension) return { width, height }
  const scale = maxDimension / longestSide
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function estimateBase64ByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((base64.length * 3) / 4)
}

/** Decodes a blob with the browser's native image pipeline, preferring createImageBitmap (which also
 * applies EXIF orientation) and falling back to an <img> element for formats/browsers where that throws. */
async function loadBitmapFromBlob(blob: Blob, forceImageElement = false): Promise<DrawableSource> {
  if (!forceImageElement && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() }
    } catch {
      // Some browser/format combinations (older Firefox + bmp/ico, some SVGs) throw here — fall back to <img>.
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image_load_failed'))
      img.src = url
    })
    if (img.naturalWidth === 0 || img.naturalHeight === 0) throw new Error('image_load_failed')
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function drawableFromRgba(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): DrawableSource {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  return { source: canvas, width, height, cleanup: () => {} }
}

async function decodeByFormat(file: File, format: DetectedImageFormat): Promise<DrawableSource> {
  switch (format) {
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'bmp':
    case 'avif':
      return loadBitmapFromBlob(file)

    case 'svg':
      // Forced through <img> for consistent cross-browser SVG rasterization.
      return loadBitmapFromBlob(file, true)

    case 'heic': {
      const jpegBlob = await decodeHeicToJpegBlob(file)
      return loadBitmapFromBlob(jpegBlob)
    }

    case 'ico': {
      const buffer = await file.arrayBuffer()
      const decoded = decodeIco(buffer)
      if (!decoded) throw new Error('decode_failed')
      if (decoded.kind === 'png') return loadBitmapFromBlob(new Blob([new Uint8Array(decoded.bytes)], { type: 'image/png' }))
      return drawableFromRgba(decoded.width, decoded.height, decoded.rgba)
    }

    case 'tiff': {
      const buffer = await file.arrayBuffer()
      const page = await decodeTiffFirstPage(buffer)
      if (!page) throw new Error('decode_failed')
      return drawableFromRgba(page.width, page.height, page.rgba)
    }

    case 'dng': {
      const buffer = await file.arrayBuffer()
      const jpegBytes = extractLargestEmbeddedJpeg(new Uint8Array(buffer))
      if (!jpegBytes) throw new Error('decode_failed')
      return loadBitmapFromBlob(new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' }))
    }

    case 'unknown':
      throw new Error('unsupported')
  }
}

/** Flattens onto white (so transparent PNG/WebP/GIF/SVG/ICO photos don't turn black for the model),
 * crops/rotates straight from the full-resolution source, resizes, and re-encodes as JPEG, backing
 * off quality then dimension until the result is small enough. Never allocates a full-size
 * intermediate canvas, so huge photos stay within mobile canvas limits. */
function encodeNormalized(decoded: DecodedImage, crop: CropSpec): NormalizedImage {
  const region = toSourceRegion(crop, decoded.width, decoded.height)
  const quarterTurn = crop.rotation === 90 || crop.rotation === 270
  const outW = quarterTurn ? region.height : region.width
  const outH = quarterTurn ? region.width : region.height
  let last: { dataUrl: string; byteLength: number } | null = null

  for (const maxDimension of DIMENSION_STEPS) {
    const scaled = scaledDimensions(outW, outH, maxDimension)
    const canvas = document.createElement('canvas')
    canvas.width = scaled.width
    canvas.height = scaled.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageNormalizeError('decode_failed')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, scaled.width, scaled.height)
    ctx.imageSmoothingQuality = 'high'
    // Draw the source region unrotated around the canvas center, then rotate into place.
    const drawW = quarterTurn ? scaled.height : scaled.width
    const drawH = quarterTurn ? scaled.width : scaled.height
    ctx.translate(scaled.width / 2, scaled.height / 2)
    ctx.rotate((crop.rotation * Math.PI) / 180)
    ctx.drawImage(decoded.source, region.x, region.y, region.width, region.height, -drawW / 2, -drawH / 2, drawW, drawH)

    for (const quality of QUALITY_STEPS) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const byteLength = estimateBase64ByteLength(dataUrl)
      last = { dataUrl, byteLength }
      if (byteLength <= TARGET_MAX_BYTES) {
        return { dataUrl, mimeType: 'image/jpeg', byteLength }
      }
    }
  }

  // Exhausted every dimension/quality combination — hand back the smallest attempt; the server's
  // own hard size cap (api/_lib/solve.ts) is the backstop if even this is somehow still too big.
  return { dataUrl: last!.dataUrl, mimeType: 'image/jpeg', byteLength: last!.byteLength }
}

/**
 * Decodes any supported photo format at full resolution with EXIF orientation applied. The caller
 * owns the result and must call release() once it no longer needs it. Throws ImageNormalizeError
 * with a reason the caller can map to a localized message.
 */
export async function decodeImageForSolve(file: File): Promise<DecodedImage> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new ImageNormalizeError('too_large')

  const format = await detectImageFormat(file)
  if (format === 'unknown') throw new ImageNormalizeError('unsupported')

  let drawable: DrawableSource
  try {
    drawable = await decodeByFormat(file, format)
  } catch {
    throw new ImageNormalizeError('decode_failed')
  }

  if (Math.min(drawable.width, drawable.height) < MIN_DIMENSION) {
    drawable.cleanup()
    throw new ImageNormalizeError('too_small')
  }
  return { source: drawable.source, width: drawable.width, height: drawable.height, release: drawable.cleanup }
}

/** Encodes a crop (normalized to the rotated image) of an already-decoded photo into the upload JPEG. */
export function encodeCroppedImage(decoded: DecodedImage, crop: CropSpec = FULL_CROP): NormalizedImage {
  return encodeNormalized(decoded, crop)
}

/** Renders a downscaled, rotated copy of the decoded photo for on-screen display (crop step). */
export function renderPreviewCanvas(decoded: DecodedImage, rotation: CropRotation, maxSide = PREVIEW_MAX_SIDE): HTMLCanvasElement {
  const base = scaledDimensions(decoded.width, decoded.height, maxSide)
  const quarterTurn = rotation === 90 || rotation === 270
  const canvas = document.createElement('canvas')
  canvas.width = quarterTurn ? base.height : base.width
  canvas.height = quarterTurn ? base.width : base.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageNormalizeError('decode_failed')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(decoded.source, -base.width / 2, -base.height / 2, base.width, base.height)
  return canvas
}

/**
 * Turns any supported photo format into a single normalized JPEG the server always knows how to
 * read: EXIF-oriented, flattened onto white, resized to a sane max dimension. Throws
 * ImageNormalizeError with a reason the caller can map to a localized message.
 */
export async function normalizeImageForSolve(file: File): Promise<NormalizedImage> {
  const decoded = await decodeImageForSolve(file)
  try {
    return encodeNormalized(decoded, FULL_CROP)
  } finally {
    decoded.release()
  }
}
