interface LogoMarkProps {
  className?: string
  tone?: 'onDark' | 'onLight'
}

export function LogoMark({ className, tone = 'onDark' }: LogoMarkProps) {
  const bowlColor = tone === 'onDark' ? '#FBF7EF' : '#0E1330'

  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden>
      <circle cx="15" cy="15" r="9" fill="none" stroke={bowlColor} strokeWidth="3" />
      <path d="M19 19L28 28" stroke="#F5A524" strokeWidth="3" strokeLinecap="round" />
      <circle cx="28" cy="28" r="2.3" fill="#F5A524" />
      <g stroke="#F5A524" strokeWidth="1.4" strokeLinecap="round">
        <path d="M30.72 29.27L32.98 30.33" />
        <path d="M30.12 30.12L31.89 31.89" />
        <path d="M29.27 30.72L30.33 32.98" />
      </g>
    </svg>
  )
}
