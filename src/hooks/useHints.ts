import { useState } from 'react'

/** Per-question hint reveal state — how many of up to `hintCount` hints the student has revealed
 * so far. Kept in memory only, and reset whenever `signature` changes (the question was edited,
 * regenerated or replaced) — same during-render reset technique as useCheckableAnswer/
 * useExplanationUnlocked. */
export function useHints(signature: string, hintCount: number) {
  const [revealedCount, setRevealedCount] = useState(0)

  const [prevSignature, setPrevSignature] = useState(signature)
  if (prevSignature !== signature) {
    setPrevSignature(signature)
    setRevealedCount(0)
  }

  const revealNext = () => setRevealedCount((count) => Math.min(hintCount, count + 1))
  return { revealedCount, revealNext }
}
