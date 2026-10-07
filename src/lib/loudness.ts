/** Loudness normalization for Audio Lesson speech (pure, no dependencies): ITU-R BS.1770 integrated
 * loudness of a mono PCM line, then one gain that brings it to the target, with a look-ahead peak
 * limiter so the sample peak never passes the ceiling. Used on the server before a line is encoded to MP3. */

/** Phones play quiet speech badly; -16 LUFS is the common podcast level for mobile listening. */
export const TARGET_LUFS = -16
/** Measured on real lessons: lines normalized one by one, joined and MP3-encoded land about 0.65 LU below
 * the per-line target in an independent EBU R128 meter (ffmpeg ebur128), so each line aims slightly higher. */
const LINE_OFFSET_LU = 0.65
/** Sample-peak ceiling in dBFS; it keeps the true peak under -1 dBTP for speech. */
export const PEAK_CEILING_DB = -2
/** A single line is never boosted or cut by more than this (a very short line measures unreliably). */
const MAX_BOOST_DB = 15
const MAX_CUT_DB = 12

interface Biquad {
  b: [number, number, number]
  a: [number, number]
}

/** BS.1770 K-weighting (high shelf + high pass) for any sample rate, via the bilinear transform. */
function kWeighting(sampleRate: number): Biquad[] {
  const shelfF = 1681.974450955533
  const shelfGain = 3.999843853973347
  const shelfQ = 0.7071752369554196
  const k1 = Math.tan((Math.PI * shelfF) / sampleRate)
  const vh = 10 ** (shelfGain / 20)
  const vb = vh ** 0.4996667741545416
  const a0 = 1 + k1 / shelfQ + k1 * k1
  const shelf: Biquad = {
    b: [(vh + (vb * k1) / shelfQ + k1 * k1) / a0, (2 * (k1 * k1 - vh)) / a0, (vh - (vb * k1) / shelfQ + k1 * k1) / a0],
    a: [(2 * (k1 * k1 - 1)) / a0, (1 - k1 / shelfQ + k1 * k1) / a0],
  }
  const highF = 38.13547087602444
  const highQ = 0.5003270373238773
  const k2 = Math.tan((Math.PI * highF) / sampleRate)
  const d = 1 + k2 / highQ + k2 * k2
  const high: Biquad = { b: [1, -2, 1], a: [(2 * (k2 * k2 - 1)) / d, (1 - k2 / highQ + k2 * k2) / d] }
  return [shelf, high]
}

function filter(samples: Float32Array, stage: Biquad): Float32Array {
  const out = new Float32Array(samples.length)
  let z1 = 0
  let z2 = 0
  for (let index = 0; index < samples.length; index += 1) {
    const x = samples[index]
    const y = stage.b[0] * x + z1
    z1 = stage.b[1] * x - stage.a[0] * y + z2
    z2 = stage.b[2] * x - stage.a[1] * y
    out[index] = y
  }
  return out
}

/** Integrated loudness in LUFS (absolute gate -70, relative gate -10); -Infinity for silence. */
export function integratedLufs(samples: Float32Array, sampleRate: number): number {
  if (samples.length === 0) return Number.NEGATIVE_INFINITY
  let weighted = samples
  for (const stage of kWeighting(sampleRate)) weighted = filter(weighted, stage)
  const block = Math.round(0.4 * sampleRate)
  const hop = Math.round(0.1 * sampleRate)
  const energies: number[] = []
  if (weighted.length < block) {
    energies.push(meanSquare(weighted, 0, weighted.length))
  } else {
    for (let start = 0; start + block <= weighted.length; start += hop) energies.push(meanSquare(weighted, start, start + block))
  }
  const toLufs = (energy: number) => -0.691 + 10 * Math.log10(energy)
  const absolute = energies.filter((energy) => energy > 0 && toLufs(energy) > -70)
  if (absolute.length === 0) return Number.NEGATIVE_INFINITY
  const relativeGate = toLufs(absolute.reduce((sum, energy) => sum + energy, 0) / absolute.length) - 10
  const gated = absolute.filter((energy) => toLufs(energy) > relativeGate)
  if (gated.length === 0) return Number.NEGATIVE_INFINITY
  return toLufs(gated.reduce((sum, energy) => sum + energy, 0) / gated.length)
}

