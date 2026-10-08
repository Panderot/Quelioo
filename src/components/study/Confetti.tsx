const COLORS = ['#f5a524', '#e0931a', '#0e1330', '#1a7a4e', '#9c4a09']
const PIECES = 36

/** A one-time burst of confetti over the end screen. Decorative only (aria-hidden); the caller decides
 * whether to show it (score, setting and prefers-reduced-motion). Pieces are laid out deterministically. */
export default function Confetti() {
  return (
    <div data-purpose="study-confetti" aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 h-screen overflow-hidden">
      {Array.from({ length: PIECES }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 97) % 100}%`,
            backgroundColor: COLORS[i % COLORS.length],
            animationDelay: `${(i % 9) * 90}ms`,
            animationDuration: `${1800 + (i % 5) * 250}ms`,
            ['--confetti-drift' as string]: `${((i % 7) - 3) * 18}px`,
          }}
        />
      ))}
    </div>
  )
}
