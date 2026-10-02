/**
 * Generates the static voice previews for Audio Lesson ONCE (so previews never cost anything at
 * runtime): one short sample per voice and language, written to public/voices/<model>/<voice>-<lang>.mp3.
 * Run again only when TTS_MODEL or the voice list changes: `npx tsx scripts/make-voice-previews.ts`.
 * Uses OPENAI_API_KEY from .env.local (never printed). Compresses with ffmpeg when it is installed.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { TTS_MODEL, TTS_VOICES, speakerInstruction } from '../src/lib/lessonAudio.js'

const SAMPLES: Record<string, string> = {
  tr: 'Merhaba! Bugünkü derste bu konuyu birlikte, adım adım öğreneceğiz.',
  en: "Hi! In today's lesson, we'll learn this topic together, step by step.",
  hyw: 'Բարեւ։ Այսօրուան դասին այս նիւթը միասին, քայլ առ քայլ պիտի սորվինք։',
}

function loadKey(): string {
  const path = resolve('.env.local')
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^OPENAI_API_KEY=(.*)$/.exec(line.trim())
      if (match) return match[1].replace(/^["']|["']$/g, '')
    }
  }
  return process.env.OPENAI_API_KEY ?? ''
}

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function main() {
  const apiKey = loadKey()
  if (!apiKey) {
    console.log('OPENAI_API_KEY missing: SKIPPED')
    return
  }
  const dir = resolve('public', 'voices', TTS_MODEL)
  mkdirSync(dir, { recursive: true })
  const compress = hasFfmpeg()
  const jobs = TTS_VOICES.flatMap((voice) => Object.keys(SAMPLES).map((lang) => ({ voice, lang })))
  await Promise.all(
    jobs.map(async ({ voice, lang }) => {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: TTS_MODEL,
          voice,
          input: SAMPLES[lang],
          response_format: 'mp3',
          instructions: speakerInstruction('narrator', lang),
        }),
      })
      if (!response.ok) throw new Error(`${voice}-${lang}: ${response.status}`)
      const file = resolve(dir, `${voice}-${lang}.mp3`)
      writeFileSync(file, Buffer.from(await response.arrayBuffer()))
      if (compress) {
        const smaller = `${file}.tmp.mp3`
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-ac', '1', '-b:a', '48k', smaller])
        renameSync(smaller, file)
      }
    }),
  )
  console.log(`wrote ${jobs.length} previews to public/voices/${TTS_MODEL}${compress ? ' (48 kbps mono)' : ''}`)
}

void main()
