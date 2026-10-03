import { useSearchParams } from 'react-router-dom'

/** A string kept in the URL (e.g. ?q=), so a search or filter survives leaving the page and a reload.
 * Updates replace the history entry, so typing doesn't fill the back button. */
export function useSearchParamState(key: string): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) ?? ''
  const setValue = (next: string) => {
    // Start from the URL as it is right now, not from the last render: react-router's functional
    // updater sees the render-time params, so two quick changes (a filter, then a search) would
    // otherwise overwrite each other.
    const params = new URLSearchParams(typeof window === 'undefined' ? searchParams : window.location.search)
    if (next) params.set(key, next)
    else params.delete(key)
    setSearchParams(params, { replace: true })
  }
  return [value, setValue]
}
