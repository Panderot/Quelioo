const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

export interface CompressedImage {
  dataUrl: string
  mimeType: 'image/jpeg'
  byteLength: number
}

interface ImageSource {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

async function loadImageSource(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() }
  }

  const url = URL.createObjectURL(file)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = url
  })
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) }
}

function scaledDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longestSide = Math.max(width, height)
  if (longestSide <= maxDimension) return { width, height }
  const scale = maxDimension / longestSide
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function estimateBase64ByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((base64.length * 3) / 4)
}

export async function compressImageForSolve(file: File): Promise<CompressedImage> {
  const { source, width, height, cleanup } = await loadImageSource(file)
  try {
    const scaled = scaledDimensions(width, height, MAX_DIMENSION)
    const canvas = document.createElement('canvas')
    canvas.width = scaled.width
    canvas.height = scaled.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_unavailable')
    ctx.drawImage(source, 0, 0, scaled.width, scaled.height)

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    return { dataUrl, mimeType: 'image/jpeg', byteLength: estimateBase64ByteLength(dataUrl) }
  } finally {
    cleanup()
  }
}
