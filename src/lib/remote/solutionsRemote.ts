import { getAuthState } from '../auth/authStore'
import { enqueueWrite } from '../data/writeQueue'
import type { Json } from '../database.types'
import type { SolveResult } from '../../api/solve'
import { SOLUTION_SCHEMA_VERSION, makeThumbnail, normalizeSolution } from '../solutionStorage'
import type { StoredSolution } from '../solutionStorage'
import { supabase } from '../supabase'
import type { Row } from '../supabase'
import { removeFiles, uploadFile, SIGNED_URL_SECONDS } from './storageFiles'

/** Account copy of the solutions: results and extras in `solves`, thumbnails in the private `uploads`
 * bucket under "<user id>/solves/<id>.jpg". */

class SolutionStorageError extends Error {}

type SolveRow = Row<'solves'>

function userId(): string {
  const id = getAuthState().user?.id
  if (!id) throw new SolutionStorageError('not signed in')
  return id
}

function toSolution(row: SolveRow, thumbnailUrl: string | null): StoredSolution | null {
  return normalizeSolution({
    id: row.id,
    schemaVersion: row.schema_version,
    createdAt: new Date(row.created_at).toISOString(),
    language: row.language,
    result: row.result,
    extras: row.extras,
    thumbnailUrl,
  })
}

/** Signed URLs for a batch of rows in one call. */
async function thumbnailUrls(rows: SolveRow[]): Promise<Map<string, string>> {
  const paths = rows.flatMap((row) => (row.thumbnail_path ? [row.thumbnail_path] : []))
  const urls = new Map<string, string>()
  if (paths.length === 0) return urls
  const { data, error } = await supabase.storage.from('uploads').createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (error || !data) return urls
  for (const entry of data) if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  return urls
}

async function insertSolution(record: { id: string; createdAt: string; language: string; result: SolveResult; extras: Record<string, unknown>; thumbnail: Blob | null }): Promise<void> {
  const uid = userId()
  const path = record.thumbnail ? `${uid}/solves/${record.id}.jpg` : null
  try {
    if (record.thumbnail && path) await uploadFile('uploads', path, record.thumbnail, 'image/jpeg')
  } catch {
    throw new SolutionStorageError('upload failed')
  }
  const { error } = await supabase.from('solves').upsert(
    {
      id: record.id,
      user_id: uid,
      language: record.language,
      schema_version: SOLUTION_SCHEMA_VERSION,
      result: record.result as unknown as Json,
      extras: record.extras as unknown as Json,
      thumbnail_path: path,
      created_at: record.createdAt,
    },
    { onConflict: 'id' },
  )
  if (error) {
    if (path) await removeFiles('uploads', [path])
    throw new SolutionStorageError(error.message)
  }
}

export async function saveSolutionRemote(input: { result: SolveResult; imageDataUrl: string; language: string }): Promise<StoredSolution> {
  const record: StoredSolution = {
    id: crypto.randomUUID(),
    schemaVersion: SOLUTION_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    thumbnail: await makeThumbnail(input.imageDataUrl),
    thumbnailUrl: null,
    language: input.language,
    result: input.result,
    extras: {},
  }
  await insertSolution(record)
  return record
}

export async function restoreSolutionRemote(record: StoredSolution): Promise<void> {
  await insertSolution(record)
}

export async function getAllSolutionsRemote(): Promise<StoredSolution[]> {
  const rows: SolveRow[] = []
  for (let from = 0; ; from += 200) {
    const { data, error } = await supabase.from('solves').select('*').order('created_at', { ascending: false }).range(from, from + 199)
    if (error) throw new SolutionStorageError(error.message)
    rows.push(...data)
    if (data.length < 200) break
  }
  const urls = await thumbnailUrls(rows)
  return rows.map((row) => toSolution(row, row.thumbnail_path ? (urls.get(row.thumbnail_path) ?? null) : null)).filter((entry): entry is StoredSolution => entry !== null)
}

export async function getSolutionRemote(id: string): Promise<StoredSolution | null> {
  const { data, error } = await supabase.from('solves').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  const urls = await thumbnailUrls([data])
  return toSolution(data, data.thumbnail_path ? (urls.get(data.thumbnail_path) ?? null) : null)
}

export async function deleteSolutionRemote(id: string): Promise<void> {
  const { data } = await supabase.from('solves').select('thumbnail_path').eq('id', id).maybeSingle()
  const { error } = await supabase.from('solves').delete().eq('id', id)
  if (error) return
  if (data?.thumbnail_path) await removeFiles('uploads', [data.thumbnail_path])
}

/** Merges one feature's data into `extras[key]` (a database function, so concurrent features never overwrite each other). Queued: never lost. */
export async function updateSolutionExtrasRemote(id: string, key: string, value: unknown): Promise<void> {
  enqueueWrite({ kind: 'rpc', fn: 'merge_solve_extras', args: { p_id: id, p_key: key, p_value: value } })
}
