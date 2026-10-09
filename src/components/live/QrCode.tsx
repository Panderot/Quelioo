import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/** A QR code drawn as one SVG path (dark navy on white, with the quiet zone QR readers need). */
export default function QrCode({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation()
  const drawing = useMemo(() => {
    try {
      const qr = qrcode(0, 'M')
      qr.addData(value)
      qr.make()
      const size = qr.getModuleCount()
      let path = ''
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          if (qr.isDark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`
        }
      }
      return { path, box: size + 8 }
    } catch {
      return null
    }
  }, [value])

  if (!drawing) return <p className="text-sm text-muted">{t('live.board.lobby.scanFailed')}</p>
  return (
    <svg data-purpose="live-qr" role="img" aria-label={t('live.board.lobby.qrLabel')} viewBox={`0 0 ${drawing.box} ${drawing.box}`} className={className} shapeRendering="crispEdges">
      <rect width={drawing.box} height={drawing.box} fill="#ffffff" />
      <path d={drawing.path} fill="#0e1330" />
    </svg>
  )
}
