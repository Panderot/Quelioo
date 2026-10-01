import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getSongStatus } from '../api/song'
import type { SongStatusResponseBody } from '../lib/song'
import SongPanel from './SongPanel'
import { MusicNoteIcon } from './icons'

interface SongButtonProps {
  quizId: string
  quizTitle: string
  keyFacts: string[]
  sourceExcerpt: string
  language: string
  onSongSaved?: () => void
}

/** Secondary "Turn into a song" entry point — renders nothing until the server reports the feature
 * as enabled (GET /api/song), matching the always-hidden-until-checked behavior required in
 * production. See CLAUDE.md. */
export default function SongButton({ quizId, quizTitle, keyFacts, sourceExcerpt, language, onSongSaved }: SongButtonProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SongStatusResponseBody | null>(null)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    void getSongStatus().then((result) => {
      if (!cancelled) setStatus(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!status?.enabled) return null

  const handleClose = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        data-print-hide
        className="flex items-center gap-1.5 rounded-lg border border-warm-border bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-amber"
      >
        <MusicNoteIcon className="h-3.5 w-3.5" />
        {t('song.button')}
      </button>
      <SongPanel
        open={open}
        onClose={handleClose}
        quizId={quizId}
        quizTitle={quizTitle}
        keyFacts={keyFacts}
        sourceExcerpt={sourceExcerpt}
        language={language}
        maxSeconds={status.maxSeconds}
        onSongSaved={onSongSaved}
      />
    </>
  )
}
