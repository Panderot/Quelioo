import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getSongPlaybackUrl, getSongsForQuiz } from '../lib/songStorage'
import SongPlayerCard from './SongPlayerCard'

interface SongListenSectionProps {
  quizId: string
  quizTitle: string
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  return 'audio'
}

/** Shown on the archived quiz view when a song exists for this quiz — reads straight from
 * the account (see lib/songStorage.ts), independent of the song panel. Renders nothing otherwise. */
export default function SongListenSection({ quizId, quizTitle }: SongListenSectionProps) {
  const { t } = useTranslation()
  const [song, setSong] = useState<{ url: string; lyrics: string; demo: boolean; mimeType: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    void getSongsForQuiz(quizId).then(async (songs) => {
      if (cancelled || songs.length === 0) return
      const latest = songs[0]
      const playUrl = await getSongPlaybackUrl(latest)
      if (!playUrl) return
      if (cancelled) {
        if (playUrl.startsWith('blob:')) URL.revokeObjectURL(playUrl)
        return
      }
      url = playUrl
      setSong({ url: playUrl, lyrics: latest.lyrics, demo: latest.demo, mimeType: latest.mimeType })
    })
    return () => {
      cancelled = true
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [quizId])

  if (!song) return null

  const downloadName = `${
    (quizTitle || 'song')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'song'
  }.${extensionForMime(song.mimeType)}`

  return (
    <section data-print-hide className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
      <h2 className="font-serif text-lg font-semibold text-navy">{t('song.archive.listenTitle')}</h2>
      <SongPlayerCard audioUrl={song.url} lyrics={song.lyrics} demo={song.demo} downloadName={downloadName} />
    </section>
  )
}
