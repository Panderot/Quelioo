/** Short synthesised sound effects for the board (nothing to download). Browsers only allow sound after a click or tap,
 * so a reloaded board stays quiet until the teacher presses something. */

export type LiveSound = 'join' | 'start' | 'reveal' | 'tick' | 'final'

let context: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context ??= new Ctor()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    return null
  }
}

function note(ctx: AudioContext, frequency: number, start: number, length: number, volume = 0.12, type: OscillatorType = 'sine') {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  const at = ctx.currentTime + start
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(at)
  oscillator.stop(at + length + 0.05)
}

const MELODIES: Record<LiveSound, [number, number, number][]> = {
  join: [[660, 0, 0.12]],
  start: [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.28]],
  tick: [[880, 0, 0.08]],
  reveal: [[392, 0, 0.14], [523, 0.12, 0.28]],
  final: [[523, 0, 0.16], [659, 0.16, 0.16], [784, 0.32, 0.16], [1047, 0.48, 0.5]],
}

export function playLiveSound(sound: LiveSound): void {
  const ctx = audio()
  if (!ctx) return
  for (const [frequency, start, length] of MELODIES[sound]) note(ctx, frequency, start, length)
}
