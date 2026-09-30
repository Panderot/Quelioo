import { useState } from 'react'

/** Whether a question's explanation should be unlockable right now — used by QuestionCard to gate
 * the "Show explanation" link until the student has checked an answer (or answers are shown),
 * for every question type. */
export function useExplanationUnlocked(signature: string, showAnswers: boolean) {
  const [checkedSignature, setCheckedSignature] = useState<string | null>(null)

  // Adjust state during render (React's recommended alternative to an effect here) so the reset
  // happens before this render commits, instead of firing a separate effect pass afterward.
  const [prevSignature, setPrevSignature] = useState(signature)
  if (prevSignature !== signature) {
    setPrevSignature(signature)
    setCheckedSignature(null)
  }

  const markChecked = () => setCheckedSignature(signature)
  return { unlocked: showAnswers || checkedSignature === signature, markChecked }
}
