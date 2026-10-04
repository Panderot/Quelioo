import { Mp3Encoder } from '@breezystack/lamejs'

/** Mono 16-bit PCM to an MP3 (MPEG-2 Layer III at 24 kHz, no CRC, so segments join cleanly). */
export function encodeMp3(pcm: Int16Array, sampleRate: number, kbps = 96): Uint8Array {
  const encoder = new Mp3Encoder(1, sampleRate, kbps)
  const chunks: Uint8Array[] = []
  const block = 1152
  for (let start = 0; start < pcm.length; start += block) {
    const part = encoder.encodeBuffer(pcm.subarray(start, start + block))
    if (part.length > 0) chunks.push(part)
  }
  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(tail)
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let position = 0
  for (const chunk of chunks) {
    out.set(chunk, position)
    position += chunk.length
  }
  return out
}
