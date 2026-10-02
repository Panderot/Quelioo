/** Minimal MP3 frame reader (MPEG-1/2/2.5 Layer III), shared by the server and the browser: exact
 * duration from the frames, and frame-only audio (no ID3 tag, no Xing/Info header frame) so that
 * segments can be joined into one file that every browser plays and measures correctly. */

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

interface Frame {
  offset: number
  length: number
  samples: number
  sampleRate: number
}

function id3Size(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  return 10 + size + (bytes[5] & 0x10 ? 10 : 0)
}

function readFrame(bytes: Uint8Array, offset: number): Frame | null {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null
  const version = (bytes[offset + 1] >> 3) & 0x03 // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (bytes[offset + 1] >> 1) & 0x03 // 1 = Layer III
  const bitrateIndex = bytes[offset + 2] >> 4
  const rateIndex = (bytes[offset + 2] >> 2) & 0x03
  const padding = (bytes[offset + 2] >> 1) & 0x01
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null
  const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex] * 1000
  const sampleRate = SAMPLE_RATES[version][rateIndex]
  const samples = version === 3 ? 1152 : 576
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding
  return length > 4 ? { offset, length, samples, sampleRate } : null
}

/** True when this frame is a Xing/Info (VBR/CBR summary) header frame, which carries no audio. */
function isInfoFrame(bytes: Uint8Array, frame: Frame): boolean {
  const end = Math.min(frame.offset + 64, frame.offset + frame.length)
  for (let index = frame.offset + 4; index < end - 3; index += 1) {
    const tag = String.fromCharCode(bytes[index], bytes[index + 1], bytes[index + 2], bytes[index + 3])
    if (tag === 'Xing' || tag === 'Info') return true
  }
  return false
}

function frames(bytes: Uint8Array): Frame[] {
  const result: Frame[] = []
  let offset = id3Size(bytes)
  while (offset < bytes.length) {
    const frame = readFrame(bytes, offset)
    if (!frame) {
      offset += 1 // resync on garbage
      continue
    }
    if (frame.offset + frame.length > bytes.length) break
    result.push(frame)
    offset += frame.length
  }
  return result
}

/** Audio frames only: ID3 tags, Xing/Info frames and trailing garbage removed. */
function mp3AudioFrames(bytes: Uint8Array): Uint8Array {
  const list = frames(bytes).filter((frame, index) => !(index === 0 && isInfoFrame(bytes, frame)))
  const out = new Uint8Array(list.reduce((sum, frame) => sum + frame.length, 0))
  let position = 0
  for (const frame of list) {
    out.set(bytes.subarray(frame.offset, frame.offset + frame.length), position)
    position += frame.length
  }
  return out
}

/** Exact duration in seconds from the audio frames (0 when it isn't MP3). */
export function mp3DurationSeconds(bytes: Uint8Array): number {
  return frames(bytes)
    .filter((frame, index) => !(index === 0 && isInfoFrame(bytes, frame)))
    .reduce((sum, frame) => sum + frame.samples / frame.sampleRate, 0)
}

/** Joins MP3 segments into one stream of plain frames (all segments must share one format). */
export function concatMp3(segments: Uint8Array[]): Uint8Array {
  const parts = segments.map(mp3AudioFrames)
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let position = 0
  for (const part of parts) {
    out.set(part, position)
    position += part.length
  }
  return out
}

/** Silent frames in the same format as `template` (an all-zero Layer III frame decodes to silence),
 * so pauses can be part of the joined file. Empty when the template has no usable frame. */
export function silentMp3(template: Uint8Array, seconds: number): Uint8Array {
  const first = frames(template).find((frame, index) => !(index === 0 && isInfoFrame(template, frame)))
  if (!first || seconds <= 0) return new Uint8Array(0)
  const header = template.slice(first.offset, first.offset + 4)
  header[2] &= ~0x02 // no padding: every silent frame has the same length
  const protectedByCrc = (header[1] & 0x01) === 0
  if (protectedByCrc) return new Uint8Array(0)
  const frame = readFrame(new Uint8Array([...header, ...new Uint8Array(4096)]), 0)
  if (!frame) return new Uint8Array(0)
  const count = Math.max(1, Math.round((seconds * frame.sampleRate) / frame.samples))
  const out = new Uint8Array(count * frame.length)
  for (let index = 0; index < count; index += 1) out.set(header, index * frame.length)
  return out
}
