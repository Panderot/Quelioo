import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { localizeSectionTags } from '../lib/songTags'
import { DownloadIcon, PauseIcon, PlayIcon, VolumeIcon } from './icons'

interface SongPlayerCardProps {
  audioUrl: string
  lyrics: string
  demo: boolean
  downloadName: string
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** The custom Solar-Paper audio player used by both the song panel (Step D) and the archived quiz
 * view's "Listen" section — play/pause, seek, volume, download, lyrics, demo badge, AI disclosure. */
export default function SongPlayerCard({ audioUrl, lyrics, demo, downloadName }: SongPlayerCardProps) {
  const { t, i18n } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    // play() rejects with AbortError if the source changes before playback starts — expected in
    // rare races, not a real failure, so swallow it rather than leaving an unhandled rejection.
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  return (
    <div className="space-y-4">
      {demo && (
        <span className="inline-block rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 text-[11px] font-bold text-amber-text">
          {t('song.demoBadge')}
        </span>
      )}

      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="space-y-3 rounded-xl border border-warm-border bg-paper p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? t('song.player.pause') : t('song.player.play')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber text-navy hover:bg-amber-hover"
          >
            {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>
          <input
            type="range"
            aria-label={t('song.player.seek')}
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (audioRef.current) audioRef.current.currentTime = value
              setCurrentTime(value)
            }}
            className="h-1.5 flex-1 accent-amber"
          />
          <span className="w-16 shrink-0 text-right text-xs text-muted">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <VolumeIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="range"
            aria-label={t('song.player.volume')}
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => {
              const value = Number(event.target.value)
              setVolume(value)
              if (audioRef.current) audioRef.current.volume = value
            }}
            className="h-1.5 flex-1 accent-amber"
          />
          <a
            href={audioUrl}
            download={downloadName}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-warm-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-amber"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {t('song.player.download')}
          </a>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t('song.lyricsLabel')}</p>
        <p className="rounded-xl border border-warm-border bg-paper p-3 text-sm whitespace-pre-line text-ink">{localizeSectionTags(lyrics, i18n.language)}</p>
      </div>

      <p className="text-xs text-muted">{t('song.aiDisclosure')}</p>
    </div>
  )
}
