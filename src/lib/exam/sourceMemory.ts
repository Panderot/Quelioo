import { normalize } from './text'
import type { ExamQuestion, SourceMemory } from './types'

/** V1: what an exam remembers about its source (a hash and a similarity signature, never the text) and which facts and forms it used,
 * so the next exam from the same or a very similar source can avoid them. */

const SIGNATURE_SIZE = 32
const SHINGLE_WORDS = 3
/** Two sources count as "the same" when at least this share of their signatures agree (about 60 % of their word triples). */
export const SAME_SOURCE_SIMILARITY = 0.55
/** The teacher's last exams from one source that are looked at. */
export const MEMORY_EXAMS = 5
const MEMORY_STEM_CHARS = 200

/** 32-bit FNV-1a with a seed (cheap and good enough for a similarity signature). */
function fnv(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export function normalizeSource(text: string): string {
  return normalize(text)
}

/** Hash of the normalised text, as hex. */
export function sourceHash(text: string): string {
  const normalized = normalizeSource(text)
  return `${fnv(normalized, 1).toString(16)}${fnv(normalized, 2).toString(16)}${normalized.length.toString(16)}`
}

/** MinHash of the word triples: texts that share most triples share most signature values. */
export function sourceSignature(text: string): number[] {
  const words = normalizeSource(text).split(' ').filter(Boolean)
  const shingles = new Set<string>()
  for (let i = 0; i + SHINGLE_WORDS <= words.length; i += 1) shingles.add(words.slice(i, i + SHINGLE_WORDS).join(' '))
  if (shingles.size === 0) for (const word of words) shingles.add(word)
  const signature = new Array<number>(SIGNATURE_SIZE).fill(0xffffffff)
  for (const shingle of shingles) {
    for (let k = 0; k < SIGNATURE_SIZE; k += 1) {
      const value = fnv(shingle, k + 17)
      if (value < signature[k]) signature[k] = value
    }
  }
  return signature
}

export function signatureSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let same = 0
  for (let i = 0; i < a.length; i += 1) if (a[i] === b[i]) same += 1
  return same / a.length
}

/** The facts and forms ("type:bloom") a finished exam used, with its source's fingerprint. */
export function buildMemory(text: string, questions: ExamQuestion[]): SourceMemory {
  const used = questions.filter((question) => question.fact)
  return {
    hash: sourceHash(text),
    signature: sourceSignature(text),
    facts: used.map((question) => (question.fact as string).slice(0, 300)),
    forms: used.map((question) => `${question.type}:${question.bloomLevel ?? 0}`),
    stems: used.map((question) => question.stem.slice(0, MEMORY_STEM_CHARS)),
  }
}

export interface StoredMemory {
  id: string
  createdAt: string
  memory: SourceMemory
}

/** The memories of the teacher's last exams made from the same or a very similar source, newest first. */
export function memoriesForSource(text: string, stored: StoredMemory[]): StoredMemory[] {
  const hash = sourceHash(text)
  const signature = sourceSignature(text)
  return stored
    .filter((entry) => entry.memory.hash === hash || signatureSimilarity(signature, entry.memory.signature) >= SAME_SOURCE_SIMILARITY)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MEMORY_EXAMS)
}

/** Facts and forms of those exams, in the shape the planner takes. */
export function earlierFromMemories(memories: StoredMemory[]): { fact: string; form: string; stem?: string }[] {
  const earlier: { fact: string; form: string; stem?: string }[] = []
  for (const { memory } of memories) memory.facts.forEach((fact, index) => earlier.push({ fact, form: memory.forms[index] ?? '', ...(memory.stems?.[index] ? { stem: memory.stems[index] } : {}) }))
  return earlier
}
