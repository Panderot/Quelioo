import { useEffect } from 'react'

import { useIsPageActive } from './usePageActive'

/** Sets the browser tab title while the page is shown, restoring the previous one on leave. */
export function useDocumentTitle(title: string) {
  const active = useIsPageActive()
  useEffect(() => {
    if (!active) return undefined
    const previous = document.title
    document.title = `${title} - Quelio`
    return () => {
      document.title = previous
    }
  }, [title, active])
}
