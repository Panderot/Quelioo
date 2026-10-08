/** Pre-made demo content (strings live in `landing.samples.<key>.*`); nothing here ever calls an API. */
export type SampleKey = 'photo' | 'science' | 'history' | 'vocab'

export interface SampleMeta {
  /** Index (0-2) of the correct option of the multiple-choice question. */
  correct: number
  /** The right answer of the true/false statement. */
  tf: boolean
}

export const SAMPLES: Record<SampleKey, SampleMeta> = {
  photo: { correct: 1, tf: true },
  science: { correct: 1, tf: true },
  history: { correct: 1, tf: false },
  vocab: { correct: 2, tf: true },
}

export const TRY_SAMPLES: SampleKey[] = ['science', 'history', 'vocab']
