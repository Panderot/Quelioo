import { letterLimit, optionsKeepOrder } from './contentRules'
import type { ExamQuestion } from './types'

/** Moves the correct option of multiple-choice questions so that no letter is the answer too often (A7: at most 40 %), without touching questions whose options keep their order. */
export function balanceMcqLetters(questions: ExamQuestion[], random: () => number = Math.random): ExamQuestion[] {
  const mcq = questions.filter((question) => question.type === 'mcq' && question.options && question.answerIndex !== undefined)
  if (mcq.length < 3) return questions
  const optionCount = Math.max(...mcq.map((question) => question.options?.length ?? 4))
  const limit = letterLimit(mcq.length, optionCount)
  const counts = new Array<number>(optionCount).fill(0)
  for (const question of mcq) counts[question.answerIndex as number] += 1
  if (counts.every((count) => count <= limit)) return questions

  const moved = new Map<string, ExamQuestion>()
  const free = mcq.filter((question) => !optionsKeepOrder(question.options ?? []))
  for (let letter = 0; letter < optionCount; letter += 1) {
    const holders = free.filter((question) => (moved.get(question.id) ?? question).answerIndex === letter)
    // The later questions of an over-used letter move.
    for (const question of holders.slice(Math.max(0, limit - (counts[letter] - holders.length)))) {
      if (counts[letter] <= limit) break
      const room = counts.map((count, index) => ({ index, count })).filter((entry) => entry.index !== letter && entry.index < (question.options?.length ?? 0) && entry.count < limit)
      if (room.length === 0) break
      const lowest = Math.min(...room.map((entry) => entry.count))
      const candidates = room.filter((entry) => entry.count === lowest)
      const target = candidates[Math.floor(random() * candidates.length)].index
      const options = [...(question.options as string[])]
      ;[options[letter], options[target]] = [options[target], options[letter]]
      moved.set(question.id, { ...question, options, answerIndex: target, answer: options[target] })
      counts[letter] -= 1
      counts[target] += 1
    }
  }
  return questions.map((question) => moved.get(question.id) ?? question)
}
