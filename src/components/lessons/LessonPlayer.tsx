import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { formatClock } from '../../lib/lesson'
import type { ScriptLine, ScriptSection } from '../../lib/lesson'
import { PAUSE_SECONDS, selfCheckAnswerIds } from '../../lib/lessonAudio'
import { concatMp3, mp3DurationSeconds, silentMp3 } from '../../lib/mp3'
import { DownloadIcon, PauseIcon, PlayIcon } from '../icons'

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25, 1.5]
const SPEED_KEY = 'quelio.lessonSpeed.v1'
const SKIP_SECONDS = 10
/** Browsers report a time a hair before the requested one after a seek; land just inside the line. */
const LINE_START_NUDGE = 0.05

interface Timed {
  line: ScriptLine
  start: number
  end: number
}

interface LessonPlayerProps {
  title: string
  partLabel: string
  sections: ScriptSection[]
  /** MP3 bytes per line id, in script order (every line must be present). */
  audioByLine: Map<string, Uint8Array>
  speakerLabel: (speaker: string) => string
}

function readSpeed(): number {
  try {
    const value = Number(localStorage.getItem(SPEED_KEY))
    return SPEEDS.includes(value) ? value : 1
  } catch {
    return 1
  }
}

function fileSlug(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'lesson'
  )
}

