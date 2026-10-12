import { readFileSync } from 'node:fs'

import { factSimilarity } from '../../src/lib/exam/quality'
import { normalize } from '../../src/lib/exam/text'
import type { WrittenExam } from '../../src/lib/exam/types'

// V5: how much three exams made from one source repeat each other.
// Usage: npx tsx tests/accuracy/exam-variety.ts <folder> run1 run2 run3   (files ../QUELIO-TEST-EXAM/<folder>/<run>.json)

const [folder, ...runs] = process.argv.slice(2)
const exams = runs.map((run) => JSON.parse(readFileSync(`../QUELIO-TEST-EXAM/${folder}/${run}.json`, 'utf8')) as WrittenExam)

function words(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter((word) => word.length >= 4).map((word) => word.slice(0, 5)))
}

function share(a: Set<string>, b: Set<string>): number {
  let same = 0
  for (const word of a) if (b.has(word)) same += 1
  return same / (a.size + b.size - same || 1)
}

const rows: string[] = []
for (let i = 0; i < exams.length; i += 1) {
  for (let j = i + 1; j < exams.length; j += 1) {
    const a = exams[i].questions
    const b = exams[j].questions
    const sharedFacts = a.filter((qa) => b.some((qb) => qa.fact && qb.fact && factSimilarity(qa.fact, qb.fact) >= 0.5)).length
    const nearStems: string[] = []
    for (const qa of a) {
      for (const qb of b) {
        if (qa.type === 'matching' || qb.type === 'matching') continue
        const similarity = share(words(`${qa.context ?? ''} ${qa.stem}`), words(`${qb.context ?? ''} ${qb.stem}`))
        if (similarity >= 0.7) nearStems.push(`${qa.stem.slice(0, 60)} ~ ${qb.stem.slice(0, 60)}`)
      }
    }
    rows.push(`${runs[i]} vs ${runs[j]}: shared facts ${sharedFacts}/${a.length} (${Math.round((100 * sharedFacts) / a.length)} %), near-identical stems ${nearStems.length}${nearStems.length ? ' → ' + nearStems.join(' | ') : ''}`)
  }
}
const perExam = exams.map((exam, index) => `${runs[index]}: ${exam.questions.length} questions, topics ${new Set(exam.questions.map((q) => q.topic)).size}, forms ${new Set(exam.questions.map((q) => `${q.type}:${q.bloomLevel ?? 0}`)).size}`)
console.log([...perExam, ...rows].join('\n'))
