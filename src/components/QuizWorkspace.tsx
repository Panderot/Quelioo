import { useTranslation } from 'react-i18next'

import { useQuizEditor } from '../hooks/useQuizEditor'
import type { GeneratedQuiz } from '../lib/quiz'
import QuizResultView from './QuizResultView'
import type { QuizResultMeta } from './QuizResultView'

interface ArchiveLink {
  href: string
  label: string
}

interface QuizWorkspaceProps {
  quizId: string
  initialQuiz: GeneratedQuiz
  sourceText: string
  meta: QuizResultMeta
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  requestedCount: number
  incomplete: boolean
  /** The source supports fewer good questions than requested — shown as a short note. */
  supportedCount?: number
  onPersist: (quiz: GeneratedQuiz) => void
  archiveLink?: ArchiveLink
  studyMode?: boolean
  onToggleStudyMode?: () => void
  includeExplanations?: boolean
  shuffleOptions?: boolean
  includeHints?: boolean
  focusSnippets?: string[]
  onSongSaved?: () => void
}

export default function QuizWorkspace({
  quizId,
  initialQuiz,
  sourceText,
  meta,
  difficulty,
  optionsCount,
  outputLanguage,
  requestedCount,
  incomplete,
  supportedCount,
  onPersist,
  archiveLink,
  studyMode,
  onToggleStudyMode,
  includeExplanations,
  shuffleOptions,
  includeHints,
  focusSnippets,
  onSongSaved,
}: QuizWorkspaceProps) {
  const { t } = useTranslation()
  const editor = useQuizEditor({
    quizId,
    initialQuiz,
    sourceText,
    questionType: meta.questionType,
    difficulty,
    optionsCount,
    outputLanguage,
    requestedCount,
    incomplete,
    onPersist,
    includeExplanations,
    shuffleOptions,
    includeHints,
    focusSnippets,
  })

  return (
    <>
      <QuizResultView
        quizId={quizId}
        sourceText={sourceText}
        quiz={editor.quiz}
        meta={meta}
        onTitleChange={editor.updateTitle}
        onQuestionUpdate={editor.updateQuestion}
        onQuestionDelete={editor.deleteQuestion}
        onQuestionRegenerate={(id) => void editor.regenerateQuestion(id)}
        regeneratingId={editor.regeneratingId}
        deletedQuestion={editor.deleted?.question ?? null}
        onUndoDelete={editor.undoDelete}
        archiveLink={archiveLink}
        studyMode={studyMode}
        onToggleStudyMode={onToggleStudyMode}
        missingCount={editor.missingCount}
        supportedCount={supportedCount}
        isToppingUp={editor.isToppingUp}
        onTopUp={() => void editor.topUp()}
        onSongSaved={onSongSaved}
        onAddMissing={() => void editor.addMissing()}
        isAddingMissing={editor.isAddingMissing}
      />
      {editor.regenerateError && (
        <p role="alert" data-print-hide className="-mt-2 text-xs font-medium text-error">
          {t(`create.errors.${editor.regenerateError}`)}
        </p>
      )}
      {editor.addMissingError && (
        <p role="alert" data-print-hide className="-mt-2 text-xs font-medium text-error">
          {t(`create.errors.${editor.addMissingError}`)}
        </p>
      )}
      {editor.topUpError && (
        <p role="alert" data-print-hide className="-mt-2 text-xs font-medium text-error">
          {t(`create.errors.${editor.topUpError}`)}
        </p>
      )}
    </>
  )
}