/** One joined MP3 for the whole part (gapless, one seek bar), with the transcript in sync. */
export default function LessonPlayer({ title, partLabel, sections, audioByLine, speakerLabel }: LessonPlayerProps) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const lineRefs = useRef(new Map<string, HTMLLIElement>())
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [speed, setSpeed] = useState(readSpeed)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const answerIds = useMemo(() => selfCheckAnswerIds(sections), [sections])

  // Join the segments (plus silence after pause lines) once, and keep each line's start time.
  const { url, blob, timeline, duration } = useMemo(() => {
    const lines = sections.flatMap((section) => section.lines)
    const first = audioByLine.get(lines[0]?.id ?? '')
    const silence = first ? silentMp3(first, PAUSE_SECONDS) : new Uint8Array(0)
    const silenceSeconds = mp3DurationSeconds(silence)
    const parts: Uint8Array[] = []
    const timed: Timed[] = []
    let cursor = 0
    for (const line of lines) {
      const audio = audioByLine.get(line.id)
      if (!audio) continue
      const length = mp3DurationSeconds(audio) + (line.pause ? silenceSeconds : 0)
      parts.push(audio)
      if (line.pause) parts.push(silence)
      timed.push({ line, start: cursor, end: cursor + length })
      cursor += length
    }
    const joined = new Blob([concatMp3(parts) as BlobPart], { type: 'audio/mpeg' })
    return { url: URL.createObjectURL(joined), blob: joined, timeline: timed, duration: cursor }
  }, [sections, audioByLine])

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
    try {
      localStorage.setItem(SPEED_KEY, String(speed))
    } catch {
      // Not remembered without storage.
    }
  }, [speed, url])

  const current = timeline.find((entry) => time >= entry.start && time < entry.end) ?? (time >= duration && timeline.length > 0 ? timeline[timeline.length - 1] : undefined)
  const currentId = current?.line.id

  useEffect(() => {
    if (!playing || !currentId) return
    lineRefs.current.get(currentId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentId, playing])

  const seek = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const target = Math.min(Math.max(0, seconds), duration)
    audio.currentTime = target
    setTime(target)
  }

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  // Media Session: lock screen / headphone controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined
    const session = navigator.mediaSession
    try {
      session.metadata = new MediaMetadata({ title, artist: 'Quelio', album: partLabel })
    } catch {
      // MediaMetadata missing in this browser.
    }
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void audioRef.current?.play().catch(() => {})],
      ['pause', () => audioRef.current?.pause()],
      ['seekbackward', () => seek((audioRef.current?.currentTime ?? 0) - SKIP_SECONDS)],
      ['seekforward', () => seek((audioRef.current?.currentTime ?? 0) + SKIP_SECONDS)],
      ['seekto', (details) => details.seekTime !== undefined && seek(details.seekTime)],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // Action not supported here.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null)
        } catch {
          // ignore
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seek only reads the ref and duration
  }, [title, partLabel, duration])

  // Keyboard: Space plays/pauses, arrows skip 10 s (not while typing or on a control that uses them).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"]') || event.altKey || event.ctrlKey || event.metaKey)) return
      if (event.key === ' ' && !target?.closest('button, a')) {
        event.preventDefault()
        toggle()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        seek((audioRef.current?.currentTime ?? 0) - SKIP_SECONDS)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        seek((audioRef.current?.currentTime ?? 0) + SKIP_SECONDS)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only read refs and duration
  }, [duration])

  const download = (data: Blob, name: string) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(data)
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  const transcriptText = () =>
    [
      `${title} — ${partLabel}`,
      ...sections.flatMap((section) => ['', `## ${section.title}`, ...section.lines.map((line) => `${speakerLabel(line.speaker)}: ${line.text}`)]),
    ].join('\n')

  return (
    <section data-purpose="lesson-player" className="space-y-4">
      <div className="space-y-4 rounded-[14px] border border-warm-border bg-card p-5">
        <audio
          ref={audioRef}
          src={url}
          preload="auto"
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            event.currentTarget.playbackRate = speed
          }}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? t('lessons.player.pause') : t('lessons.player.play')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-navy transition-colors hover:bg-amber-hover"
          >
            {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={Math.min(time, duration)}
              onChange={(event: ChangeEvent<HTMLInputElement>) => seek(Number(event.target.value))}
              aria-label={t('lessons.player.seek')}
              aria-valuetext={`${formatClock(time)} / ${formatClock(duration)}`}
              className="w-full accent-amber"
            />
            <p data-purpose="player-time" className="text-xs text-muted tabular-nums">
              {formatClock(time)} / {formatClock(duration)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => seek(time - SKIP_SECONDS)} className="rounded-lg border border-warm-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral">
            {t('lessons.player.back10')}
          </button>
          <button type="button" onClick={() => seek(time + SKIP_SECONDS)} className="rounded-lg border border-warm-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral">
            {t('lessons.player.forward10')}
          </button>
          <div role="radiogroup" aria-label={t('lessons.player.speed')} className="flex flex-wrap items-center gap-1">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={speed === value}
                onClick={() => setSpeed(value)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${speed === value ? 'border-amber bg-amber/15 text-amber-text' : 'border-warm-border text-ink hover:border-focus-neutral'}`}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-warm-border pt-3">
          <button
            type="button"
            onClick={() => download(blob, `${fileSlug(title)}-${fileSlug(partLabel)}.mp3`)}
            className="flex items-center gap-1.5 rounded-lg border border-warm-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {t('lessons.player.downloadMp3')}
          </button>
          <button
            type="button"
            onClick={() => download(new Blob([transcriptText()], { type: 'text/plain;charset=utf-8' }), `${fileSlug(title)}-${fileSlug(partLabel)}.txt`)}
            className="flex items-center gap-1.5 rounded-lg border border-warm-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-focus-neutral"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {t('lessons.player.downloadTranscript')}
          </button>
        </div>
        <p className="text-xs text-muted">{t('lessons.player.shortcuts')}</p>
      </div>

      <div data-purpose="lesson-transcript" className="space-y-5">
        {sections.map((section) => (
          <section key={section.id} className="space-y-2">
            <h3 className="flex flex-wrap items-baseline gap-2">
              <span className="text-[11px] font-bold tracking-wide text-amber-text uppercase">{t(`lessons.roles.${section.role}`)}</span>
              <span className="font-serif text-base font-semibold text-navy">{section.title}</span>
            </h3>
            <ol className="space-y-1">
              {section.lines.map((line) => {
                const timed = timeline.find((entry) => entry.line.id === line.id)
                const active = line.id === currentId
                const hidden = answerIds.has(line.id) && !revealed.has(line.id)
                return (
                  <li
                    key={line.id}
                    ref={(element) => {
                      if (element) lineRefs.current.set(line.id, element)
                      else lineRefs.current.delete(line.id)
                    }}
                    data-purpose="transcript-line"
                    data-active={active || undefined}
                    aria-current={active || undefined}
                    className={`rounded-xl px-3 py-2 transition-colors ${active ? 'bg-amber/15' : 'hover:bg-card'}`}
                  >
                    <button type="button" onClick={() => timed && seek(timed.start + LINE_START_NUDGE)} className="block w-full text-left">
                      <span className="block text-[11px] font-bold tracking-wide text-muted uppercase">{speakerLabel(line.speaker)}</span>
                      {hidden ? (
                        <span className="block text-sm text-muted italic">{t('lessons.player.answerHidden')}</span>
                      ) : (
                        <span dir="auto" className="block text-sm leading-relaxed text-ink">
                          {line.text}
                        </span>
                      )}
                    </button>
                    {hidden && (
                      <button
                        type="button"
                        onClick={() => setRevealed((value) => new Set([...value, line.id]))}
                        className="mt-1 rounded-lg border border-warm-border px-2.5 py-1 text-xs font-semibold text-amber-text hover:border-amber"
                      >
                        {t('lessons.player.showAnswer')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </section>
  )
}
