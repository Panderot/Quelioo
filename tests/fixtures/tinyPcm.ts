/** Synthetic raw PCM for tests (what gpt-4o-mini-tts returns with response_format "pcm": 24 kHz, 16-bit,
 * little-endian, mono): a quiet, syllable-like modulated tone, so loudness normalization has real work to do. */
export const PCM_RATE = 24000

export function tinyPcmSamples(seconds: number, amplitude = 0.03): Float32Array {
  const count = Math.round(seconds * PCM_RATE)
  const out = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    const t = index / PCM_RATE
    const syllables = Math.max(0, Math.sin(2 * Math.PI * 4 * t)) ** 0.5
    out[index] = amplitude * syllables * (Math.sin(2 * Math.PI * 180 * t) + 0.5 * Math.sin(2 * Math.PI * 1300 * t))
  }
  return out
}

export function tinyPcm(seconds: number, amplitude = 0.03): Uint8Array {
  const samples = tinyPcmSamples(seconds, amplitude)
  const out = new Uint8Array(samples.length * 2)
  const view = new DataView(out.buffer)
  samples.forEach((value, index) => view.setInt16(index * 2, Math.round(value * 32767), true))
  return out
}

/** A steady voiced tone that glides from `startHz` to `endHz` over its last 0.5 s (a flat, rising or falling line ending). */
export function glideSamples(seconds: number, startHz: number, endHz: number, amplitude = 0.2): Float32Array {
  const count = Math.round(seconds * PCM_RATE)
  const out = new Float32Array(count)
  const glideStart = Math.max(0, seconds - 0.5)
  let phase = 0
  for (let index = 0; index < count; index += 1) {
    const t = index / PCM_RATE
    const hz = t < glideStart ? startHz : startHz + ((endHz - startHz) * (t - glideStart)) / 0.5
    phase += (2 * Math.PI * hz) / PCM_RATE
    out[index] = amplitude * (Math.sin(phase) + 0.4 * Math.sin(2 * phase) + 0.2 * Math.sin(3 * phase))
  }
  return out
}

export function glidePcm(seconds: number, startHz: number, endHz: number): Uint8Array {
  const samples = glideSamples(seconds, startHz, endHz)
  const out = new Uint8Array(samples.length * 2)
  const view = new DataView(out.buffer)
  samples.forEach((value, index) => view.setInt16(index * 2, Math.round(value * 32767), true))
  return out
}
