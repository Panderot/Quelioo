import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { matchPath, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import type { Location } from 'react-router-dom'

import KeepAlivePage from './KeepAlivePage'

interface KeptRouteProps {
  path: string
  element: ReactNode
  /** A plain link back to the page brings back the search it was left with (filters). Off when the search changes what the page is. */
  restoreSearch?: boolean
}

// Same matching as <Routes>: a trailing slash still means the same page.
const trimSlash = (pathname: string) => pathname.replace(/(.)\/+$/, '$1')

/**
 * A route whose page stays mounted (hidden) while the user visits other pages, so unfinished work
 * is still there on return. The page keeps seeing the last URL it matched — its params, search and
 * state — and a different URL for the same pattern (another lesson, deck, quiz) replaces it.
 */
export default function KeptRoute({ path, element, restoreSearch = true }: KeptRouteProps) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const matches = matchPath(path, trimSlash(location.pathname)) !== null
  const [last, setLast] = useState<Location | null>(matches ? location : null)

  if (matches && last?.key !== location.key) {
    // Coming back from the menu (a plain link to the page) keeps the search/filters it was left with.
    const restoresSearch =
      restoreSearch &&
      navigationType === 'PUSH' &&
      location.state == null &&
      last !== null &&
      location.search === '' &&
      last.search !== '' &&
      trimSlash(last.pathname) === trimSlash(location.pathname)
    setLast(restoresSearch ? { ...location, search: last.search } : location)
  }
  const current = last?.key === location.key ? last : location
  // Put the kept search back into the address bar too, so a reload keeps it.
  const urlNeedsSearch = matches && current.search !== location.search
  useEffect(() => {
    // Skip if the user already moved on (e.g. pressed Back right away).
    const stillHere = window.location.pathname === location.pathname && window.location.search === location.search
    if (urlNeedsSearch && stillHere) navigate({ pathname: location.pathname, search: current.search }, { replace: true, state: location.state })
  }, [urlNeedsSearch, current.search, location, navigate])

  const shown = matches ? current : last
  if (!shown) return null
  return (
    <KeepAlivePage key={trimSlash(shown.pathname)} active={matches}>
      <Routes location={shown}>
        <Route path={path} element={element} />
      </Routes>
    </KeepAlivePage>
  )
}
