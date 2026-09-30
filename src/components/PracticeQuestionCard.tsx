import type { QuizQuestion } from '../lib/quiz'
import { getRightOrder } from '../lib/matching'
import { answerSignature } from '../lib/answerCheck'
import MathText from './MathText'
import MatchingColumns from './MatchingColumns'
import McqCheck from './McqCheck'
import TrueFalseCheck from './TrueFalseCheck'
import FillBlankCheck from './FillBlankCheck'
import ShortAnswerCheck from './ShortAnswerCheck'
import OpenEndedCheck from './OpenEndedCheck'

interface PracticeQuestionCardProps {
  index: number
  question: QuizQuestion
  outputLanguage: string
  onGraded: (correct: boolean) => void
  resetSignal: number
}

/** Study Mode practice card — same checkable, retryable answer UI as the editable result view
 * (QuestionCard), just without the number-badge actions or the explanation toggle. */
export default function PracticeQuestionCard({ index, question, outputLanguage, onGraded, resetSignal }: PracticeQuestionCardProps) {
  const key = `${question.id}-${resetSignal}`
  const signature = `${resetSignal}|${answerSignature(question)}`

  return (
    <li key={key} data-purpose="practice-question-card" className="space-y-3 rounded-[14px] border border-warm-border bg-card p-5 md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy">{index + 1}</span>
        <p className="text-sm font-semibold break-words text-ink">
          <MathText text={question.question} />
        </p>
      </div>

      {question.type === 'mcq' && <McqCheck options={question.options} answerIndex={question.answerIndex} signature={signature} onGraded={onGraded} />}

      {question.type === 'true-false' && <TrueFalseCheck answerBool={question.answerBool} signature={signature} onGraded={onGraded} />}

      {question.type === 'fill-blanks' && <FillBlankCheck question={question} signature={signature} onGraded={onGraded} />}

      {question.type === 'short-answer' && (
        <ShortAnswerCheck question={question} signature={signature} outputLanguage={outputLanguage} onGraded={onGraded} />
      )}

      {question.type === 'open-ended' && (
        <OpenEndedCheck question={question} signature={signature} outputLanguage={outputLanguage} onGraded={onGraded} />
      )}

      {question.type === 'matching' && (
        // Matching is auto-graded from its own check button — no "Reveal answer" step, and
        // rechecking after editing the answer is allowed, so grading isn't locked to one attempt.
        <MatchingColumns pairs={question.pairs} rightOrder={getRightOrder(question)} showAnswers={false} onGraded={onGraded} />
      )}
    </li>
  )
}
