import { getAuthState } from '../auth/authStore'
import type { Json } from '../database.types'
import { isFakeBackend, supabase } from '../supabase'
import { clearDraft } from './drafts'
import { newExamId, sanitizeExam, sanitizeHeaderDefaults } from './factory'
import type { ExamHeader, WrittenExam } from './types'

/** The account's written exams. Saves are conditional on the `updated_at` the editor loaded, so a save
 * from an older tab is refused (`conflict`) instead of silently overwriting. No write queue: the result
 * of every save is known. The UI-logic test build (fake backend) keeps the same rules in localStorage. */

export interface ExamListItem {
  id: string
  title: string
  course: string
  grade: string
  createdAt: string
  updatedAt: string
  questionCount: number
}

export type SaveResult = { status: 'ok'; updatedAt: string } | { status: 'conflict' } | { status: 'missing' } | { status: 'error' }

const FAKE_EXAMS_KEY = 'quelio.exams.v1'
const FAKE_HEADER_KEY = 'quelio.examHeader.v1.'

const currentUserId = () => getAuthState().user?.id ?? null

// ---------------------------------------------------------------------------
// Browser-local copy (fake backend only)
// ---------------------------------------------------------------------------

function readFake(): WrittenExam[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FAKE_EXAMS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(sanitizeExam).filter((exam): exam is WrittenExam => exam !== null)
  } catch {
    return []
  }
}

function writeFake(exams: WrittenExam[]) {
  localStorage.setItem(FAKE_EXAMS_KEY, JSON.stringify(exams))
}

/** A timestamp strictly after `previous`, so two saves in the same millisecond still differ. */
function nextStamp(previous: string): string {
  const prev = Date.parse(previous)
  return new Date(Math.max(Date.now(), Number.isNaN(prev) ? 0 : prev + 1)).toISOString()
}

const toListItem = (exam: WrittenExam): ExamListItem => ({
  id: exam.id,
  title: exam.title,
  course: exam.settings.header.course,
  grade: exam.settings.header.grade,
  createdAt: exam.createdAt,
  updatedAt: exam.updatedAt,
  questionCount: exam.questions.length,
})

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export async function listExams(): Promise<ExamListItem[] | null> {
  if (isFakeBackend) return readFake().map(toListItem).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const { data, error } = await supabase
    .from('written_exams')
    .select('id,title,created_at,updated_at,question_count,header:settings->header')
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) return null
  return data.map((row) => {
    const header = sanitizeHeaderDefaults(row.header)
    return { id: row.id, title: row.title, course: header.course, grade: header.grade, createdAt: row.created_at, updatedAt: row.updated_at, questionCount: row.question_count }
  })
}

export async function getExam(id: string): Promise<WrittenExam | null> {
  if (isFakeBackend) return readFake().find((exam) => exam.id === id) ?? null
  const { data, error } = await supabase.from('written_exams').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return sanitizeExam({
    id: data.id,
    title: data.title,
    settings: data.settings,
    questions: data.questions,
    sourceQuizId: data.source_quiz_id,
    sourceText: data.source_text,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  })
}

/** Saves a new exam; the returned `updatedAt` is what later saves must pass as `expectedUpdatedAt`. */
export async function createExam(exam: WrittenExam): Promise<SaveResult> {
  if (isFakeBackend) {
    const stamp = new Date().toISOString()
    writeFake([...readFake().filter((existing) => existing.id !== exam.id), { ...exam, createdAt: stamp, updatedAt: stamp }])
    return { status: 'ok', updatedAt: stamp }
  }
  const { data, error } = await supabase
    .from('written_exams')
    .insert({
      id: exam.id,
      title: exam.title.slice(0, 300),
      settings: exam.settings as unknown as Json,
      questions: exam.questions as unknown as Json,
      source_quiz_id: exam.sourceQuizId,
      source_text: exam.sourceText,
    })
    .select('updated_at')
    .single()
  return error || !data ? { status: 'error' } : { status: 'ok', updatedAt: data.updated_at }
}

