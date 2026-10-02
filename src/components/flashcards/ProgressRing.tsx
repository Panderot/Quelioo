interface ProgressRingProps {
  value: number
  total: number
  size?: number
  label: string
  /** Text in the middle; defaults to the percentage. */
  center?: string
}

/** Amber arc on a warm-border track; `label` is the accessible description. */
export default function ProgressRing({ value, total, size = 48, label, center }: ProgressRingProps) {
  const stroke = size >= 96 ? 8 : 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = total > 0 ? Math.min(1, value / total) : 0
  return (
    <div role="img" aria-label={label} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-warm-border" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className={`stroke-amber transition-[stroke-dashoffset] duration-500 ${ratio === 0 ? 'opacity-0' : ''}`}
        />
      </svg>
      <span aria-hidden className={`absolute inset-0 flex items-center justify-center font-bold text-navy ${size >= 96 ? 'text-lg' : 'text-[11px]'}`}>
        {center ?? `${Math.round(ratio * 100)}%`}
      </span>
    </div>
  )
}
