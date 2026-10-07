/** Pitch of a spoken line (pure, no dependencies): normalized autocorrelation per 42 ms frame, used to
 * check that a question really rises at the end. */

/** A question counts as rising when its last 300 ms sit at least this many semitones above the 500 ms before. */
export const MIN_QUESTION_RISE_SEMITONES = 1

const FRAME = 1024
const HOP = 240
const MIN_HZ = 70
const MAX_HZ = 400
const VOICED_CORRELATION = 0.55
const MIN_RMS = 0.01

function frequencyAt(x: Float32Array, start: number, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / MAX_HZ)
  const maxLag = Math.floor(sampleRate / MIN_HZ)
  if (start + FRAME + maxLag >= x.length) return null
  let mean = 0
  for (let index = 0; index < FRAME; index += 1) mean += x[start + index]
  mean /= FRAME
  let energy = 0
  for (let index = 0; index < FRAME; index += 1) energy += (x[start + index] - mean) ** 2
  if (Math.sqrt(energy / FRAME) < MIN_RMS) return null
  let best = 0
  let bestLag = 0
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0
    let shifted = 0
    for (let index = 0; index < FRAME; index += 1) {
      const a = x[start + index] - mean
      const b = x[start + index + lag] - mean
      sum += a * b
      shifted += b * b
    }
    const correlation = sum / Math.sqrt(energy * shifted + 1e-9)
    if (correlation > best) {
      best = correlation
      bestLag = lag
    }
  }
  return best > VOICED_CORRELATION ? sampleRate / bestLag : null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Semitone change from the middle of the line's last second to its final 300 ms (positive = the pitch
 * rises at the end); null when the line is too short or too little of it is voiced to tell. Only the
 * last ~1.4 s is analysed, so it stays cheap for long lines. */
export function endRiseSemitones(samples: Float32Array, sampleRate: number): number | null {
  const tailStart = Math.max(0, samples.length - Math.round(1.4 * sampleRate) - FRAME)
  const tail = samples.subarray(tailStart)
  const track: (number | null)[] = []
  for (let start = 0; start + FRAME < tail.length; start += HOP) track.push(frequencyAt(tail, start, sampleRate))
  let last = track.length - 1
  while (last >= 0 && track[last] === null) last -= 1
  if (last < 40) return null
  const take = (from: number, to: number) => track.slice(Math.max(0, from), Math.max(0, to)).filter((value): value is number => value !== null)
  const end = take(last - 29, last + 1)
  const before = take(last - 79, last - 29)
  if (end.length < 6 || before.length < 6) return null
  return 12 * Math.log2(median(end) / median(before))
}
