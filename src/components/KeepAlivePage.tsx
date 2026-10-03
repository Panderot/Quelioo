import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { PageActiveContext } from '../hooks/usePageActive'

interface KeepAlivePageProps {
  active: boolean
  children: ReactNode
}

/**
 * Keeps a page mounted above the router so its work (photo, crop, form, results, requests still in
 * flight, playback position) survives switching pages. Mounted on the first visit; while another
 * route is shown, its DOM sits in a detached holder, so other pages, tests and print never see it.
 */
export default function KeepAlivePage({ active, children }: KeepAlivePageProps) {
  const [holder] = useState(() => {
    const element = document.createElement('div')
    element.className = 'space-y-7'
    return element
  })
  const [visited, setVisited] = useState(active)
  if (active && !visited) setVisited(true)

  // Attached in the commit's layout phase, before the page's own layout effects measure anything.
  const attach = useCallback(
    (slot: HTMLDivElement | null) => {
      if (!slot) return undefined
      slot.appendChild(holder)
      return () => holder.remove()
    },
    [holder],
  )

  // A hidden page has no controls on screen, so its audio pauses (keeping its position).
  useEffect(() => {
    if (active) return
    holder.querySelectorAll('audio, video').forEach((media) => (media as HTMLMediaElement).pause())
  }, [active, holder])

  if (!visited) return null
  return (
    <>
      {active && <div ref={attach} className="contents" />}
      {createPortal(<PageActiveContext.Provider value={active}>{children}</PageActiveContext.Provider>, holder)}
    </>
  )
}
