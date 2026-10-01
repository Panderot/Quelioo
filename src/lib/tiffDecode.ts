/** Loaded only when a TIFF photo is actually encountered — no evergreen browser decodes TIFF natively. */
export interface DecodedTiffPage {
  width: number
  height: number
  rgba: Uint8Array
}

/** Decodes the first page/frame of a (non-RAW) TIFF. Returns null if the file has no decodable page. */
export async function decodeTiffFirstPage(buffer: ArrayBuffer): Promise<DecodedTiffPage | null> {
  const UTIF = await import('utif')
  const ifds = UTIF.decode(buffer)
  if (ifds.length === 0) return null

  const ifd = ifds[0]
  UTIF.decodeImage(buffer, ifd, ifds)
  if (!ifd.width || !ifd.height) return null

  const rgba = UTIF.toRGBA8(ifd)
  return { width: ifd.width, height: ifd.height, rgba }
}
