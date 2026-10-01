import { useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { FileTabIcon } from './icons'

interface PhotoDropZoneProps {
  /** Opens the (camera-capable) file input owned by the caller. */
  onBrowse: () => void
  onFile: (file: File | undefined) => void
  title?: string
  className?: string
}

/** Dashed photo drop zone shared by Solve and "Check my solution": click/Enter to browse, drag and drop. */
export default function PhotoDropZone({ onBrowse, onFile, title, className = 'min-h-[220px] md:min-h-[260px]' }: PhotoDropZoneProps) {
  const { t } = useTranslation()
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    onFile(event.dataTransfer.files?.[0])
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onBrowse}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onBrowse()
        }
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card px-4 py-8 text-center transition-colors ${className} ${
        isDragging ? 'border-amber' : 'border-warm-border'
      }`}
    >
      <FileTabIcon className="h-8 w-8 text-muted" />
      <div>
        <p className="text-sm font-semibold text-ink">{title ?? t('solve.upload.dragTitle')}</p>
        <p className="mt-1 text-xs text-muted">{t('solve.upload.dragSubtitle')}</p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onBrowse()
        }}
        className="rounded-xl border border-warm-border bg-paper px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:border-amber"
      >
        {t('solve.upload.browse')}
      </button>
      <p className="text-xs text-muted">{t('solve.upload.hint')}</p>
    </div>
  )
}
