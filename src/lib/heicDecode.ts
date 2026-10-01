/** Loaded only when a HEIC/HEIF photo is actually encountered, so the main bundle never pays for it. */
export async function decodeHeicToJpegBlob(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  return Array.isArray(result) ? result[0] : result
}
