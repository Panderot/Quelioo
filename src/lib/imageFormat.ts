/**
 * Detects a photo's real format from its magic bytes (never from `file.type` or the file name):
 * Windows commonly reports an empty MIME type for HEIC, and extensions can be uppercase or wrong.
 * SVG is the one exception — it's sniffed as text, since it has no binary magic number.
 */
export type DetectedImageFormat =
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'bmp'
  | 'ico'
  | 'tiff'
  | 'dng'
  | 'heic'
  | 'avif'
  | 'svg'
  | 'unknown'

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

function bytesMatch(bytes: Uint8Array, offset: number, pattern: number[]): boolean {
  if (bytes.length < offset + pattern.length) return false
  return pattern.every((value, index) => bytes[offset + index] === value)
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return ''
  return Array.from(bytes.slice(offset, offset + length))
    .map((byte) => String.fromCharCode(byte))
    .join('')
}

function hasExtension(name: string, ...extensions: string[]): boolean {
  const lower = name.toLowerCase()
  return extensions.some((extension) => lower.endsWith(extension))
}

function looksLikeSvgText(text: string): boolean {
  // Strip a BOM, then any leading XML prolog / comments / doctype before the first real tag.
  const stripped = text.replace(/^\uFEFF/, '').trimStart()
  return /^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype[^>]*>\s*)?<svg[\s>]/i.test(stripped)
}

async function sniffSvg(file: File): Promise<boolean> {
  if (file.type === 'image/svg+xml' || hasExtension(file.name, '.svg')) {
    try {
      const text = await file.slice(0, 4096).text()
      if (looksLikeSvgText(text)) return true
    } catch {
      // fall through to the generic text sniff below
    }
  }
  try {
    const text = await file.slice(0, 4096).text()
    return looksLikeSvgText(text)
  } catch {
    return false
  }
}

export async function detectImageFormat(file: File): Promise<DetectedImageFormat> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())

  if (bytesMatch(head, 0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (bytesMatch(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (bytesMatch(head, 0, [0x47, 0x49, 0x46, 0x38])) return 'gif'
  if (bytesMatch(head, 0, [0x00, 0x00, 0x01, 0x00])) return 'ico'
  if (asciiAt(head, 0, 4) === 'RIFF' && asciiAt(head, 8, 4) === 'WEBP') return 'webp'
  if (bytesMatch(head, 0, [0x42, 0x4d])) return 'bmp'

  if (bytesMatch(head, 0, [0x49, 0x49, 0x2a, 0x00]) || bytesMatch(head, 0, [0x4d, 0x4d, 0x00, 0x2a])) {
    return hasExtension(file.name, '.dng') ? 'dng' : 'tiff'
  }

  if (asciiAt(head, 4, 4) === 'ftyp') {
    const brand = asciiAt(head, 8, 4).toLowerCase().trim()
    if (HEIC_BRANDS.has(brand)) return 'heic'
    if (AVIF_BRANDS.has(brand)) return 'avif'
  }

  if (await sniffSvg(file)) return 'svg'

  return 'unknown'
}
