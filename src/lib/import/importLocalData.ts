import { archiveEntryToRow, clearLegacyArchive, loadArchive, readLegacyArchive, sourceTextHash } from '../archive'
import type { ArchiveEntry } from '../archive'
import { clearLegacyFlashcards, readLegacyFlashcards, reloadFlashcards } from '../flashcardStorage'
import type { Card, Deck } from '../flashcardStorage'
import { hashText } from '../hash'
import { SOLUTION_SCHEMA_VERSION, clearLegacySolutions, readLegacySolutions } from '../solutionStorage'
import type { StoredSolution } from '../solutionStorage'
import { clearLegacyLessons, readLegacyLessons, resetLessonCache } from '../lessonStorage'
import type { StoredLesson } from '../lessonStorage'
import { clearLegacySongs, readLegacySongs } from '../songStorage'
import type { StoredSong } from '../songStorage'
import { cardToRow, deckToRow, fetchFlashcards, progressToRow } from '../remote/flashcardsRemote'
import { lessonToRow } from '../remote/lessonsRemote'
import { uploadFile } from '../remote/storageFiles'
import type { Json } from '../database.types'
import { isFakeBackend, supabase } from '../supabase'
import type { InsertRow } from '../supabase'

/** One-time import of the data this browser held before accounts existed (localStorage + IndexedDB)
 * into the signed-in account. Safe to run twice: every imported item gets an id derived from the
 * account and its old id, rows are written with "ignore duplicates", and items the account already
 * holds with identical content are skipped. Nothing local is deleted unless the student agrees after
 * the counts were verified. */

export interface LegacySummary {
  decks: number
  cards: number
  quizzes: number
  songs: number
  solutions: number
  lessons: number
  /** Sum of decks, quizzes, songs, solutions and lessons (cards count inside their decks). */
  total: number
}

type ImportStep = 'decks' | 'quizzes' | 'songs' | 'solutions' | 'lessons' | 'verify'

export interface ImportProgress {
  step: ImportStep
  done: number
  total: number
}

export interface ImportReport {
  ok: boolean
  /** Counts of items now in the account after the import. */
  imported: LegacySummary
  /** Items that were already in the account (exact duplicates) and were skipped. */
  skipped: LegacySummary
  /** Every local item is present in the account. */
  verified: boolean
  error?: string
}

export type ImportState = 'none' | 'imported' | 'declined'

const STATE_KEY = 'quelio.importState.v1'
const CHUNK = 200

const emptySummary = (): LegacySummary => ({ decks: 0, cards: 0, quizzes: 0, songs: 0, solutions: 0, lessons: 0, total: 0 })
const withTotal = (summary: LegacySummary): LegacySummary => ({ ...summary, total: summary.decks + summary.quizzes + summary.songs + summary.solutions + summary.lessons })

interface LegacySnapshot {
  archive: ArchiveEntry[]
  decks: Deck[]
  cards: Card[]
  songs: StoredSong[]
  solutions: StoredSolution[]
  lessons: StoredLesson[]
  plans: Awaited<ReturnType<typeof readLegacyLessons>>['plans']
  segments: Awaited<ReturnType<typeof readLegacyLessons>>['segments']
}

async function readSnapshot(): Promise<LegacySnapshot> {
  const [{ decks, cards }, songs, solutions, lessonData] = await Promise.all([readLegacyFlashcards(), readLegacySongs(), readLegacySolutions(), readLegacyLessons()])
  return { archive: readLegacyArchive(), decks, cards, songs, solutions, lessons: lessonData.lessons, plans: lessonData.plans, segments: lessonData.segments }
}

function summarize(snapshot: LegacySnapshot): LegacySummary {
  return withTotal({
    decks: snapshot.decks.length,
    cards: snapshot.cards.length,
    quizzes: snapshot.archive.length,
    songs: snapshot.songs.length,
    solutions: snapshot.solutions.length,
    lessons: snapshot.lessons.length,
    total: 0,
  })
}

