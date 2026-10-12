import { expect, test } from '@playwright/test'

import { buildMemory, earlierFromMemories, memoriesForSource, signatureSimilarity, sourceHash, sourceSignature } from '../../src/lib/exam/sourceMemory'
import type { StoredMemory } from '../../src/lib/exam/sourceMemory'
import { scenarioVariety } from '../../src/lib/exam/variety'
import type { ExamQuestion } from '../../src/lib/exam/types'

// V1 and V2: a source's fingerprint (never the text), what an exam used, and varied scenarios.

const SENTENCES = [
  'Hücre, canlıların yapı ve görev bakımından en küçük birimidir.',
  'Robert Hooke 1665 yılında mantar dokusunu mikroskopla inceleyerek hücreyi keşfetti.',
  'Hücre zarı seçici geçirgendir ve hücreye giren çıkan maddeleri denetler.',
  'Mitokondri hücresel solunumla ATP üretir ve hücrenin enerji santrali olarak bilinir.',
  'Kloroplast yalnızca bitki hücrelerinde bulunur ve fotosentezin yapıldığı organeldir.',
  'Ribozomlar protein sentezinin yapıldığı küçük yapılardır ve zarsızdır.',
  'Golgi aygıtı salgı maddelerini paketler ve hücre dışına gönderir.',
  'Lizozom, hücre içi sindirimi sağlayan sindirim enzimleri taşır.',
  'Prokaryot hücrelerde çekirdek zarı yoktur, genetik madde sitoplazmada bulunur.',
  'Ökaryot hücrelerde zarlı organeller ve gerçek bir çekirdek vardır.',
  'Koful, bitki hücrelerinde su ve çeşitli maddeleri depolayan büyük bir organeldir.',
  'Hücre duvarı selülozdan yapılmıştır ve bitki hücresine şekil verir.',
]
const SOURCE = SENTENCES.join(' ')

function question(fact: string, type: ExamQuestion['type'] = 'mcq', bloomLevel?: ExamQuestion['bloomLevel']): ExamQuestion {
  return { id: `m-${fact}`, type, stem: 'Soru?', answer: 'x', rubric: [], points: 0, topic: 'T', difficulty: 'medium', lines: 0, fact, ...(bloomLevel ? { bloomLevel } : {}) }
}

test.describe('V1: the fingerprint of a source', () => {
  test('the hash ignores case, spacing and punctuation and never contains the text', () => {
    expect(sourceHash(SOURCE)).toBe(sourceHash(`  ${SOURCE.toLocaleUpperCase('tr-TR').replace(/\./g, ' .')}  `))
    expect(sourceHash(SOURCE)).not.toBe(sourceHash(`${SOURCE} Ek cümle burada.`))
    const memory = buildMemory(SOURCE, [question('olgu bir')])
    expect(JSON.stringify(memory)).not.toContain('Mitokondri')
    expect(JSON.stringify(memory)).not.toContain('Robert')
  })

  test('a very similar source (one sentence changed) is recognised, an unrelated one is not', () => {
    const edited = [...SENTENCES.slice(0, 11), 'Koful hücrede su depolayan organeldir.'].join(' ')
    const other = 'Osmanlı Devleti 1299 yılında Söğüt çevresinde kuruldu. Osman Bey beyliği genişletti ve Bursa 1326 yılında alındı. Rumeli’ye geçiş Çimpe Kalesi ile başladı.'.repeat(4)
    expect(signatureSimilarity(sourceSignature(SOURCE), sourceSignature(edited))).toBeGreaterThan(0.55)
    expect(signatureSimilarity(sourceSignature(SOURCE), sourceSignature(other))).toBeLessThan(0.2)
  })

  test('the last five exams from the same source are used, newest first, and other sources are ignored', () => {
    const stored: StoredMemory[] = Array.from({ length: 7 }, (_, index) => ({ id: `e${index}`, createdAt: `2026-10-0${index + 1}T10:00:00Z`, memory: buildMemory(SOURCE, [question(`olgu ${index}`, 'mcq', 2)]) }))
    stored.push({ id: 'x', createdAt: '2026-10-09T10:00:00Z', memory: buildMemory('Tamamen başka bir konu hakkında yazılmış uzun bir metin. '.repeat(10), [question('başka olgu')]) })
    const found = memoriesForSource(SOURCE, stored)
    expect(found.map((entry) => entry.id)).toEqual(['e6', 'e5', 'e4', 'e3', 'e2'])
    expect(earlierFromMemories(found)[0]).toEqual({ fact: 'olgu 6', form: 'mcq:2' })
  })
})

test.describe('V2: scenarios vary', () => {
  test('settings and names inside one call never repeat, and differ from call to call', () => {
    const first = scenarioVariety('tr', 4)
    expect(new Set(first).size).toBe(4)
    expect(new Set(first.map((entry) => entry.split('; person: ')[0])).size).toBe(4)
    let different = false
    for (let i = 0; i < 5; i += 1) if (scenarioVariety('tr', 4).join() !== first.join()) different = true
    expect(different).toBe(true)
  })

  test('Turkish exams get Turkish settings, other languages English ones', () => {
    expect(scenarioVariety('tr', 2, () => 0)).toEqual(['setting: okul laboratuvarı; person: Ayşe', 'setting: mahalle pazarı; person: Burak'])
    expect(scenarioVariety('en', 2, () => 0)).toEqual(['setting: a school laboratory; person: Maya', 'setting: a farmers market; person: Liam'])
    expect(scenarioVariety('hyw', 1, () => 0)[0]).toContain('a school laboratory')
  })
})
