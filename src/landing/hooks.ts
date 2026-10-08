import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReduced(callback: () => void) {
  const media = window.matchMedia(REDUCED_QUERY)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

/** True when the visitor asked for less motion; animations then show their end state. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  )
}

/** Flips to true (once) when the element first scrolls into view. Server and no-JS render count as "in view". */
export function useInView<T extends Element>(rootMargin = '0px 0px -12% 0px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      const id = window.setTimeout(() => setInView(true), 0)
      return () => window.clearTimeout(id)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return [ref, inView]
}
