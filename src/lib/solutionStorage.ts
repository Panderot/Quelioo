import type { SolveResult } from '../api/solve'
import { clearAllLocalSolutions, deleteSolutionLocal, getAllSolutionsLocal, getSolutionLocal, restoreSolutionLocal, saveSolutionLocal, updateSolutionExtrasLocal } from './legacy/solutionStorageLocal'
import { deleteSolutionRemote, getAllSolutionsRemote, getSolutionRemote, restoreSolutionRemote, saveSolutionRemote, updateSolutionExtrasRemote } from './remote/solutionsRemote'
import { isFakeBackend } from './supabase'

/** Every successful Solve is kept in the account: metadata and results in Supabase `solves`, the
 * ≤800px thumbnail in the private `uploads` bucket (shown through a signed URL). Backs the Archive
 * "Solutions" tab and /archive/solutions/:id. The UI-logic test build (fake backend) and the one-time
 * import use the original browser-local store (IndexedDB `quelio-solutions`). */

/** Longest side of the stored thumbnail; the full-size photo is never stored. */
const THUMBNAIL_MAX_SIDE = 800
const THUMBNAIL_QUALITY = 0.75

/** Bump when a new field needs more than a read-time default (see normalizeSolution). */
export const SOLUTION_SCHEMA_VERSION = 1

export interface StoredSolution {
  id: string
  schemaVersion: number
  createdAt: string
  /** Compressed JPEG of the cropped photo (≤800px) when this device holds it (local store, just
   * solved), or null. Account solutions are shown through `thumbnailUrl` instead. */
  thumbnail: Blob | null
  /** Short-lived signed URL of the stored thumbnail (account solutions), or null. */
  thumbnailUrl: string | null
  /** Output language requested for this solve ('auto' or a language code). */
  language: string
  result: SolveResult
  /**
   * Open-ended slot for later features (check-my-solution results, similar problems and the
   * student's answers, another method, step explanations). Each feature owns one key here and
   * must tolerate it being absent, so new data never needs a destructive migration.
   */
  extras: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/** Normalizes any stored shape (older or partial records) into the current one — every read goes
 * through this so old records render instead of breaking. Returns null for unusable junk. */
export function normalizeSolution(raw: unknown, thumbnailOf: (stored: unknown) => Blob | null = () => null): StoredSolution | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const result = isRecord(raw.result) ? raw.result : {}
  return {
    id: raw.id,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    thumbnail: thumbnailOf(raw.thumbnail),
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl : null,
    language: typeof raw.language === 'string' ? raw.language : 'auto',
    result: {
      topic: typeof result.topic === 'string' ? result.topic : '',
      question: typeof result.question === 'string' ? result.question : '',
      intro: typeof result.intro === 'string' ? result.intro : '',
      steps: stringArray(result.steps),
      answer: typeof result.answer === 'string' ? result.answer : '',
      tip: typeof result.tip === 'string' ? result.tip : '',
      mistakes: stringArray(result.mistakes).slice(0, 2),
    },
    extras: isRecord(raw.extras) ? raw.extras : {},
  }
}

/** Shrinks the (already cropped) upload JPEG into a ≤800px thumbnail. Null if it can't be made. */
export async function makeThumbnail(dataUrl: string): Promise<Blob | null> {
  try {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_QUALITY))
  } catch {
    return null
  }
}

export interface NewSolution {
  result: SolveResult
  imageDataUrl: string
  language: string
}

/** Throws when the account store is unreachable — callers keep working and show a localized note. */
export function saveSolution(input: NewSolution): Promise<StoredSolution> {
  return isFakeBackend ? saveSolutionLocal(input) : saveSolutionRemote(input)
}

/** Puts a previously deleted record back with its original id and date (undo). */
export function restoreSolution(record: StoredSolution): Promise<void> {
  return isFakeBackend ? restoreSolutionLocal(record) : restoreSolutionRemote(record)
}

/** Every saved solution, newest first. Rejects when the account copy cannot be read (the list shows a retry). */
export function getAllSolutions(): Promise<StoredSolution[]> {
  return isFakeBackend ? getAllSolutionsLocal() : getAllSolutionsRemote()
}

export function getSolution(id: string): Promise<StoredSolution | null> {
  return isFakeBackend ? getSolutionLocal(id) : getSolutionRemote(id)
}

export function deleteSolution(id: string): Promise<void> {
  return isFakeBackend ? deleteSolutionLocal(id) : deleteSolutionRemote(id)
}

/** Merges one feature's data into a saved solution's `extras[key]`. */
export function updateSolutionExtras(id: string, key: string, value: unknown): Promise<void> {
  return isFakeBackend ? updateSolutionExtrasLocal(id, key, value) : updateSolutionExtrasRemote(id, key, value)
}

/** Fills in the thumbnail bytes of an account solution (needed before deleting it, so Undo can put it back). */
export async function withThumbnailBlob(solution: StoredSolution): Promise<StoredSolution> {
  if (solution.thumbnail || !solution.thumbnailUrl) return solution
  try {
    const response = await fetch(solution.thumbnailUrl)
    return response.ok ? { ...solution, thumbnail: await response.blob() } : solution
  } catch {
    return solution
  }
}

/** Solutions still stored in this browser (before the account existed), for the import. */
export function readLegacySolutions(): Promise<StoredSolution[]> {
  return getAllSolutionsLocal()
}

export function clearLegacySolutions(): Promise<void> {
  return clearAllLocalSolutions()
}
