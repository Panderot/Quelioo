import { hashText } from './hash'
import { isLessonLevel, isLessonStyle, isLessonTone, isRecord } from './lesson'
import type { EpisodePlan, EpisodeScript, KeyPoint, LessonOptions } from './lesson'
import { clearAllLocalLessons, deleteLessonLocal, getAllLessonsLocal, getAllPlansLocal, getAllSegmentsLocal, getCachedPlanLocal, getLessonLocal, getSegmentsLocal, isLocalLessonStoragePersistent, pruneSegmentsLocal, putCachedPlanLocal, putLessonLocal, putSegmentLocal } from './legacy/lessonStorageLocal'
import { clearLessonCache, deleteLessonRemote, getAllLessonsRemote, getCachedPlanRemote, getLessonRemote, getSegmentsRemote, putCachedPlanRemote, putLessonRemote, putSegmentRemote, pruneSegmentsRemote } from './remote/lessonsRemote'
import { isFakeBackend } from './supabase'

/** Audio lessons live in the account: lessons in Supabase `lessons`, cached plans in `lesson_plans`, recorded
 * lines in `lesson_segments` with their audio in the private `audio` bucket. `lessons` holds one record
 * per lesson (all its parts); `plans` caches the extracted key points per source + level + language, so
 * changing only style or tone never pays for a second extraction. The UI-logic test build (fake
 * backend) and the one-time import use the original browser-local store (IndexedDB `quelio-lessons`). */

export const LESSON_SCHEMA_VERSION = 1
const SPEND_KEY = 'quelio.lessonSpend.v1'

export type LessonSourceKind = 'text' | 'file' | 'url' | 'quiz' | 'solution'

export interface StoredEpisode extends EpisodePlan {
  script: EpisodeScript | null
  /** Real cost of generating this part's script (owner-only info), null before it exists. */
  costUsd: number | null
  cachedShare: number | null
  /** Every line of this part has recorded audio for its current text and voices. */
  hasAudio?: boolean
  /** Real length of the joined audio file in seconds (frames plus pause silences); set once every line has audio. */
  audioSeconds?: number
  /** The student changed the script since its last check; it is re-checked before the next step. */
  pendingCheck?: boolean
  /** The student approved the script; only approved scripts are recorded. */
  approved?: boolean
  /** Voice per speaker id. */
  voices?: Record<string, string>
  /** Real cost of the audio recorded for this part so far. */
  audioCostUsd?: number
  /** Unknown abbreviations the pronunciation pass spelled out (owner info). */
  unknownAbbreviations?: string[]
}

export interface StoredLesson {
  id: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
  title: string
  sourceKind: LessonSourceKind
  /** File name, URL, quiz title or solution topic; empty for pasted text. */
  sourceLabel: string
  sourceText: string
  /** Hash of source text + options, to offer an existing lesson instead of paying again. */
  sourceHash: string
  options: LessonOptions
  keyPoints: KeyPoint[]
  episodes: StoredEpisode[]
  planCostUsd: number
}

export interface CachedPlan {
  key: string
  title: string
  keyPoints: KeyPoint[]
  episodes: EpisodePlan[]
}

export function lessonSourceHash(sourceText: string, options: LessonOptions): string {
  return hashText(JSON.stringify([sourceText.trim(), options.style, options.level, options.tone, options.language]))
}

export function planCacheKey(sourceText: string, level: string, language: string): string {
  return hashText(JSON.stringify([sourceText.trim(), level, language]))
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createLessonId(): string {
  return makeId()
}

/** Normalizes any stored shape; null for unusable records. */
export function normalizeLesson(raw: unknown): StoredLesson | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isRecord(raw.options) || !Array.isArray(raw.episodes) || !Array.isArray(raw.keyPoints)) return null
  const options = raw.options
  const kinds: LessonSourceKind[] = ['text', 'file', 'url', 'quiz', 'solution']
  return {
    id: raw.id,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : LESSON_SCHEMA_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    title: typeof raw.title === 'string' ? raw.title : '',
    sourceKind: kinds.includes(raw.sourceKind as LessonSourceKind) ? (raw.sourceKind as LessonSourceKind) : 'text',
    sourceLabel: typeof raw.sourceLabel === 'string' ? raw.sourceLabel : '',
    sourceText: typeof raw.sourceText === 'string' ? raw.sourceText : '',
    sourceHash: typeof raw.sourceHash === 'string' ? raw.sourceHash : '',
    options: {
      style: isLessonStyle(options.style) ? options.style : 'two_hosts',
      level: isLessonLevel(options.level) ? options.level : 'general',
      tone: isLessonTone(options.tone) ? options.tone : 'normal',
      language: typeof options.language === 'string' ? options.language : 'auto',
    },
    keyPoints: raw.keyPoints as KeyPoint[],
    episodes: (raw.episodes as unknown[]).filter(isRecord).map((episode, index) => ({
      part: typeof episode.part === 'number' ? episode.part : index + 1,
      keyPointIds: Array.isArray(episode.keyPointIds) ? (episode.keyPointIds as string[]) : [],
      script: isRecord(episode.script) ? (episode.script as unknown as EpisodeScript) : null,
      costUsd: typeof episode.costUsd === 'number' ? episode.costUsd : null,
      cachedShare: typeof episode.cachedShare === 'number' ? episode.cachedShare : null,
      ...(episode.hasAudio === true ? { hasAudio: true } : {}),
      ...(episode.hasAudio === true && typeof episode.audioSeconds === 'number' && episode.audioSeconds > 0 ? { audioSeconds: episode.audioSeconds } : {}),
      ...(episode.pendingCheck === true ? { pendingCheck: true } : {}),
      ...(episode.approved === true ? { approved: true } : {}),
      ...(isRecord(episode.voices) ? { voices: episode.voices as Record<string, string> } : {}),
      ...(typeof episode.audioCostUsd === 'number' ? { audioCostUsd: episode.audioCostUsd } : {}),
      ...(Array.isArray(episode.unknownAbbreviations) ? { unknownAbbreviations: (episode.unknownAbbreviations as unknown[]).filter((entry): entry is string => typeof entry === 'string') } : {}),
    })),
    planCostUsd: typeof raw.planCostUsd === 'number' ? raw.planCostUsd : 0,
  }
}


