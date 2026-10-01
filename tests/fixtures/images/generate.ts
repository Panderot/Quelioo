/**
 * One-off fixture generator — NOT part of the normal test run. Produces small, real, valid image
 * files under tests/fixtures/images/ covering every format src/lib/imageFormat.ts detects and
 * src/lib/imageNormalize.ts decodes. Run once with: npx tsx tests/fixtures/images/generate.ts
 *
 * JPEG/PNG/WebP pixel data comes from headless Chromium canvas (no sharp/canvas npm package is
 * installed). BMP/ICO/TIFF/DNG are hand-encoded here since no encoder library is available either.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = dirname(fileURLToPath(import.meta.url))

function out(name: string, data: Buffer) {
  writeFileSync(join(OUT_DIR, name), data)
  console.log(`wrote ${name} (${data.length} bytes)`)
}

// ---------------------------------------------------------------------------
// BMP (24-bit uncompressed) — a quadrant-colored square so orientation/color is checkable.
// ---------------------------------------------------------------------------
function buildBmp(size: number, quadrant: (x: number, y: number) => [number, number, number]): Buffer {
  const rowSize = Math.ceil((size * 3) / 4) * 4
  const pixelArraySize = rowSize * size
  const fileSize = 14 + 40 + pixelArraySize
  const buf = Buffer.alloc(fileSize)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(0, 6)
  buf.writeUInt32LE(54, 10) // pixel data offset
  buf.writeUInt32LE(40, 14) // DIB header size
  buf.writeInt32LE(size, 18)
  buf.writeInt32LE(size, 22)
  buf.writeUInt16LE(1, 26) // planes
  buf.writeUInt16LE(24, 28) // bit count
  buf.writeUInt32LE(0, 30) // BI_RGB
  buf.writeUInt32LE(pixelArraySize, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)
  for (let row = 0; row < size; row += 1) {
    // BMP rows are bottom-up.
    const y = size - 1 - row
    const rowOffset = 54 + row * rowSize
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = quadrant(x, y)
      const px = rowOffset + x * 3
      buf[px] = b
      buf[px + 1] = g
      buf[px + 2] = r
    }
  }
  return buf
}

function quadrantColor(size: number): (x: number, y: number) => [number, number, number] {
  return (x, y) => {
    const left = x < size / 2
    const top = y < size / 2
    if (left && top) return [220, 40, 40] // red: top-left
    if (!left && top) return [40, 160, 60] // green: top-right
    if (left && !top) return [40, 80, 210] // blue: bottom-left
    return [230, 200, 40] // yellow: bottom-right
  }
}

// ---------------------------------------------------------------------------
// ICO wrapping a PNG frame (matches icoDecode.ts's PNG branch).
// ---------------------------------------------------------------------------
function buildIcoFromPng(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(1, 4) // 1 image
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2) // color count
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bit count
  entry.writeUInt32LE(png.length, 8) // bytes in resource
  entry.writeUInt32LE(22, 12) // offset (6 header + 16 entry)
  return Buffer.concat([header, entry, png])
}

// ---------------------------------------------------------------------------
// Minimal baseline TIFF (uncompressed RGB, little-endian), single or multi-page.
// ---------------------------------------------------------------------------
interface TiffPage {
  width: number
  height: number
  rgb: Buffer // width*height*3 interleaved RGB
}

function buildTiff(pages: TiffPage[]): Buffer {
  const chunks: Buffer[] = []
  let offset = 8 // after the 8-byte header
  const ifdOffsets: number[] = []

  // First pass: compute layout (IFD, external value blocks, pixel data) for every page in order.
  // 9 entries: ImageWidth/Length/BitsPerSample/Compression/Photometric/StripOffsets/SamplesPerPixel/RowsPerStrip/StripByteCounts.
  const planned = pages.map((page) => {
    const entryCount = 9
    const ifdSize = 2 + entryCount * 12 + 4
    const ifdOffset = offset
    offset += ifdSize
    const bitsPerSampleOffset = offset // 3 SHORTs = 6 bytes, doesn't fit inline
    offset += 6
    const stripOffset = offset
    offset += page.rgb.length
    return { page, ifdOffset, bitsPerSampleOffset, stripOffset }
  })

  const header = Buffer.alloc(8)
  header.write('II', 0, 'ascii')
  header.writeUInt16LE(42, 2)
  header.writeUInt32LE(planned[0].ifdOffset, 4)
  chunks.push(header)

  for (let i = 0; i < planned.length; i += 1) {
    const { page, ifdOffset, bitsPerSampleOffset, stripOffset } = planned[i]
    const nextIfdOffset = i + 1 < planned.length ? planned[i + 1].ifdOffset : 0
    ifdOffsets.push(ifdOffset)

    const entries: { tag: number; type: number; count: number; value: number }[] = [
      { tag: 256, type: 3, count: 1, value: page.width }, // ImageWidth (SHORT)
      { tag: 257, type: 3, count: 1, value: page.height }, // ImageLength (SHORT)
      { tag: 258, type: 3, count: 3, value: bitsPerSampleOffset }, // BitsPerSample -> offset
      { tag: 259, type: 3, count: 1, value: 1 }, // Compression = none
      { tag: 262, type: 3, count: 1, value: 2 }, // PhotometricInterpretation = RGB
      { tag: 273, type: 4, count: 1, value: stripOffset }, // StripOffsets
      { tag: 277, type: 3, count: 1, value: 3 }, // SamplesPerPixel
      { tag: 278, type: 3, count: 1, value: page.height }, // RowsPerStrip
    ]
    // StripByteCounts (279, LONG) needs a 9th entry — recompute entryCount above accordingly.
    entries.push({ tag: 279, type: 4, count: 1, value: page.rgb.length })

    const ifd = Buffer.alloc(2 + entries.length * 12 + 4)
    ifd.writeUInt16LE(entries.length, 0)
    entries.forEach((entry, idx) => {
      const base = 2 + idx * 12
      ifd.writeUInt16LE(entry.tag, base)
      ifd.writeUInt16LE(entry.type, base + 2)
      ifd.writeUInt32LE(entry.count, base + 4)
      ifd.writeUInt32LE(entry.value, base + 8)
    })
    ifd.writeUInt32LE(nextIfdOffset, 2 + entries.length * 12)
    chunks.push(ifd)

    const bps = Buffer.alloc(6)
    bps.writeUInt16LE(8, 0)
    bps.writeUInt16LE(8, 2)
    bps.writeUInt16LE(8, 4)
    chunks.push(bps)

    chunks.push(page.rgb)
  }

  return Buffer.concat(chunks)
}

function solidRgb(width: number, height: number, quadrant: (x: number, y: number) => [number, number, number]): Buffer {
  const buf = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = quadrant(x, y)
      const o = (y * width + x) * 3
      buf[o] = r
      buf[o + 1] = g
      buf[o + 2] = b
    }
  }
  return buf
}

// ---------------------------------------------------------------------------
// Inject a minimal EXIF APP1 segment (Orientation tag only) right after a JPEG's SOI marker.
// ---------------------------------------------------------------------------
function injectExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a jpeg')

  const tiff = Buffer.alloc(8 + 2 + 12 + 4)
  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4) // IFD0 offset
  tiff.writeUInt16LE(1, 8) // 1 entry
  tiff.writeUInt16LE(0x0112, 10) // Orientation tag
  tiff.writeUInt16LE(3, 12) // type SHORT
  tiff.writeUInt32LE(1, 14) // count
  tiff.writeUInt16LE(orientation, 18) // value (first 2 bytes of the 4-byte slot)
  tiff.writeUInt16LE(0, 20) // padding
  tiff.writeUInt32LE(0, 22) // next IFD offset

  const exifHeader = Buffer.from('Exif\0\0', 'ascii')
  const app1Payload = Buffer.concat([exifHeader, tiff])
  // JPEG markers/length fields are big-endian.
  const app1 = Buffer.alloc(2 + 2 + app1Payload.length)
  app1.writeUInt8(0xff, 0)
  app1.writeUInt8(0xe1, 1)
  app1.writeUInt16BE(2 + app1Payload.length, 2)
  app1Payload.copy(app1, 4)

  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)])
}

// ---------------------------------------------------------------------------
// Minimal animated GIF (2 frames, 4-color palette, trivial/uncompressed-equivalent LZW).
// ---------------------------------------------------------------------------
function lzwEncodeTrivial(indices: number[], minCodeSize: number): Buffer {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const codeSize = minCodeSize + 1
  const bits: number[] = []
  const pushCode = (code: number) => {
    for (let i = 0; i < codeSize; i += 1) bits.push((code >> i) & 1)
  }
  pushCode(clearCode)
  for (const index of indices) pushCode(index)
  pushCode(eoiCode)

  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let b = 0; b < 8; b += 1) {
      if (bits[i + b]) byte |= 1 << b
    }
    bytes.push(byte)
  }
  return Buffer.from(bytes)
}

function buildAnimatedGif(size: number, palette: [number, number, number][], frames: number[][]): Buffer {
  const minCodeSize = 2 // GIF requires >= 2 even for a 4-color table
  const chunks: Buffer[] = []

  const header = Buffer.from('GIF89a', 'ascii')
  chunks.push(header)

  const lsd = Buffer.alloc(7)
  lsd.writeUInt16LE(size, 0)
  lsd.writeUInt16LE(size, 2)
  lsd.writeUInt8(0b1000_0001, 4) // global color table, size = 2^(1+1)=4
  lsd.writeUInt8(0, 5)
  lsd.writeUInt8(0, 6)
  chunks.push(lsd)

  const gct = Buffer.alloc(4 * 3)
  palette.forEach(([r, g, b], i) => {
    gct[i * 3] = r
    gct[i * 3 + 1] = g
    gct[i * 3 + 2] = b
  })
  chunks.push(gct)

  // NETSCAPE2.0 application extension — infinite loop (purely cosmetic, not required for validity).
  const app = Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0x00, 0x00, 0x00])
  chunks.push(app)

  for (const frame of frames) {
    const gce = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00]) // 100ms delay
    chunks.push(gce)

    const id = Buffer.alloc(10)
    id[0] = 0x2c
    id.writeUInt16LE(0, 1)
    id.writeUInt16LE(0, 3)
    id.writeUInt16LE(size, 5)
    id.writeUInt16LE(size, 7)
    id[9] = 0 // no local color table
    chunks.push(id)

    const lzwData = lzwEncodeTrivial(frame, minCodeSize)
    const blocks: Buffer[] = [Buffer.from([minCodeSize])]
    for (let i = 0; i < lzwData.length; i += 255) {
      const slice = lzwData.subarray(i, i + 255)
      blocks.push(Buffer.from([slice.length]), slice)
    }
    blocks.push(Buffer.from([0x00]))
    chunks.push(Buffer.concat(blocks))
  }

  chunks.push(Buffer.from([0x3b])) // trailer
  return Buffer.concat(chunks)
}

// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Passed as a source string (not a function reference) so esbuild/tsx's dev-mode `__name` helper
  // injection — which breaks when Playwright serializes a transpiled function into the page — never
  // applies to this code.
  const browserScript = `
    (() => {
      function draw(size) {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = 'rgb(220,40,40)'
        ctx.fillRect(0, 0, size / 2, size / 2)
        ctx.fillStyle = 'rgb(40,160,60)'
        ctx.fillRect(size / 2, 0, size / 2, size / 2)
        ctx.fillStyle = 'rgb(40,80,210)'
        ctx.fillRect(0, size / 2, size / 2, size / 2)
        ctx.fillStyle = 'rgb(230,200,40)'
        ctx.fillRect(size / 2, size / 2, size / 2, size / 2)
        return canvas
      }

      function drawTransparent(size) {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, size, size)
        ctx.fillStyle = 'rgba(40,120,220,0.6)'
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
        ctx.fill()
        return canvas
      }

      // imageNormalize.ts rejects anything under MIN_DIMENSION=200px as "too small", so every
      // "valid" fixture must clear that — 220 gives comfortable headroom while staying tiny.
      const square = draw(220)
      const transparent = drawTransparent(220)
      const tooSmall = draw(60)
      const iconSquare = draw(256)

      return {
        jpeg: square.toDataURL('image/jpeg', 0.92),
        png: transparent.toDataURL('image/png'),
        webp: square.toDataURL('image/webp'),
        avif: square.toDataURL('image/avif'),
        tooSmallJpeg: tooSmall.toDataURL('image/jpeg', 0.92),
        iconPng: iconSquare.toDataURL('image/png'),
      }
    })()
  `
  const canvasImage = (await page.evaluate(browserScript)) as Record<string, string>

  await browser.close()

  function dataUrlToBuffer(dataUrl: string): { mime: string; buffer: Buffer } {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
    if (!match) throw new Error(`not a data URL: ${dataUrl.slice(0, 40)}`)
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') }
  }

  // --- JPEG ---
  const jpeg = dataUrlToBuffer(canvasImage.jpeg)
  out('plain.jpg', jpeg.buffer)

  // --- JPEG with EXIF orientation (90deg CW tag) ---
  out('exif-rotated.jpg', injectExifOrientation(jpeg.buffer, 6))

  // --- JPEG under MIN_DIMENSION (60px) for the too_small error path ---
  out('too-small.jpg', dataUrlToBuffer(canvasImage.tooSmallJpeg).buffer)

  // --- PNG with transparency ---
  const png = dataUrlToBuffer(canvasImage.png)
  out('transparent.png', png.buffer)

  // --- PNG used only as the ICO's embedded frame (256px, ICO's traditional size ceiling) ---
  const iconPng = dataUrlToBuffer(canvasImage.iconPng)

  // --- WebP ---
  const webp = dataUrlToBuffer(canvasImage.webp)
  if (webp.mime === 'image/webp') {
    out('plain.webp', webp.buffer)
  } else {
    console.log(`SKIP webp: Chromium gave back ${webp.mime} instead of image/webp`)
  }

  // --- AVIF ---
  const avif = dataUrlToBuffer(canvasImage.avif)
  if (avif.mime === 'image/avif') {
    out('plain.avif', avif.buffer)
    console.log('AVIF: got a real encode from Chromium canvas — real positive-path coverage.')
  } else {
    console.log(`SKIP real avif fixture: Chromium gave back ${avif.mime} instead of image/avif (no canvas AVIF encoder in this build).`)
  }

  // --- BMP ---
  out('plain.bmp', buildBmp(220, quadrantColor(220)))

  // --- ICO (PNG-backed frame, 256px — icoDecode's PNG branch) ---
  out('icon.ico', buildIcoFromPng(iconPng.buffer, 256))

  // --- SVG (explicit width/height above MIN_DIMENSION so the rasterized intrinsic size clears it) ---
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect width="110" height="110" fill="#dc2828"/><rect x="110" width="110" height="110" fill="#28a03c"/><rect y="110" width="110" height="110" fill="#2850d2"/><rect x="110" y="110" width="110" height="110" fill="#e6c828"/></svg>\n`
  out('plain.svg', Buffer.from(svg, 'utf8'))

  // --- TIFF (single page) ---
  const rgb220 = solidRgb(220, 220, quadrantColor(220))
  out('single-page.tiff', buildTiff([{ width: 220, height: 220, rgb: rgb220 }]))

  // --- TIFF (multi page) — only the first page needs to clear MIN_DIMENSION, since
  // decodeTiffFirstPage only ever reads the first IFD; the second page is just proof
  // multi-IFD files parse without the first page's StripOffsets/next-IFD math breaking.
  const rgb24 = solidRgb(24, 24, quadrantColor(24))
  out(
    'multi-page.tiff',
    buildTiff([
      { width: 220, height: 220, rgb: rgb220 },
      { width: 24, height: 24, rgb: rgb24 },
    ]),
  )

  // --- DNG: a valid single-page TIFF followed by a real embedded JPEG span ---
  const tiffBytes = buildTiff([{ width: 220, height: 220, rgb: rgb220 }])
  out('preview.dng', Buffer.concat([tiffBytes, jpeg.buffer]))

  // --- Animated GIF (2 frames, trivial LZW, 4-color palette) ---
  const palette: [number, number, number][] = [
    [220, 40, 40],
    [40, 160, 60],
    [40, 80, 210],
    [230, 200, 40],
  ]
  const gifSize = 220
  const frameA = new Array(gifSize * gifSize).fill(0)
  const frameB = new Array(gifSize * gifSize).fill(1)
  out('animated.gif', buildAnimatedGif(gifSize, palette, [frameA, frameB]))

  // --- HEIC: header-only synthetic (ftyp box only, no real image data) — graceful-failure only. ---
  const heicFtyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]), // box size
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('heic', 'ascii'), // major brand
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // minor version
    Buffer.from('heicmif1', 'ascii'), // compatible brands
  ])
  out('synthetic-no-data.heic', heicFtyp)

  console.log('\nDone. Gap summary:')
  console.log('- CMYK JPEG: not generated (no hand-rolled 4-component baseline JPEG encoder here) — documented gap.')
  console.log('- Real HEIC decode: not covered (no HEIC encoder available offline) — only graceful decode_failed is tested.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
