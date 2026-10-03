/** A real, tiny (50ms) 440Hz WAV file, base64-encoded — used only by tests to stand in for
 * /api/song's audio response without exercising the real demo synthesizer or a network call. */
export const TINY_WAV_BASE64 =
  'UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAJYK6xPmGrIe3h5iG6oUgQv7AFj22eyd5YHh/+Ao5Jzql/MK/rgIXhLZGUUeHB9HHBkWTg3xAjr4b+645v7h0OBS4zjp0PEV/NEGvxCxGLgdPB8OHXEXDg/jBCX6GPDs55niwOCZ4uznGPAl+uMEDg9xFw4dPB+4HbEYvxDRBhX80PE46VLj0OD+4bjmb+46+PECTg0ZFkccHB9FHtkZXhK4CAr+l/Oc6ijk/+CB4Z3l2exY9vsAgQuqFGIb3h6yHuYa6xOWCgAAavUV7BrlTuEi4Z7kVut/9AX/qAknE2Mafx4BH9gbZBVpDPYBSPei7Sfmu+Hk4Lnj5+my8g/9xgeREUgZAh4wH64cyBYwDusDL/lB70/nSOLE4PLij+jy8B372wXoDxQYZx1AH2cdFBjoD9sFHfvy8I/o8uLE4EjiT+dB7y/56wMwDsgWrhwwHwIeSBmREcYHD/2y8ufpuePk4LvhJ+ai7Uj39gFpDGQV2BsBH38eYxonE6gJBf9/9FbrnuQi4U7hGuUV7Gr1AACWCusT5hqyHt4eYhuqFIEL+wBY9tnsneWB4f/gKOSc6pfzCv64CF4S2RlFHhwfRxwZFk4N8QI6+G/uuOb+4dDgUuM46dDxFfzRBr8QsRi4HTwfDh1xFw4P4wQl+hjw7OeZ4sDgmeLs5xjwJfrjBA4PcRcOHTwfuB2xGL8Q0QYV/NDxOOlS49Dg/uG45m/uOvjxAk4NGRZHHBwfRR7ZGV4SuAgK/pfznOoo5P/ggeGd5dnsWPb7AIELqhRiG94esh7mGusTlgoAAGr1Fewa5U7hIuGe5Fbrf/QF/6gJJxNjGn8eAR/YG2QVaQz2AUj3ou0n5rvh5OC54+fpsvIP/cYHkRFIGQIeMB+uHMgWMA7rAy/5Qe9P50jixODy4o/o8vAd+9sF6A8UGGcdQB9nHRQY6A/bBR378vCP6PLixOBI4k/nQe8v+esDMA7IFq4cMB8CHkgZkRHGBw/9svLn6bnj5OC74Sfmou1I9/YBaQxkFdgbAR9/HmMaJxOoCQX/f/RW657kIuFO4RrlFexq9Q=='

/** A silent mono 8 kHz 16-bit WAV of the given whole seconds, base64-encoded — long enough for the
 * browser to report a real duration (TINY_WAV_BASE64 is too short to measure). */
export function buildSilentWavBase64(seconds: number): string {
  const sampleRate = 8000
  const dataBytes = sampleRate * seconds * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  return buffer.toString('base64')
}
