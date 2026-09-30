import { useTranslation } from 'react-i18next'

import AnswerBar from './AnswerBar'
import type { CheckResultState } from './AnswerBar'
import { useCheckableAnswer } from '../hooks/useCheckableAnswer'
import { isLenientMatch } from '../lib/answerCheck'
import { getAcceptableAnswers } from '../lib/quiz'
import type { FillBlankQuestion } from '../lib/quiz'

interface FillBlankCheckProps {
  question: FillBlankQuestion
  signature: string
  onFirstCheck?: () => void
  onGraded?: (correct: boolean) => void
}

/** Fill-in-the-blank: checked locally only (lenient normalization + tiny typo tolerance), no AI call. */
export default function FillBlankCheck({ question, signature, onFirstCheck, onGraded }: FillBlankCheckProps) {
  const { t } = useTranslation()
  const state = useCheckableAnswer<string, CheckResultState>(signature, '')

  const runCheck = () => {
    if (!state.value.trim()) return
    const correct = isLenientMatch(state.value, [question.answer, ...getAcceptableAnswers(question)])
    state.setResult({ status: correct ? 'correct' : 'incorrect' })
    if (!state.hasCheckedOnce) {
      state.markCheckedOnce()
      onFirstCheck?.()
    }
    onGraded?.(correct)
  }

  return (
    <AnswerBar
      fieldType="input"
      value={state.value}
      onChange={(value) => {
        state.setValue(value)
        if (state.result) state.setResult(null)
      }}
      onCheck={runCheck}
      checkOnPlainEnter
      checkDisabled={!state.value.trim()}
      result={state.result}
      placeholder={t('create.result.answerPlaceholder')}
      ariaLabel={t('create.result.yourAnswerLabel')}
    />
  )
}
