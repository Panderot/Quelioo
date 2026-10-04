import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SongCoverageItem } from '../lib/song'

interface SongCoverageProps {
  items: SongCoverageItem[]
}

/** "5/5 questions are in the song" — opens a list of each quiz question with the lyric line that
 * teaches it. */
export default function SongCoverage({ items }: SongCoverageProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (items.length === 0) return null
  const covered = items.filter((item) => item.line !== null).length

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
          covered === items.length ? 'border-warm-border bg-paper text-navy' : 'border-amber/30 bg-amber/10 text-amber-text'
        }`}
      >
        {open ? t('song.coverage.hide') : t('song.coverage.summary', { covered, total: items.length })}
      </button>
      {open && (
        <ol id={listId} className="list-decimal space-y-1.5 pl-5 text-xs text-ink">
          {items.map((item, index) => (
            <li key={index}>
              <span className="font-medium">{item.question}</span>
              <span className="block text-muted">
                {item.line ? `${t('song.coverage.lineLabel')}: ${item.line}` : t('song.coverage.notCovered')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
