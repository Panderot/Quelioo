const METADATA_TIMEOUT_MS = 8000

/** The real length of an audio file in whole seconds, read from the file itself (null when the
 * browser can't decode it in time). Songs store this instead of the length that was requested. */
export function measureAudioDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), METADATA_TIMEOUT_MS)
    audio.preload = 'metadata'
    // Under half a second isn't a real song, so it counts as "could not measure".
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration >= 0.5 ? Math.round(audio.duration) : null)
    audio.onerror = () => finish(null)
    audio.src = url
  })
}
