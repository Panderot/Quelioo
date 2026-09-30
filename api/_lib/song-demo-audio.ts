import type { SongStyle } from '../../src/lib/song.js'

/** Demo provider: a short placeholder melody synthesized from sine waves at request time — no
 * network call, no third-party audio, nothing to ship as a binary asset. Must never be reachable in
 * production (see api/_lib/song.ts) — development/preview only, until a real provider is verified. */

const SAMPLE_RATE = 16000
const DEMO_DURATION_SECONDS = 10

// A simple two-octave major-pentatonic-ish scale (Hz), low to high — sounds pleasant with plain sine tones.
const SCALE_HZ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]

interface StyleProfile {
  notesPerSecond: number
  /** Indices into SCALE_HZ — the melody loops through this pattern for the whole clip. */
  pattern: number[]
  /** Octaves to shift the pattern by (negative = lower). */
  octaveShift: number
  amplitude: number
  vibrato: boolean
}

// Deliberately simple, deterministic differences per style so the demo at least sounds distinct —
// not an attempt at a real arrangement.
const STYLE_PROFILES: Record<SongStyle, StyleProfile> = {
  pop: { notesPerSecond: 2.5, pattern: [0, 2, 4, 2, 0, 2, 4, 5], octaveShift: 0, amplitude: 0.5, vibrato: false },
  rap: { notesPerSecond: 3.5, pattern: [0, 0, 2, 0, 3, 0, 2, 0], octaveShift: -1, amplitude: 0.55, vibrato: false },
  kids: { notesPerSecond: 2, pattern: [0, 1, 2, 3, 4, 3, 2, 1], octaveShift: 0, amplitude: 0.45, vibrato: false },
  rock: { notesPerSecond: 3, pattern: [0, 3, 0, 3, 4, 3, 0, 2], octaveShift: -1, amplitude: 0.6, vibrato: false },
  acoustic: { notesPerSecond: 1.5, pattern: [0, 2, 4, 2], octaveShift: 0, amplitude: 0.35, vibrato: false },
  lofi: { notesPerSecond: 1.2, pattern: [0, 3, 2, 5], octaveShift: 0, amplitude: 0.3, vibrato: true },
}

function synthesizeSamples(style: SongStyle): Int16Array {
  const profile = STYLE_PROFILES[style]
  const totalSamples = Math.round(SAMPLE_RATE * DEMO_DURATION_SECONDS)
  const samples = new Int16Array(totalSamples)
  const samplesPerNote = Math.max(1, Math.round(SAMPLE_RATE / profile.notesPerSecond))
  const octaveMultiplier = 2 ** profile.octaveShift

  for (let i = 0; i < totalSamples; i++) {
    const noteIndex = Math.floor(i / samplesPerNote) % profile.pattern.length
    const scaleIndex = profile.pattern[noteIndex]
    const t = i / SAMPLE_RATE
    let freq = SCALE_HZ[scaleIndex] * octaveMultiplier
    if (profile.vibrato) freq += Math.sin(t * 2 * Math.PI * 5) * 3 // gentle 5Hz vibrato, +-3Hz

    const positionInNote = i % samplesPerNote
    const noteProgress = positionInNote / samplesPerNote
    // Short attack/release envelope so notes don't click at their boundaries.
    const envelope = Math.min(noteProgress * 8, 1, (1 - noteProgress) * 8)
    const value = Math.sin(2 * Math.PI * freq * t) * profile.amplitude * envelope
    samples[i] = Math.round(Math.max(-1, Math.min(1, value)) * 32767)
  }
  return samples
}

function encodeWav(samples: Int16Array, sampleRate: number): Buffer {
  const blockAlign = 2 // mono, 16-bit
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // fmt chunk size (PCM)
  buffer.writeUInt16LE(1, 20) // audio format: PCM
  buffer.writeUInt16LE(1, 22) // channels: mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2)
  }
  return buffer
}

export interface DemoSongResult {
  audioBase64: string
  mimeType: string
  durationSeconds: number
}

export function synthesizeDemoSong(style: SongStyle): DemoSongResult {
  const wav = encodeWav(synthesizeSamples(style), SAMPLE_RATE)
  return { audioBase64: wav.toString('base64'), mimeType: 'audio/wav', durationSeconds: DEMO_DURATION_SECONDS }
}