/** What this device still holds from before accounts. */
export async function detectLegacyData(): Promise<LegacySummary> {
  if (isFakeBackend) return emptySummary()
  try {
    return summarize(await readSnapshot())
  } catch {
    return emptySummary()
  }
}

// ---------------------------------------------------------------------------
// Ids and duplicate signatures
// ---------------------------------------------------------------------------

/** A UUID (version 5 layout) derived from the account and the old id: the same input always gives the same id. */
async function derivedId(userId: string, kind: string, legacyId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`quelio-import:${userId}:${kind}:${legacyId}`))).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const deckSignature = (deck: Pick<Deck, 'name' | 'description' | 'language'>, cards: Pick<Card, 'front' | 'back'>[]) =>
  hashText(JSON.stringify([deck.name, deck.description, deck.language, cards.map((card) => [card.front, card.back]).sort()]))
const quizSignature = (entry: Pick<ArchiveEntry, 'title' | 'createdAt' | 'quiz'>) => hashText(JSON.stringify([entry.title, new Date(entry.createdAt).toISOString(), entry.quiz.questions]))
const songSignature = (song: Pick<StoredSong, 'title' | 'lyrics' | 'style' | 'createdAt'>) => hashText(JSON.stringify([song.title, song.lyrics, song.style, new Date(song.createdAt).toISOString()]))
const solutionSignature = (solution: Pick<StoredSolution, 'createdAt' | 'result'>) => hashText(JSON.stringify([new Date(solution.createdAt).toISOString(), solution.result.question, solution.result.answer]))
const lessonSignature = (lesson: Pick<StoredLesson, 'createdAt' | 'title' | 'sourceHash'>) => hashText(JSON.stringify([new Date(lesson.createdAt).toISOString(), lesson.title, lesson.sourceHash]))

class ImportError extends Error {}

type Table = 'decks' | 'cards' | 'card_progress' | 'quizzes' | 'songs' | 'solves' | 'lessons' | 'lesson_plans' | 'lesson_segments'

async function insertRows(table: Table, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  const target = supabase.from(table) as unknown as { upsert: (rows: Record<string, unknown>[], options: { onConflict: string; ignoreDuplicates: boolean }) => PromiseLike<{ error: { message: string } | null }> }
  for (let index = 0; index < rows.length; index += CHUNK) {
    const { error } = await target.upsert(rows.slice(index, index + CHUNK), { onConflict, ignoreDuplicates: true })
    if (error) throw new ImportError(`${table}: ${error.message}`)
  }
}

/** How many of these ids exist in the account's table. */
async function countPresent(table: 'decks' | 'cards' | 'quizzes' | 'songs' | 'solves' | 'lessons', ids: string[]): Promise<number> {
  let present = 0
  for (let index = 0; index < ids.length; index += CHUNK) {
    const { data, error } = await supabase.from(table).select('id').in('id', ids.slice(index, index + CHUNK))
    if (error) throw new ImportError(`${table}: ${error.message}`)
    present += data.length
  }
  return present
}

