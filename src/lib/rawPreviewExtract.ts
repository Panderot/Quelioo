/**
 * iPhone ProRAW / Android RAW .dng files are TIFF containers that embed a full JPEG preview
 * alongside the raw sensor data. Properly walking the TIFF IFD/SubIFD tags to find that preview
 * is brittle across camera makes, so instead this scans the raw bytes for JPEG SOI/EOI markers
 * (0xFFD8 ... 0xFFD9) and keeps the largest contiguous span found — a well-known trick for
 * pulling the embedded preview out of RAW formats without a real TIFF/EXIF walk.
 */
export function extractLargestEmbeddedJpeg(bytes: Uint8Array): Uint8Array | null {
  let bestStart = -1
  let bestEnd = -1
  let bestLength = 0

  let searchFrom = 0
  while (searchFrom < bytes.length - 1) {
    const start = indexOfMarker(bytes, 0xff, 0xd8, searchFrom)
    if (start === -1) break

    const end = indexOfMarker(bytes, 0xff, 0xd9, start + 2)
    if (end === -1) {
      searchFrom = start + 2
      continue
    }

    const length = end + 2 - start
    if (length > bestLength) {
      bestStart = start
      bestEnd = end + 2
      bestLength = length
    }
    searchFrom = end + 2
  }

  if (bestStart === -1) return null
  return bytes.slice(bestStart, bestEnd)
}

function indexOfMarker(bytes: Uint8Array, first: number, second: number, from: number): number {
  for (let i = from; i < bytes.length - 1; i += 1) {
    if (bytes[i] === first && bytes[i + 1] === second) return i
  }
  return -1
}
