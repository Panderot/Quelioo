import { useEffect } from 'react'

/** Sets the browser tab title while the page is mounted, restoring the previous one on leave. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} - Quelio`
    return () => {
      document.title = previous
    }
  }, [title])
}
