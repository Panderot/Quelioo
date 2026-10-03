import { createContext, useContext, useEffect, useRef } from 'react'

// Pages outside a KeepAlivePage are always active.
export const PageActiveContext = createContext(true)

/** False while a kept-alive page is hidden behind another route — gate document/window listeners on it. */
export function useIsPageActive(): boolean {
  return useContext(PageActiveContext)
}

/** Runs when a kept-alive page is shown again (not on its first mount) — refresh data that other pages may have changed. */
export function useOnPageReturn(callback: () => void): void {
  const active = useIsPageActive()
  const wasActiveRef = useRef(active)
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })
  useEffect(() => {
    if (active && !wasActiveRef.current) callbackRef.current()
    wasActiveRef.current = active
  }, [active])
}
