import { useTranslation } from 'react-i18next'

import AnswerBar from './AnswerBar'
import type { CheckResultState } from './AnswerBar'
import { useCheckableAnswer } from '../hooks/useCheckableAnswer'
import { isLenientMatch } from '../lib/answerCheck'
import { getAcceptableAnswers } from '../lib/quiz'
import type { ShortAnswerQuestion } from '../lib/quiz'
import { gradeAnswer } from '../api/gradeAnswer'

interface ShortAnswerCheckProps {
  question: ShortAnswerQuestion
  signature: string
  outputLanguage: string
  onFirstCheck?: () => void
  onGraded?: (correct: boolean) => void
}

/** Short answer: checked locally first (same lenient comparison as fill-blanks); only when that
 * doesn't match does it ask the AI grader for a second opinion before showing "wrong". */
export default function ShortAnswerCheck({ question, signature, outputLanguage, onFirstCheck, onGraded }: ShortAnswerCheckProps) {
  const { t } = useTranslation()
  const state = useCheckableAnswer<string, CheckResultState>(signature, '')

  const finish = (result: CheckResultState) => {
    state.setResult(result)
    if (!state.hasCheckedOnce) {
      state.markCheckedOnce()
      onFirstCheck?.()
    }
    onGraded?.(result.status === 'correct')
  }

  const runCheck = async () => {
    const trimmed = state.value.trim()
    if (!trimmed) return
    state.setError(null)

    if (isLenientMatch(trimmed, [question.answer, ...getAcceptableAnswers(question)])) {
      finish({ status: 'correct' })
      return
    }

    state.setIsChecking(true)
    try {
      const graded = await gradeAnswer({
        type: 'short-answer',
        question: question.question,
        modelAnswer: question.answer,
        keyPoints: [question.answer],
        evidence: question.evidence ?? '',
        studentAnswer: trimmed,
        language: outputLanguage,
      })
      finish({ status: graded.verdict, feedback: graded.feedback, covered: graded.covered, total: graded.total })
    } catch {
      state.setError(t('create.result.checkError'))
    } finally {
      state.setIsChecking(false)
    }
  }

  return (
    <AnswerBar
      fieldType="textarea"
      rows={2}
      value={state.value}
      onChange={(value) => {
        state.setValue(value)
        if (state.result) state.setResult(null)
        if (state.error) state.setError(null)
      }}
      onCheck={() => void runCheck()}
      checkOnPlainEnter
      checkDisabled={!state.value.trim()}
      isChecking={state.isChecking}
      result={state.result}
      error={state.error}
      onRetry={() => void runCheck()}
      placeholder={t('create.result.answerPlaceholder')}
      ariaLabel={t('create.result.yourAnswerLabel')}
    />
  )
}
