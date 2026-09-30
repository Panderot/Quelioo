import { useState } from 'react'

/** Generic per-question "checkable answer" state — the student's in-progress value, the last
 * check result, an in-flight/error state for AI-graded types, and whether it's been checked at
 * least once (used to gate the explanation link). Kept in memory only, never persisted, and reset
 * whenever `signature` changes (the question was edited, regenerated or replaced) — same
 * during-render reset technique as useExplanationUnlocked. */
export function useCheckableAnswer<Value, Result>(signature: string, initialValue: Value) {
  const [value, setValue] = useState<Value>(initialValue)
  const [result, setResult] = useState<Result | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCheckedOnce, setHasCheckedOnce] = useState(false)

  const [prevSignature, setPrevSignature] = useState(signature)
  if (prevSignature !== signature) {
    setPrevSignature(signature)
    setValue(initialValue)
    setResult(null)
    setIsChecking(false)
    setError(null)
    setHasCheckedOnce(false)
  }

  return {
    value,
    setValue,
    result,
    setResult,
    isChecking,
    setIsChecking,
    error,
    setError,
    hasCheckedOnce,
    markCheckedOnce: () => setHasCheckedOnce(true),
  }
}