/** Conditional save: only when the stored copy still has `expectedUpdatedAt`. */
export async function saveExam(exam: WrittenExam, expectedUpdatedAt: string): Promise<SaveResult> {
  if (isFakeBackend) {
    const exams = readFake()
    const index = exams.findIndex((existing) => existing.id === exam.id)
    if (index === -1) return { status: 'missing' }
    if (exams[index].updatedAt !== expectedUpdatedAt) return { status: 'conflict' }
    const updatedAt = nextStamp(exams[index].updatedAt)
    exams[index] = { ...exam, createdAt: exams[index].createdAt, updatedAt }
    writeFake(exams)
    return { status: 'ok', updatedAt }
  }
  const { data, error } = await supabase
    .from('written_exams')
    .update({
      title: exam.title.slice(0, 300),
      settings: exam.settings as unknown as Json,
      questions: exam.questions as unknown as Json,
      source_text: exam.sourceText,
    })
    .eq('id', exam.id)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
  if (error) return { status: 'error' }
  if (data.length > 0) return { status: 'ok', updatedAt: data[0].updated_at }
  const { data: existing, error: lookupError } = await supabase.from('written_exams').select('id').eq('id', exam.id).maybeSingle()
  if (lookupError) return { status: 'error' }
  return existing ? { status: 'conflict' } : { status: 'missing' }
}

/** Renames an exam (changes its `updated_at`, so an editor open in another tab sees a conflict on its next save). */
export async function renameExam(id: string, title: string): Promise<SaveResult> {
  const clean = title.trim().slice(0, 300)
  if (isFakeBackend) {
    const exams = readFake()
    const index = exams.findIndex((exam) => exam.id === id)
    if (index === -1) return { status: 'missing' }
    const updatedAt = nextStamp(exams[index].updatedAt)
    exams[index] = { ...exams[index], title: clean, updatedAt }
    writeFake(exams)
    return { status: 'ok', updatedAt }
  }
  const { data, error } = await supabase.from('written_exams').update({ title: clean }).eq('id', id).select('updated_at')
  if (error) return { status: 'error' }
  return data.length > 0 ? { status: 'ok', updatedAt: data[0].updated_at } : { status: 'missing' }
}

/** A copy under a new id, titled with `titleSuffix` appended (the caller supplies the localized text). */
export async function duplicateExam(id: string, titleSuffix: string): Promise<WrittenExam | null> {
  const original = await getExam(id)
  if (!original) return null
  const stamp = new Date().toISOString()
  const copy: WrittenExam = { ...original, id: newExamId(), title: `${original.title}${titleSuffix}`.slice(0, 300), createdAt: stamp, updatedAt: stamp }
  const result = await createExam(copy)
  return result.status === 'ok' ? { ...copy, updatedAt: result.updatedAt } : null
}

export async function deleteExam(id: string): Promise<boolean> {
  const userId = currentUserId()
  if (isFakeBackend) {
    writeFake(readFake().filter((exam) => exam.id !== id))
  } else {
    const { error } = await supabase.from('written_exams').delete().eq('id', id)
    if (error) return false
  }
  if (userId) clearDraft(userId, id)
  return true
}

// ---------------------------------------------------------------------------
// Header fields remembered per teacher
// ---------------------------------------------------------------------------

export async function loadExamDefaults(): Promise<ExamHeader | null> {
  const userId = currentUserId()
  if (!userId) return null
  if (isFakeBackend) {
    try {
      const raw = localStorage.getItem(`${FAKE_HEADER_KEY}${userId}`)
      return raw ? sanitizeHeaderDefaults(JSON.parse(raw)) : null
    } catch {
      return null
    }
  }
  const { data, error } = await supabase.from('exam_settings').select('header').eq('user_id', userId).maybeSingle()
  return error || !data ? null : sanitizeHeaderDefaults(data.header)
}

export async function saveExamDefaults(header: ExamHeader): Promise<boolean> {
  const userId = currentUserId()
  if (!userId) return false
  if (isFakeBackend) {
    localStorage.setItem(`${FAKE_HEADER_KEY}${userId}`, JSON.stringify(header))
    return true
  }
  const { error } = await supabase.from('exam_settings').upsert({ user_id: userId, header: header as unknown as Json }, { onConflict: 'user_id' })
  return !error
}
