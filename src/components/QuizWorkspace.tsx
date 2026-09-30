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
  initialQuiz: GeneratedQuiz
  sourceText: string
  meta: QuizResultMeta
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  requestedCount: number
  incomplete: boolean
  onPersist: (quiz: GeneratedQuiz) => void
  archiveLink?: ArchiveLink
  studyMode?: boolean
  onToggleStudyMode?: () => void
  includeExplanations?: boolean
  shuffleOptions?: boolean
  includeHints?: boolean
  focusSnippets?: string[]
}

export default function QuizWorkspace({
  initialQuiz,
  sourceText,
  meta,
  difficulty,
  optionsCount,
  outputLanguage,
  requestedCount,
  incomplete,
  onPersist,
  archiveLink,
  studyMode,
  onToggleStudyMode,
  includeExplanations,
  shuffleOptions,
  includeHints,
  focusSnippets,
}: QuizWorkspaceProps) {
  const { t } = useTranslation()
  const editor = useQuizEditor({
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
        isToppingUp={editor.isToppingUp}
        onTopUp={() => void editor.topUp()}
      />
      {editor.regenerateError && (
        <p role="alert" className="-mt-2 text-xs font-medium text-error">
          {t(`create.errors.${editor.regenerateError}`)}
        </p>
      )}
      {editor.topUpError && (
        <p role="alert" className="-mt-2 text-xs font-medium text-error">
          {t(`create.errors.${editor.topUpError}`)}
        </p>
      )}
    </>
  )
}