function meanSquare(samples: Float32Array, start: number, end: number): number {
  let sum = 0
  for (let index = start; index < end; index += 1) sum += samples[index] * samples[index]
  return end > start ? sum / (end - start) : 0
}

/** Largest absolute sample value (0-1). */
function samplePeak(samples: Float32Array): number {
  let peak = 0
  for (const value of samples) peak = Math.max(peak, Math.abs(value))
  return peak
}

/** Peak after 4x linear-phase-free oversampling (cubic interpolation): a good estimate of the true peak. */
export function truePeakDb(samples: Float32Array): number {
  let peak = 0
  for (let index = 1; index < samples.length - 2; index += 1) {
    const [p0, p1, p2, p3] = [samples[index - 1], samples[index], samples[index + 1], samples[index + 2]]
    for (let step = 1; step < 4; step += 1) {
      const t = step / 4
      const value = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
      peak = Math.max(peak, Math.abs(value))
    }
  }
  peak = Math.max(peak, samplePeak(samples))
  return peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY
}

/** Look-ahead limiter: gain follows the loudest sample in the next few milliseconds and recovers slowly. */
function limit(samples: Float32Array, sampleRate: number, ceilingLinear: number): Float32Array {
  const lookahead = Math.max(1, Math.round(0.005 * sampleRate))
  const release = Math.exp(-1 / (0.06 * sampleRate))
  const required = new Float32Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const abs = Math.abs(samples[index])
    required[index] = abs > ceilingLinear ? ceilingLinear / abs : 1
  }
  // Sliding minimum over the look-ahead window (the gain must already be down when the peak arrives).
  const windowed = new Float32Array(samples.length)
  const deque: number[] = []
  for (let index = 0; index < samples.length + lookahead; index += 1) {
    if (index < samples.length) {
      while (deque.length > 0 && required[deque[deque.length - 1]] >= required[index]) deque.pop()
      deque.push(index)
    }
    const out = index - lookahead
    if (out >= 0) {
      while (deque.length > 0 && deque[0] < out) deque.shift()
      windowed[out] = required[deque[0]]
    }
  }
  const result = new Float32Array(samples.length)
  let gain = 1
  for (let index = 0; index < samples.length; index += 1) {
    const target = windowed[index]
    gain = target < gain ? target : target + (gain - target) * release
    result[index] = samples[index] * gain
  }
  return result
}

export interface NormalizedAudio {
  samples: Float32Array
  /** Loudness measured before the gain (LUFS), -Infinity for silence. */
  beforeLufs: number
  gainDb: number
}

/** Brings one line to TARGET_LUFS and keeps its peak under PEAK_CEILING_DB. Silence is returned unchanged. */
export function normalizeLoudness(samples: Float32Array, sampleRate: number): NormalizedAudio {
  const beforeLufs = integratedLufs(samples, sampleRate)
  if (!Number.isFinite(beforeLufs)) return { samples, beforeLufs, gainDb: 0 }
  const gainDb = Math.max(-MAX_CUT_DB, Math.min(MAX_BOOST_DB, TARGET_LUFS + LINE_OFFSET_LU - beforeLufs))
  const gain = 10 ** (gainDb / 20)
  const boosted = new Float32Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) boosted[index] = samples[index] * gain
  return { samples: limit(boosted, sampleRate, 10 ** (PEAK_CEILING_DB / 20)), beforeLufs, gainDb }
}

/** Little-endian signed 16-bit PCM to floats in -1..1. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const count = Math.floor(bytes.length / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2)
  const out = new Float32Array(count)
  for (let index = 0; index < count; index += 1) out[index] = view.getInt16(index * 2, true) / 32768
  return out
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) out[index] = Math.max(-32768, Math.min(32767, Math.round(samples[index] * 32767)))
  return out
}
