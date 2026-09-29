export interface GenerateQuizPayload {
  source: 'text' | 'file' | 'url' | 'youtube'
  content: string
  outputLanguage: string
  studyMode: boolean
  questionType: string
  questionCount: string
  difficulty: string
  optionsCount: string
}

// TODO: replace with the real API call once the backend endpoint exists.
export async function generateQuiz(payload: GenerateQuizPayload): Promise<void> {
  void payload
  await new Promise((resolve) => setTimeout(resolve, 1200))
}
