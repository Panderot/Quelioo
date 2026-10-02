/**
 * Synthetic MP3 for tests (nothing recorded is committed): silent MPEG-2 Layer III frames in the
 * same format as OpenAI's tts-1 output (24 kHz, 128 kbps, mono). An all-zero frame decodes to
 * silence in every browser; 576 samples per frame = 24 ms.
 */
const HEADER = [0xff, 0xf3, 0xc4, 0xc4]
const FRAME_BYTES = 384

export function tinyMp3(seconds: number): Uint8Array {
  const frames = Math.max(1, Math.round((seconds * 24000) / 576))
  const out = new Uint8Array(frames * FRAME_BYTES)
  for (let index = 0; index < frames; index += 1) out.set(HEADER, index * FRAME_BYTES)
  return out
}

export function tinyMp3Base64(seconds: number): string {
  return Buffer.from(tinyMp3(seconds)).toString('base64')
}
