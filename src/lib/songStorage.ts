import { clearAllLocalSongs, deleteSongLocal, getAllSongsLocal, getQuizIdsWithSongsLocal, getSongsForQuizLocal, saveSongLocal, updateSongDurationLocal } from './legacy/songStorageLocal'
import {
  deleteSongRemote,
  getAllSongsRemote,
  getQuizIdsWithSongsRemote,
  getSongsForQuizRemote,
  saveSongRemote,
  songBlobRemote,
  songDownloadUrlRemote,
  songPlaybackUrlRemote,
  updateSongDurationRemote,
} from './remote/songsRemote'
import type { SongCoverageItem, SongProvider, SongStyle, SongTone } from './song'
import { isFakeBackend } from './supabase'

/** Songs live in the account: metadata in Supabase `songs`, the audio in the private `audio` bucket
 * (played and downloaded through short-lived signed URLs). Keyed by quiz id: the archived quiz view's
 * "Listen" section, the Archive row's music icon, and the Songs page (/songs) all read from here,
 * never from the archive entry itself. The UI-logic test build (fake backend) and the one-time
 * import use the original browser-local store (IndexedDB `quelio-songs`). */

export interface StoredSong {
  id: string
  quizId: string
  /** The quiz's own title at save time — kept separately from `title` (the song's title) so the
   * Songs page can still show it after the quiz itself is deleted from the Archive. */
  quizTitle: string
  title: string
  lyrics: string
  style: SongStyle
  tone: SongTone
  provider: SongProvider
  demo: boolean
  mimeType: string
  durationSeconds: number
  /** Whether the fact-check pass was fully satisfied when this song was made — songs saved before
   * this field existed default to true (the feature already blocked known-bad lyrics then too). */
  factCheckPassed: boolean
  createdAt: string
  /** Which lyric line teaches each quiz question; absent on songs made before coverage existed. */
  coverage?: SongCoverageItem[]
  /** 1-based number of this song inside a numbered series (a quiz split over several songs). */
  seriesPart?: number
  /** The audio bytes when this device already holds them (local store, just created); songs listed
   * from the account have null and are played through `getSongPlaybackUrl`. */
  audio: Blob | null
  /** Object path in the `audio` bucket (account songs only). */
  audioPath: string | null
}

export type NewSong = Omit<StoredSong, 'id' | 'createdAt' | 'audioPath'>

/** Saves a new song. Throws if the account store or the upload fails — the caller still has the
 * audio in memory for the current session and shows a localized note. */
export function saveSong(entry: NewSong): Promise<StoredSong> {
  return isFakeBackend ? saveSongLocal(entry) : saveSongRemote(entry)
}

export function getSongsForQuiz(quizId: string): Promise<StoredSong[]> {
  return isFakeBackend ? getSongsForQuizLocal(quizId) : getSongsForQuizRemote(quizId)
}

/** Every song, newest first — backs the Songs page (/songs). */
export function getAllSongs(): Promise<StoredSong[]> {
  return isFakeBackend ? getAllSongsLocal() : getAllSongsRemote()
}

export function deleteSong(id: string): Promise<void> {
  return isFakeBackend ? deleteSongLocal(id) : deleteSongRemote(id)
}

/** Corrects a stored song's duration to the length measured from its audio file. */
export function updateSongDuration(id: string, durationSeconds: number): Promise<void> {
  return isFakeBackend ? updateSongDurationLocal(id, durationSeconds) : updateSongDurationRemote(id, durationSeconds)
}

/** Every quiz id that currently has at least one saved song — used to show the music icon on
 * Archive rows without opening a song for each one. */
export function getQuizIdsWithSongs(): Promise<Set<string>> {
  return isFakeBackend ? getQuizIdsWithSongsLocal() : getQuizIdsWithSongsRemote()
}

/** A URL the audio element can play: an object URL for audio held on this device (the caller revokes
 * `blob:` URLs) or a signed URL for the account copy. Null when the audio is gone. */
export async function getSongPlaybackUrl(song: StoredSong): Promise<string | null> {
  if (song.audio) return URL.createObjectURL(song.audio)
  return songPlaybackUrlRemote(song)
}

/** A URL that saves the audio under `filename`. */
export async function getSongDownloadUrl(song: StoredSong, filename: string): Promise<string | null> {
  if (song.audio) return URL.createObjectURL(song.audio)
  return songDownloadUrlRemote(song, filename)
}

/** The audio bytes of a song (downloaded when it is only in the account). */
export async function getSongBlob(song: StoredSong): Promise<Blob | null> {
  return song.audio ?? songBlobRemote(song)
}

/** Songs still stored in this browser (before the account existed), for the import. */
export function readLegacySongs(): Promise<StoredSong[]> {
  return getAllSongsLocal()
}

export function clearLegacySongs(): Promise<void> {
  return clearAllLocalSongs()
}

/** Songs for the list: songs of one quiz stay together (the quiz with the newest song first) and a
 * numbered series reads in order, Song 1 before Song 2. */
export function orderSongsForList(songs: StoredSong[]): StoredSong[] {
  const newest = new Map<string, string>()
  for (const song of songs) if (song.createdAt > (newest.get(song.quizId) ?? '')) newest.set(song.quizId, song.createdAt)
  return [...songs].sort((a, b) => {
    if (a.quizId !== b.quizId) return (newest.get(b.quizId) ?? '').localeCompare(newest.get(a.quizId) ?? '') || a.quizId.localeCompare(b.quizId)
    const partA = a.seriesPart ?? Number.POSITIVE_INFINITY
    const partB = b.seriesPart ?? Number.POSITIVE_INFINITY
    if (partA !== partB) return partA < partB ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}
