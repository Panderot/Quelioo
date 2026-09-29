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
  demo: boolean
  sourceText: string
  meta: QuizResultMeta
  difficulty: string
  optionsCount?: string
  outputLanguage: string
  uiLanguage: string
  onPersist: (quiz: GeneratedQuiz) => void
  archiveLink?: ArchiveLink
  studyMode?: boolean
  onToggleStudyMode?: () => void
}

export default function QuizWorkspace({
  initialQuiz,
  demo,
  sourceText,
  meta,
  difficulty,
  optionsCount,
  outputLanguage,
  uiLanguage,
  onPersist,
  archiveLink,
  studyMode,
  onToggleStudyMode,
}: QuizWorkspaceProps) {
  const { t } = useTranslation()
  const editor = useQuizEditor({ initialQuiz, sourceText, difficulty, optionsCount, outputLanguage, uiLanguage, onPersist })

  return (
    <>
      <QuizResultView
        quiz={editor.quiz}
        demo={demo}
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
      />
      {editor.regenerateError && (
        <p role="alert" className="-mt-2 text-xs font-medium text-error">
          {t(`create.errors.${editor.regenerateError}`)}
        </p>
      )}
    </>
  )
}
