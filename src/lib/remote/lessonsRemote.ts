import { getAuthState } from '../auth/authStore'
import { enqueueWrite } from '../data/writeQueue'
import type { Json } from '../database.types'
import { LESSON_SCHEMA_VERSION, normalizeLesson } from '../lessonStorage'
import type { CachedPlan, StoredLesson, StoredSegment } from '../lessonStorage'
import { supabase } from '../supabase'
import type { InsertRow, Row } from '../supabase'
import { downloadFile, removeFiles, uploadFile } from './storageFiles'

/** Account copy of the audio lessons: `lessons`, `lesson_plans`, `lesson_segments` (+ audio in the
 * private `audio` bucket under "<user id>/segments/<key>.mp3"). What this tab changed is kept in
 * memory too, so a lesson saved a moment ago reads back correctly even while its write is queued. */

const memoryLessons = new Map<string, StoredLesson>()
const deletedLessonIds = new Set<string>()
const memoryPlans = new Map<string, CachedPlan>()
const segmentCache = new Map<string, StoredSegment>()

export function clearLessonCache(): void {
  memoryLessons.clear()
  deletedLessonIds.clear()
  memoryPlans.clear()
  segmentCache.clear()
}

function userId(): string {
  const id = getAuthState().user?.id
  if (!id) throw new Error('not signed in')
  return id
}

export function lessonToRow(lesson: StoredLesson, uid: string): InsertRow<'lessons'> {
  return {
    id: lesson.id,
    user_id: uid,
    schema_version: lesson.schemaVersion,
    title: lesson.title.slice(0, 300),
    source_kind: lesson.sourceKind,
    source_label: lesson.sourceLabel.slice(0, 500),
    source_text: lesson.sourceText,
    source_hash: lesson.sourceHash,
    options: lesson.options as unknown as Json,
    key_points: lesson.keyPoints as unknown as Json,
    episodes: lesson.episodes as unknown as Json,
    plan_cost_usd: lesson.planCostUsd,
    created_at: lesson.createdAt,
    updated_at: lesson.updatedAt,
  }
}

function rowToLesson(row: Row<'lessons'>): StoredLesson | null {
  return normalizeLesson({
    id: row.id,
    schemaVersion: row.schema_version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    title: row.title,
    sourceKind: row.source_kind,
    sourceLabel: row.source_label,
    sourceText: row.source_text,
    sourceHash: row.source_hash,
    options: row.options,
    keyPoints: row.key_points,
    episodes: row.episodes,
    planCostUsd: Number(row.plan_cost_usd),
  })
}

export async function getAllLessonsRemote(): Promise<StoredLesson[]> {
  const byId = new Map<string, StoredLesson>()
  for (let from = 0; ; from += 100) {
    const { data, error } = await supabase.from('lessons').select('*').order('created_at', { ascending: false }).range(from, from + 99)
    if (error) throw new Error(error.message)
    for (const row of data) {
      const lesson = rowToLesson(row)
      if (lesson) byId.set(lesson.id, lesson)
    }
    if (data.length < 100) break
  }
  for (const [id, lesson] of memoryLessons) byId.set(id, lesson)
  for (const id of deletedLessonIds) byId.delete(id)
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getLessonRemote(id: string): Promise<StoredLesson | null> {
  if (deletedLessonIds.has(id)) return null
  const local = memoryLessons.get(id)
  if (local) return local
  const { data, error } = await supabase.from('lessons').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToLesson(data) : null
}

/** Saves (or replaces) a lesson: the screen sees it at once, the write goes through the queue. */
export function putLessonRemote(lesson: StoredLesson): StoredLesson {
  const record = { ...lesson, schemaVersion: LESSON_SCHEMA_VERSION, updatedAt: new Date().toISOString() }
  memoryLessons.set(record.id, record)
  deletedLessonIds.delete(record.id)
  enqueueWrite({ kind: 'upsert', table: 'lessons', rows: [lessonToRow(record, userId())], onConflict: 'id' })
  return record
}

export async function deleteLessonRemote(id: string): Promise<void> {
  memoryLessons.delete(id)
  deletedLessonIds.add(id)
  enqueueWrite({ kind: 'delete', table: 'lessons', column: 'id', values: [id] })
}

export async function getCachedPlanRemote(key: string): Promise<CachedPlan | null> {
  const local = memoryPlans.get(key)
  if (local) return local
  const { data } = await supabase.from('lesson_plans').select('*').eq('key', key).maybeSingle()
  if (!data) return null
  return { key: data.key, title: data.title, keyPoints: data.key_points as unknown as CachedPlan['keyPoints'], episodes: data.episodes as unknown as CachedPlan['episodes'] }
}

export function putCachedPlanRemote(plan: CachedPlan): void {
  memoryPlans.set(plan.key, plan)
  enqueueWrite({
    kind: 'upsert',
    table: 'lesson_plans',
    rows: [{ user_id: userId(), key: plan.key, title: plan.title.slice(0, 300), key_points: plan.keyPoints as unknown as Json, episodes: plan.episodes as unknown as Json }],
    onConflict: 'user_id,key',
  })
}

// ---------------------------------------------------------------------------
// Recorded audio segments
// ---------------------------------------------------------------------------

const segmentPath = (uid: string, key: string) => `${uid}/segments/${key}.mp3`

export async function getSegmentsRemote(keys: string[]): Promise<Map<string, StoredSegment>> {
  const found = new Map<string, StoredSegment>()
  const missing: string[] = []
  for (const key of new Set(keys)) {
    const cached = segmentCache.get(key)
    if (cached) found.set(key, cached)
    else missing.push(key)
  }
  for (let index = 0; index < missing.length; index += 100) {
    const { data, error } = await supabase.from('lesson_segments').select('*').in('key', missing.slice(index, index + 100))
    if (error) continue
    const queue = [...data]
    // Four downloads at a time.
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let row = queue.shift(); row; row = queue.shift()) {
          const audio = await downloadFile('audio', row.audio_path)
          if (!audio) continue
          const segment: StoredSegment = { key: row.key, audio, durationSeconds: Number(row.duration_seconds), createdAt: new Date(row.created_at).toISOString() }
          segmentCache.set(row.key, segment)
          found.set(row.key, segment)
        }
      }),
    )
  }
  return found
}

/** Keeps the line in memory at once; uploads the audio and queues the row. A failed upload only
 * costs the saved copy (the line is recorded again the next time it is needed). */
export async function putSegmentRemote(segment: StoredSegment): Promise<void> {
  segmentCache.set(segment.key, segment)
  const uid = userId()
  const path = segmentPath(uid, segment.key)
  try {
    await uploadFile('audio', path, segment.audio, 'audio/mpeg')
  } catch {
    return
  }
  enqueueWrite({
    kind: 'upsert',
    table: 'lesson_segments',
    rows: [{ user_id: uid, key: segment.key, audio_path: path, duration_seconds: segment.durationSeconds, created_at: segment.createdAt || new Date().toISOString() }],
    onConflict: 'user_id,key',
  })
}

export async function pruneSegmentsRemote(keep: Set<string>): Promise<void> {
  for (const key of segmentCache.keys()) if (!keep.has(key)) segmentCache.delete(key)
  const stale: { key: string; audio_path: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('lesson_segments').select('key, audio_path').range(from, from + 999)
    if (error) return
    stale.push(...data.filter((row) => !keep.has(row.key)))
    if (data.length < 1000) break
  }
  if (stale.length === 0) return
  enqueueWrite({ kind: 'delete', table: 'lesson_segments', column: 'key', values: stale.map((row) => row.key) })
  await removeFiles('audio', stale.map((row) => row.audio_path))
}