export async function runImport(userId: string, onProgress?: (progress: ImportProgress) => void): Promise<ImportReport> {
  const imported = emptySummary()
  const skipped = emptySummary()
  if (isFakeBackend) return { ok: true, imported, skipped, verified: true }
  try {
    const snapshot = await readSnapshot()
    const idMaps = { quiz: new Map<string, string>(), solution: new Map<string, string>() }
    const verifyIds = { decks: [] as string[], cards: [] as string[], quizzes: [] as string[], songs: [] as string[], solves: [] as string[], lessons: [] as string[] }

    // --- quizzes --------------------------------------------------------------------------
    onProgress?.({ step: 'quizzes', done: 0, total: snapshot.archive.length })
    await loadArchive(true)
    const { data: existingQuizzes, error: quizError } = await supabase.from('quizzes').select('id, title, created_at, quiz')
    if (quizError) throw new ImportError(`quizzes: ${quizError.message}`)
    const existingQuizSignatures = new Set(existingQuizzes.map((row) => quizSignature({ title: row.title, createdAt: row.created_at, quiz: row.quiz as unknown as ArchiveEntry['quiz'] })))
    const quizRows: InsertRow<'quizzes'>[] = []
    for (const [index, entry] of snapshot.archive.entries()) {
      const newId = await derivedId(userId, 'quiz', entry.id)
      idMaps.quiz.set(entry.id, newId)
      imported.quizzes += 1
      if (existingQuizSignatures.has(quizSignature(entry)) && !existingQuizzes.some((row) => row.id === newId)) {
        skipped.quizzes += 1
        // Songs of this quiz point at the quiz already in the account.
        const match = existingQuizzes.find((row) => quizSignature({ title: row.title, createdAt: row.created_at, quiz: row.quiz as unknown as ArchiveEntry['quiz'] }) === quizSignature(entry))
        if (match) idMaps.quiz.set(entry.id, match.id)
      } else {
        verifyIds.quizzes.push(newId)
        quizRows.push({ ...archiveEntryToRow({ ...entry, id: newId, sourceHash: entry.sourceHash ?? (entry.sourceText ? sourceTextHash(entry.sourceText) : undefined) }, userId) })
      }
      onProgress?.({ step: 'quizzes', done: index + 1, total: snapshot.archive.length })
    }
    await insertRows('quizzes', quizRows, 'id')

    // --- decks and cards ------------------------------------------------------------------
    onProgress?.({ step: 'decks', done: 0, total: snapshot.decks.length })
    const account = await fetchFlashcards()
    if (!account) throw new ImportError('decks: could not read the account')
    const existingDeckSignatures = new Set(
      account.decks.map((deck) => deckSignature({ name: deck.name ?? '', description: deck.description ?? '', language: deck.language ?? 'en' }, account.cards.filter((card) => card.deckId === deck.id).map((card) => ({ front: card.front ?? '', back: card.back ?? '' })))),
    )
    const deckRows: InsertRow<'decks'>[] = []
    const cardRows: InsertRow<'cards'>[] = []
    const progressRows: InsertRow<'card_progress'>[] = []
    const quizIdFor = async (legacyId: string) => idMaps.quiz.get(legacyId) ?? (await derivedId(userId, 'quiz', legacyId))
    for (const [index, deck] of snapshot.decks.entries()) {
      const deckCards = snapshot.cards.filter((card) => card.deckId === deck.id)
      const newId = await derivedId(userId, 'deck', deck.id)
      imported.decks += 1
      imported.cards += deckCards.length
      if (existingDeckSignatures.has(deckSignature(deck, deckCards)) && !account.decks.some((existing) => existing.id === newId)) {
        skipped.decks += 1
        skipped.cards += deckCards.length
        onProgress?.({ step: 'decks', done: index + 1, total: snapshot.decks.length })
        continue
      }
      verifyIds.decks.push(newId)
      const sourceRef = deck.sourceRef && snapshot.archive.some((entry) => entry.id === deck.sourceRef) ? await quizIdFor(deck.sourceRef) : deck.sourceRef
      deckRows.push(deckToRow({ ...deck, id: newId, sourceRef }, userId))
      for (const card of deckCards) {
        const cardId = await derivedId(userId, 'card', card.id)
        const migrated = { ...card, id: cardId, deckId: newId }
        verifyIds.cards.push(cardId)
        cardRows.push(cardToRow(migrated, userId))
        progressRows.push(progressToRow(migrated, userId))
      }
      onProgress?.({ step: 'decks', done: index + 1, total: snapshot.decks.length })
    }
    await insertRows('decks', deckRows, 'id')
    await insertRows('cards', cardRows, 'id')
    await insertRows('card_progress', progressRows, 'card_id')

    // --- songs ----------------------------------------------------------------------------
    onProgress?.({ step: 'songs', done: 0, total: snapshot.songs.length })
    const { data: existingSongs, error: songError } = await supabase.from('songs').select('id, title, lyrics, style, created_at')
    if (songError) throw new ImportError(`songs: ${songError.message}`)
    const existingSongSignatures = new Set(existingSongs.map((row) => songSignature({ title: row.title, lyrics: row.lyrics, style: row.style as StoredSong['style'], createdAt: row.created_at })))
    for (const [index, song] of snapshot.songs.entries()) {
      const newId = await derivedId(userId, 'song', song.id)
      imported.songs += 1
      if (existingSongSignatures.has(songSignature(song)) && !existingSongs.some((row) => row.id === newId)) {
        skipped.songs += 1
        onProgress?.({ step: 'songs', done: index + 1, total: snapshot.songs.length })
        continue
      }
      verifyIds.songs.push(newId)
      const ext = song.mimeType.includes('wav') ? 'wav' : song.mimeType.includes('mpeg') || song.mimeType.includes('mp3') ? 'mp3' : 'audio'
      const path = song.audio ? `${userId}/songs/${newId}.${ext}` : null
      if (song.audio && path) {
        await uploadFile('audio', path, song.audio, song.mimeType)
      }
      await insertRows(
        'songs',
        [
          {
            id: newId,
            user_id: userId,
            quiz_id: idMaps.quiz.get(song.quizId) ?? song.quizId,
            quiz_title: song.quizTitle,
            title: song.title,
            lyrics: song.lyrics,
            style: song.style,
            tone: song.tone,
            provider: song.provider,
            demo: song.demo,
            mime_type: song.mimeType,
            duration_seconds: song.durationSeconds,
            fact_check_passed: song.factCheckPassed,
            coverage: (song.coverage ?? null) as unknown as Json,
            series_part: song.seriesPart ?? null,
            audio_path: path,
            created_at: song.createdAt,
          } satisfies InsertRow<'songs'>,
        ],
        'id',
      )
      onProgress?.({ step: 'songs', done: index + 1, total: snapshot.songs.length })
    }

    // --- solutions ------------------------------------------------------------------------
    onProgress?.({ step: 'solutions', done: 0, total: snapshot.solutions.length })
    const { data: existingSolves, error: solveError } = await supabase.from('solves').select('id, created_at, result')
    if (solveError) throw new ImportError(`solves: ${solveError.message}`)
    const existingSolveSignatures = new Set(existingSolves.map((row) => solutionSignature({ createdAt: row.created_at, result: row.result as unknown as StoredSolution['result'] })))
    for (const [index, solution] of snapshot.solutions.entries()) {
      const newId = await derivedId(userId, 'solution', solution.id)
      idMaps.solution.set(solution.id, newId)
      imported.solutions += 1
      if (existingSolveSignatures.has(solutionSignature(solution)) && !existingSolves.some((row) => row.id === newId)) {
        skipped.solutions += 1
        onProgress?.({ step: 'solutions', done: index + 1, total: snapshot.solutions.length })
        continue
      }
      verifyIds.solves.push(newId)
      const path = solution.thumbnail ? `${userId}/solves/${newId}.jpg` : null
      if (solution.thumbnail && path) {
        await uploadFile('uploads', path, solution.thumbnail, 'image/jpeg')
      }
      await insertRows(
        'solves',
        [
          {
            id: newId,
            user_id: userId,
            language: solution.language,
            schema_version: SOLUTION_SCHEMA_VERSION,
            result: solution.result as unknown as Json,
            extras: solution.extras as unknown as Json,
            thumbnail_path: path,
            created_at: solution.createdAt,
          } satisfies InsertRow<'solves'>,
        ],
        'id',
      )
      onProgress?.({ step: 'solutions', done: index + 1, total: snapshot.solutions.length })
    }

    // --- lessons (with their cached plans and recorded lines) --------------------------------
    const lessonWork = snapshot.lessons.length + snapshot.plans.length + snapshot.segments.length
    onProgress?.({ step: 'lessons', done: 0, total: lessonWork })
    const { data: existingLessons, error: lessonError } = await supabase.from('lessons').select('id, created_at, title, source_hash')
    if (lessonError) throw new ImportError(`lessons: ${lessonError.message}`)
    const existingLessonSignatures = new Set(existingLessons.map((row) => lessonSignature({ createdAt: row.created_at, title: row.title, sourceHash: row.source_hash })))
    const lessonRows: InsertRow<'lessons'>[] = []
    for (const lesson of snapshot.lessons) {
      const newId = await derivedId(userId, 'lesson', lesson.id)
      imported.lessons += 1
      if (existingLessonSignatures.has(lessonSignature(lesson)) && !existingLessons.some((row) => row.id === newId)) {
        skipped.lessons += 1
        continue
      }
      verifyIds.lessons.push(newId)
      lessonRows.push(lessonToRow({ ...lesson, id: newId }, userId))
    }
    await insertRows('lessons', lessonRows, 'id')
    await insertRows(
      'lesson_plans',
      snapshot.plans.map((plan) => ({ user_id: userId, key: plan.key, title: plan.title.slice(0, 300), key_points: plan.keyPoints as unknown as Json, episodes: plan.episodes as unknown as Json })),
      'user_id,key',
    )
    let done = snapshot.lessons.length + snapshot.plans.length
    onProgress?.({ step: 'lessons', done, total: lessonWork })
    for (const segment of snapshot.segments) {
      const path = `${userId}/segments/${segment.key}.mp3`
      await uploadFile('audio', path, segment.audio, 'audio/mpeg')
      await insertRows('lesson_segments', [{ user_id: userId, key: segment.key, audio_path: path, duration_seconds: segment.durationSeconds, created_at: segment.createdAt || new Date().toISOString() }], 'user_id,key')
      done += 1
      onProgress?.({ step: 'lessons', done, total: lessonWork })
    }

    // --- verify -----------------------------------------------------------------------------
    onProgress?.({ step: 'verify', done: 0, total: 1 })
    const checks: [Parameters<typeof countPresent>[0], string[]][] = [
      ['decks', verifyIds.decks],
      ['cards', verifyIds.cards],
      ['quizzes', verifyIds.quizzes],
      ['songs', verifyIds.songs],
      ['solves', verifyIds.solves],
      ['lessons', verifyIds.lessons],
    ]
    let verified = true
    for (const [table, ids] of checks) if ((await countPresent(table, ids)) !== ids.length) verified = false
    onProgress?.({ step: 'verify', done: 1, total: 1 })

    // The screens read the account again, so what was imported shows up at once.
    void loadArchive(true)
    reloadFlashcards()
    resetLessonCache()
    if (verified) setImportState(userId, 'imported')
    return { ok: true, imported: withTotal(imported), skipped: withTotal(skipped), verified }
  } catch (error) {
    // Files uploaded before the failure stay where they are; a repeat run reuses the same paths.
    return { ok: false, imported: withTotal(imported), skipped: withTotal(skipped), verified: false, error: error instanceof Error ? error.message : 'import failed' }
  }
}

/** Empties the browser-local stores — only called after a verified import, when the student says so. */
export async function clearLegacyData(): Promise<void> {
  clearLegacyArchive()
  await Promise.all([clearLegacyFlashcards(), clearLegacySongs(), clearLegacySolutions(), clearLegacyLessons()])
}

function readStates(): Record<string, ImportState> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, ImportState>) : {}
  } catch {
    return {}
  }
}

export function getImportState(userId: string): ImportState {
  const state = readStates()[userId]
  return state === 'imported' || state === 'declined' ? state : 'none'
}

export function setImportState(userId: string, state: ImportState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...readStates(), [userId]: state }))
  } catch {
    // Storage unavailable: the dialog may be offered again, and a repeat import is safe.
  }
}
