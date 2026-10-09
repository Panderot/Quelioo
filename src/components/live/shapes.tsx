import type { LiveKind } from '../../lib/live/core'
import { optionStyle } from './shapeStyles'
import type { OptionShapeKey } from './shapeStyles'

const PATHS: Record<OptionShapeKey, string> = {
  triangle: 'M12 3 22 20H2z',
  diamond: 'M12 2 22 12 12 22 2 12z',
  circle: 'M12 2a10 10 0 100 20 10 10 0 000-20z',
  square: 'M3 3h18v18H3z',
  pentagon: 'M12 2l10 7.6-3.8 12H5.8L2 9.6z',
}

/** The shape of option `option` in the colour that reads on its button. */
export function OptionShape({ kind, option, className }: { kind: LiveKind; option: number; className?: string }) {
  const style = optionStyle(kind, option)
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor" style={{ color: style.color }}>
      <path d={PATHS[style.key]} />
    </svg>
  )
}
