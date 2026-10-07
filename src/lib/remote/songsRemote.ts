import { getAuthState } from '../auth/authStore'
import type { Json } from '../database.types'
import type { StoredSong } from '../songStorage'
import type { Row } from '../supabase'
import { supabase } from '../supabase'
import { downloadFile, removeFiles, signedUrl, uploadFile } from './storageFiles'

/** Account copy of the songs: metadata in `songs`, audio in the private `audio` bucket under
 * "<user id>/songs/<song id>.<ext>". */

class SongStorageError extends Error {}

type SongRow = Row<'songs'>

const blobCache = new Map<string, Blob>()

const extensionFor = (mimeType: string) => (mimeType.includes('wav') ? 'wav' : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'audio')

function makeId(): string {
  return crypto.randomUUID()
}

function userId(): string {
  const id = getAuthState().user?.id
  if (!id) throw new SongStorageError('not signed in')
  return id
}

function rowToSong(row: SongRow): StoredSong {
  return {
    id: row.id,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title || row.title,
    title: row.title,
    lyrics: row.lyrics,
    style: row.style as StoredSong['style'],
    tone: (row.tone || 'normal') as StoredSong['tone'],
    provider: row.provider as StoredSong['provider'],
    demo: row.demo,
    mimeType: row.mime_type,
    durationSeconds: Number(row.duration_seconds),
    factCheckPassed: row.fact_check_passed,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.coverage ? { coverage: row.coverage as unknown as NonNullable<StoredSong['coverage']> } : {}),
    ...(row.series_part !== null ? { seriesPart: row.series_part } : {}),
    audio: blobCache.get(row.id) ?? null,
    audioPath: row.audio_path,
  }
}

export async function saveSongRemote(entry: Omit<StoredSong, 'id' | 'createdAt' | 'audioPath'>): Promise<StoredSong> {
  const uid = userId()
  const id = makeId()
  const path = entry.audio ? `${uid}/songs/${id}.${extensionFor(entry.mimeType)}` : null
  try {
    if (entry.audio && path) await uploadFile('audio', path, entry.audio, entry.mimeType)
  } catch {
    throw new SongStorageError('upload failed')
  }
  const { data, error } = await supabase
    .from('songs')
    .insert({
      id,
      user_id: uid,
      quiz_id: entry.quizId,
      quiz_title: entry.quizTitle,
      title: entry.title,
      lyrics: entry.lyrics,
      style: entry.style,
      tone: entry.tone,
      provider: entry.provider,
      demo: entry.demo,
      mime_type: entry.mimeType,
      duration_seconds: entry.durationSeconds,
      fact_check_passed: entry.factCheckPassed,
      coverage: (entry.coverage ?? null) as unknown as Json,
      series_part: entry.seriesPart ?? null,
      audio_path: path,
    })
    .select('*')
    .single()
  if (error || !data) {
    if (path) await removeFiles('audio', [path])
    throw new SongStorageError(error?.message ?? 'save failed')
  }
  if (entry.audio) blobCache.set(id, entry.audio)
  return rowToSong(data)
}

async function selectSongs(quizId?: string): Promise<StoredSong[]> {
  const rows: SongRow[] = []
  for (let from = 0; ; from += 500) {
    let query = supabase.from('songs').select('*').order('created_at', { ascending: false })
    if (quizId !== undefined) query = query.eq('quiz_id', quizId)
    const { data, error } = await query.range(from, from + 499)
    if (error) throw new SongStorageError(error.message)
    rows.push(...data)
    if (data.length < 500) break
  }
  return rows.map(rowToSong)
}

export async function getAllSongsRemote(): Promise<StoredSong[]> {
  try {
    return await selectSongs()
  } catch {
    return []
  }
}

export async function getSongsForQuizRemote(quizId: string): Promise<StoredSong[]> {
  try {
    return await selectSongs(quizId)
  } catch {
    return []
  }
}

export async function deleteSongRemote(id: string): Promise<void> {
  const { data } = await supabase.from('songs').select('audio_path').eq('id', id).maybeSingle()
  const { error } = await supabase.from('songs').delete().eq('id', id)
  if (error) return
  blobCache.delete(id)
  if (data?.audio_path) await removeFiles('audio', [data.audio_path])
}

export async function updateSongDurationRemote(id: string, durationSeconds: number): Promise<void> {
  await supabase.from('songs').update({ duration_seconds: durationSeconds }).eq('id', id)
}

export async function getQuizIdsWithSongsRemote(): Promise<Set<string>> {
  const ids = new Set<string>()
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('songs').select('quiz_id').range(from, from + 999)
      if (error) return new Set()
      for (const row of data) ids.add(row.quiz_id)
      if (data.length < 1000) break
    }
  } catch {
    return new Set()
  }
  return ids
}

/** Link the audio element can play; null when the file is missing. */
export async function songPlaybackUrlRemote(song: StoredSong): Promise<string | null> {
  return song.audioPath ? signedUrl('audio', song.audioPath) : null
}

export async function songDownloadUrlRemote(song: StoredSong, filename: string): Promise<string | null> {
  return song.audioPath ? signedUrl('audio', song.audioPath, filename) : null
}

/** The audio bytes (for the undo of a delete and duration checks). */
export async function songBlobRemote(song: StoredSong): Promise<Blob | null> {
  const cached = blobCache.get(song.id)
  if (cached) return cached
  if (!song.audioPath) return null
  const blob = await downloadFile('audio', song.audioPath)
  if (blob) blobCache.set(song.id, blob)
  return blob
}

export function resetSongCache(): void {
  blobCache.clear()
}
