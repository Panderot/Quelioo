import { useTranslation } from 'react-i18next'

import AnswerBar from './AnswerBar'
import type { CheckResultState } from './AnswerBar'
import { HintBox, HintButton } from './HintControls'
import { useCheckableAnswer } from '../hooks/useCheckableAnswer'
import { useHints } from '../hooks/useHints'
import { getKeyPoints } from '../lib/quiz'
import type { OpenEndedQuestion } from '../lib/quiz'
import { gradeAnswer } from '../api/gradeAnswer'
import { MAX_STUDENT_ANSWER_CHARS } from '../lib/grading'
import { getHints } from '../lib/hints'

interface OpenEndedCheckProps {
  question: OpenEndedQuestion
  signature: string
  outputLanguage: string
  showAnswers?: boolean
  onFirstCheck?: () => void
  onGraded?: (correct: boolean) => void
  onHintUsed?: () => void
}

/** Open-ended: always graded by the AI (no local check) — plain Enter inserts a newline, only
 * Ctrl/Cmd+Enter checks, since answers can be multiple lines. */
export default function OpenEndedCheck({ question, signature, outputLanguage, showAnswers = false, onFirstCheck, onGraded, onHintUsed }: OpenEndedCheckProps) {
  const { t } = useTranslation()
  const state = useCheckableAnswer<string, CheckResultState>(signature, '')
  const hints = getHints(question)
  const hintState = useHints(signature, hints.length)

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
    state.setIsChecking(true)
    try {
      const graded = await gradeAnswer({
        type: 'open-ended',
        question: question.question,
        modelAnswer: question.answer,
        keyPoints: getKeyPoints(question),
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
      rows={4}
      maxLength={MAX_STUDENT_ANSWER_CHARS}
      value={state.value}
      onChange={(value) => {
        state.setValue(value)
        if (state.result) state.setResult(null)
        if (state.error) state.setError(null)
      }}
      onCheck={() => void runCheck()}
      checkDisabled={!state.value.trim()}
      isChecking={state.isChecking}
      result={state.result}
      error={state.error}
      onRetry={() => void runCheck()}
      placeholder={t('create.result.answerPlaceholder')}
      ariaLabel={t('create.result.yourAnswerLabel')}
      charCount={{ current: state.value.length, max: MAX_STUDENT_ANSWER_CHARS }}
      hintButton={
        <HintButton
          hints={hints}
          revealedCount={hintState.revealedCount}
          onReveal={() => {
            hintState.revealNext()
            onHintUsed?.()
          }}
          hidden={showAnswers || state.result?.status === 'correct'}
        />
      }
      hintBox={<HintBox hints={hints} revealedCount={hintState.revealedCount} />}
    />
  )
}