// ---------------------------------------------------------------------------
// Storage (account in production; the browser-local store in the UI-logic test build)
// ---------------------------------------------------------------------------

/** False once storage turned out to be unavailable (lessons then last for this session only). */
export function isLessonStoragePersistent(): boolean {
  return isFakeBackend ? isLocalLessonStoragePersistent() : true
}

const listeners = new Set<() => void>()

export function subscribeLessons(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  listeners.forEach((listener) => listener())
}

export async function getAllLessons(): Promise<StoredLesson[]> {
  return isFakeBackend ? getAllLessonsLocal() : getAllLessonsRemote()
}

export async function getLesson(id: string): Promise<StoredLesson | null> {
  return isFakeBackend ? getLessonLocal(id) : getLessonRemote(id)
}

/** Saves (or replaces) a lesson. */
export async function putLesson(lesson: StoredLesson): Promise<StoredLesson> {
  const saved = isFakeBackend ? await putLessonLocal(lesson) : putLessonRemote(lesson)
  notify()
  return saved
}

export async function deleteLesson(id: string): Promise<void> {
  if (isFakeBackend) await deleteLessonLocal(id)
  else await deleteLessonRemote(id)
  notify()
}

export async function getCachedPlan(key: string): Promise<CachedPlan | null> {
  return isFakeBackend ? getCachedPlanLocal(key) : getCachedPlanRemote(key)
}

export async function putCachedPlan(plan: CachedPlan): Promise<void> {
  if (isFakeBackend) await putCachedPlanLocal(plan)
  else putCachedPlanRemote(plan)
}

// ---------------------------------------------------------------------------
// Recorded audio segments, keyed by segmentKey (normalized text, voice, model, instructions)
// ---------------------------------------------------------------------------

export interface StoredSegment {
  key: string
  audio: Blob
  durationSeconds: number
  createdAt: string
}

export async function getSegments(keys: string[]): Promise<Map<string, StoredSegment>> {
  return isFakeBackend ? getSegmentsLocal(keys) : getSegmentsRemote(keys)
}

export async function putSegment(segment: StoredSegment): Promise<void> {
  if (isFakeBackend) await putSegmentLocal(segment)
  else await putSegmentRemote(segment)
}

/** Deletes recorded audio that no saved lesson line uses any more. */
export async function pruneSegments(keep: Set<string>): Promise<void> {
  if (isFakeBackend) await pruneSegmentsLocal(keep)
  else await pruneSegmentsRemote(keep)
}

/** Forgets what this tab cached from the account (sign-out, other account). */
export function resetLessonCache(): void {
  clearLessonCache()
  notify()
}

/** Lessons, plans and recorded lines still stored in this browser (before the account existed), for the import. */
export async function readLegacyLessons(): Promise<{ lessons: StoredLesson[]; plans: CachedPlan[]; segments: StoredSegment[] }> {
  const [lessons, plans, segments] = await Promise.all([getAllLessonsLocal(), getAllPlansLocal(), getAllSegmentsLocal()])
  return { lessons, plans, segments }
}

export function clearLegacyLessons(): Promise<void> {
  return clearAllLocalLessons()
}

/** Status shown in the list: audio is ready once every part has audio (part 2 of the feature). */
export function lessonStatus(lesson: StoredLesson): 'audio' | 'script' | 'none' {
  if (lesson.episodes.length > 0 && lesson.episodes.every((episode) => episode.hasAudio)) return 'audio'
  return lesson.episodes.some((episode) => episode.script) ? 'script' : 'none'
}

/** Total listening time of a lesson: the real length of the audio files when every written part has
 * audio, otherwise the estimate of the written parts; null while nothing is written. */
export function lessonDuration(lesson: StoredLesson): { seconds: number; exact: boolean } | null {
  const written = lesson.episodes.filter((episode) => episode.script)
  if (written.length === 0) return null
  if (written.every((episode) => episode.hasAudio && typeof episode.audioSeconds === 'number')) {
    return { seconds: written.reduce((sum, episode) => sum + (episode.audioSeconds ?? 0), 0), exact: true }
  }
  return { seconds: written.reduce((sum, episode) => sum + (episode.script?.estimatedSeconds ?? 0), 0), exact: false }
}

export function lessonCostUsd(lesson: StoredLesson): number {
  return lesson.planCostUsd + lesson.episodes.reduce((sum, episode) => sum + (episode.costUsd ?? 0) + (episode.audioCostUsd ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Owner spend this month (scripts + audio), kept even when a lesson is deleted
// ---------------------------------------------------------------------------

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthLessonSpendUsd(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(SPEND_KEY) ?? 'null') as { month?: string; usd?: number } | null
    return raw && raw.month === currentMonth() && typeof raw.usd === 'number' ? raw.usd : 0
  } catch {
    return 0
  }
}

export function addLessonSpend(usd: number): void {
  if (!(usd > 0)) return
  try {
    localStorage.setItem(SPEND_KEY, JSON.stringify({ month: currentMonth(), usd: Math.round((monthLessonSpendUsd() + usd) * 100000) / 100000 }))
  } catch {
    // localStorage unavailable: the total simply isn't kept.
  }
}
