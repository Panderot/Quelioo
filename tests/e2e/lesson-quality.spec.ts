import { expect, test } from '@playwright/test'

import { handleLessonRequest, keyPointsFromFacts, tidyPauses } from '../../api/_lib/lesson'
import { LESSON_SPEAKERS, keyPointDisplay } from '../../src/lib/lesson'
import type { ScriptSection } from '../../src/lib/lesson'
import { LESSON_VOICES, MIN_SPEAKER_PITCH_GAP_HZ, lineInstruction, resolveVoices, segmentKey, voiceGender } from '../../src/lib/lessonAudio'
import { auditScript, auditSpeakers, duplicateSegments, longSilenceShare } from '../../src/lib/lessonAudit'
import { medianPitchHz } from '../../src/lib/pitch'
import { glidePcm, glideSamples } from '../fixtures/tinyPcm'

// Audio Lesson quality rules, tested without a browser and without real AI or real voices: the voice of a speaker stays in
// its register in every line, no copied "think" clip, a plan without internal labels, and the lesson audit itself.

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch
test.afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in ORIGINAL_ENV)) delete process.env[key]
  Object.assign(process.env, ORIGINAL_ENV)
  globalThis.fetch = ORIGINAL_FETCH
})

let ipCounter = 0
const nextIp = () => `10.2.0.${++ipCounter}`

function sections(spec: { role: ScriptSection['role']; lines: [string, string, boolean?][] }[]): ScriptSection[] {
  let n = 0
  return spec.map((section, index) => ({
    id: `p1-S${index + 1}`,
    role: section.role,
    title: section.role,
    keyPointIds: [],
    lines: section.lines.map(([speaker, text, pause]) => ({ id: `p1-L${++n}`, speaker, text, ...(pause ? { pause: true } : {}) })),
  }))
}

test.describe('voices: one fixed voice per speaker, a woman and a man', () => {
  test('two-speaker lessons always get one woman and one man, whatever was stored or chosen', () => {
    for (const style of ['two_hosts', 'teacher_student'] as const) {
      const speakers = LESSON_SPEAKERS[style]
      for (const stored of [undefined, {}, { [speakers[0]]: 'cedar', [speakers[1]]: 'cedar' }, { [speakers[0]]: 'marin', [speakers[1]]: 'coral' }, { [speakers[0]]: 'ash', [speakers[1]]: 'onyx' }]) {
        const voices = resolveVoices(speakers, stored)
        expect(new Set(speakers.map((speaker) => voiceGender(voices[speaker]))), `${style} ${JSON.stringify(stored)}`).toEqual(new Set(['f', 'm']))
      }
    }
    // The speaker the student just chose keeps the voice; the other one changes gender.
    const kept = resolveVoices(LESSON_SPEAKERS.two_hosts, { hostA: 'marin', hostB: 'coral' }, 'hostB')
    expect(kept.hostB).toBe('coral')
    expect(voiceGender(kept.hostA)).toBe('m')
    // A voice that sounded like both genders in real recordings is never offered.
    expect([...LESSON_VOICES.f, ...LESSON_VOICES.m]).not.toContain('cedar')
    expect(resolveVoices(['narrator'], { narrator: 'cedar' }).narrator).toBe('marin')
    expect(resolveVoices(['narrator'], { narrator: 'onyx' }).narrator).toBe('onyx')
  })

  test('the voice identity in the instruction is the same for every line of a speaker; only pace and energy change', () => {
    const voice = 'ash'
    const base = (delivery?: 'warm' | 'surprised' | 'playful') => lineInstruction({ speaker: 'hostB', text: 'Peki bu nasıl olur?', delivery }, 'tr', voice)
    for (const delivery of [undefined, 'warm', 'surprised', 'playful'] as const) {
      expect(base(delivery)).toContain('a man with a deep, low-pitched voice')
      expect(base(delivery)).toContain('Never sound like a woman')
    }
    expect(lineInstruction({ speaker: 'hostA', text: 'Evet.' }, 'tr', 'marin')).toContain('Never sound like a man')
    // A recording made with the old instruction is not reused for the new voice.
    expect(segmentKey({ speaker: 'hostB', text: 'Evet.' }, 'ash', 'tr')).not.toBe(segmentKey({ speaker: 'hostB', text: 'Evet.' }, 'echo', 'tr'))
  })

  test('median pitch of a line is measured, a man and a woman are far apart', () => {
    expect(medianPitchHz(glideSamples(2, 115, 115), 24000)!).toBeGreaterThan(105)
    expect(medianPitchHz(glideSamples(2, 115, 115), 24000)!).toBeLessThan(125)
    expect(medianPitchHz(glideSamples(2, 195, 195), 24000)!).toBeGreaterThan(185)
    expect(medianPitchHz(glideSamples(0.1, 115, 115), 24000)).toBeNull()
  })

  /** Stubs the speech endpoint: each call answers with a tone at the pitch `plan` decides for (voice, call number of that line). */
  function stubVoices(plan: (voice: string, text: string, take: number) => number) {
    const takes = new Map<string, number>()
    const calls: { voice: string; text: string; instructions: string }[] = []
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.VERCEL_ENV
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { voice: string; input: string; instructions: string }
      const take = (takes.get(body.input) ?? 0) + 1
      takes.set(body.input, take)
      calls.push({ voice: body.voice, text: body.input, instructions: body.instructions })
      const hz = plan(body.voice, body.input, take)
      const pcm = glidePcm(2.4, hz, hz)
      const events = [
        { type: 'speech.audio.delta', audio: Buffer.from(pcm).toString('base64') },
        { type: 'speech.audio.done', usage: { input_tokens: 20, output_tokens: 60 } },
      ]
      return new Response([...events.map((event) => `data: ${JSON.stringify(event)}`), 'data: [DONE]'].join('\n\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch
    return calls
  }

  const LESSON_LINES = Array.from({ length: 6 }, (_, i) => ({ id: `L${i}`, speaker: i % 2 === 0 ? 'hostA' : 'hostB', text: `Satır numarası ${['bir', 'iki', 'üç', 'dört', 'beş', 'altı'][i]} burada.` }))
  const payload = (lines: typeof LESSON_LINES, voices?: Record<string, string>) => ({ action: 'speak', lessonKey: `k${nextIp()}`, style: 'two_hosts', language: 'tr', voices, lines })

  type Spoken = { segments: { id: string; pitchHz: number | null }[]; usage: { costUsd: number } }
  const audit = (segments: Spoken['segments'], voices: Record<string, string>) =>
    auditSpeakers(segments.map((segment) => ({ id: segment.id, speaker: LESSON_LINES.find((line) => line.id === segment.id)!.speaker, gender: voiceGender(voices[LESSON_LINES.find((line) => line.id === segment.id)!.speaker])!, pitchHz: segment.pitchHz })))

  test('a line that comes back in the other register is spoken again; every line ends up in its speaker\'s register', async () => {
    // The man's first take of lines two and four sounds like a woman (the real "Host A is sometimes female" failure, mirrored).
    const calls = stubVoices((voice, text, take) => (voice === 'ash' ? (/iki|dört/.test(text) && take === 1 ? 190 : 115) : /üç/.test(text) && take === 1 ? 118 : 195))
    const voices = { hostA: 'marin', hostB: 'ash' }
    const { status, body } = await handleLessonRequest(payload(LESSON_LINES, voices), { ip: nextIp() })
    expect(status).toBe(200)
    const result = body as Spoken
    const report = audit(result.segments, voices)
    expect(report.offRegister).toEqual([])
    expect(report.gapHz).toBeGreaterThanOrEqual(MIN_SPEAKER_PITCH_GAP_HZ)
    expect(calls.length).toBe(6 + 3) // three lines were spoken once more
    expect(calls.filter((call) => /clearly deeper/.test(call.instructions)).length).toBe(2)
    expect(calls.filter((call) => /clearly higher/.test(call.instructions)).length).toBe(1)
    // The same voice is used for a speaker in every call.
    expect(new Set(calls.filter((call) => /Satır numarası (iki|dört|altı)/.test(call.text)).map((call) => call.voice))).toEqual(new Set(['ash']))
  })

  test('a line that never gets into register is reported by the audit (red), the other lines pass', async () => {
    stubVoices((voice, text) => (voice === 'ash' && /dört/.test(text) ? 195 : voice === 'ash' ? 115 : 195))
    const voices = { hostA: 'marin', hostB: 'ash' }
    const { body } = await handleLessonRequest(payload(LESSON_LINES, voices), { ip: nextIp() })
    const report = audit((body as Spoken).segments, voices)
    expect(report.offRegister).toEqual(['L3'])
    expect(report.issues.join(' ')).toContain('register')
  })

  test('two voices of one gender are never sent: the second speaker gets the other gender', async () => {
    const calls = stubVoices((voice) => (voiceGender(voice) === 'm' ? 115 : 195))
    await handleLessonRequest(payload(LESSON_LINES.slice(0, 2), { hostA: 'cedar', hostB: 'cedar' }), { ip: nextIp() })
    expect(new Set(calls.map((call) => voiceGender(call.voice)))).toEqual(new Set(['f', 'm']))
  })
})

test.describe('listener pauses: a flag on a question, a few per lesson, never a copied "think" clip', () => {
  // The shape of the real 14 October lesson: after almost every question a separate "Bir an düşün..." line.
  const copied = () =>
    sections([
      { role: 'opening', lines: [['hostA', 'Bir yaprak neden yeşil?', false], ['hostB', 'Bir an düşün...', true], ['hostA', 'Klorofil yüzünden.'], ['hostB', 'Klorofil ne yapar?'], ['hostB', 'Bir an düşün...', true]] },
      {
        role: 'teach',
        lines: [
          ['hostA', 'Klorofil kırmızı ve mavi ışığı soğurur ve bu enerjiyle şeker yapılır, yeşil ise geri yansır.'],
          ['hostB', 'Peki su ve karbondioksit ne işe yarar?'],
          ['hostB', 'Bir an düşün...', true],
          ['hostA', 'Şeker yapmak için hammadde olurlar ve yaprağın içinde birleşirler.'],
          ['hostA', 'Oksijen nereden çıkar?'],
          ['hostA', 'Bir an düşün...', true],
          ['hostB', 'Sudan, ve yaprağın gözeneklerinden havaya karışır, bu yüzden ormanda nefes almak kolaydır.'],
          ['hostA', 'Işık olmazsa ne olur?'],
          ['hostB', 'Bir an düşün...', true],
          ['hostA', 'Bitki şeker üretemez ve zamanla zayıf düşer, bu yüzden bitkiler pencere kenarını sever.'],
          ['hostB', 'Bu iş yaprağın neresinde olur?'],
          ['hostB', 'Bir an düşün...', true],
          ['hostA', 'Kloroplastların içinde olur, yani yaprağın hücrelerindeki küçük yeşil fabrikalarda.'],
        ],
      },
      { role: 'selfcheck', lines: [['hostA', 'Bitki ışığı ne için kullanır?'], ['hostB', 'Bir an düşün...', true], ['hostA', 'Şeker yapmak için.']] },
    ])

  test('the old shape fails the audit (red): copied lines, a pause after every question, one in the first seconds', () => {
    const report = auditScript(copied(), 'tr')
    expect(report.fixedPhraseLines.length).toBeGreaterThanOrEqual(6)
    expect(report.issues.length).toBeGreaterThan(0)
  })

  test('tidying removes every fixed phrase, keeps at most a third of the questions with a pause, none in the first 20 seconds', () => {
    const script = copied()
    tidyPauses(script, 'tr')
    const report = auditScript(script, 'tr')
    expect(report.issues).toEqual([])
    expect(report.fixedPhraseLines).toEqual([])
    expect(report.pausedQuestions * 3).toBeLessThanOrEqual(report.questions)
    expect(report.pausedQuestions).toBeGreaterThanOrEqual(1)
    // The pause sits on the question line itself, and the final question keeps it.
    const lines = script.flatMap((section) => section.lines)
    expect(lines.every((line) => !line.pause || /[?？]$/.test(line.text))).toBe(true)
    expect(script.find((section) => section.role === 'selfcheck')!.lines[0].pause).toBe(true)
    // Nothing else was lost: every non-invitation line is still there.
    expect(lines.some((line) => /^Bir an düşün/i.test(line.text))).toBe(false)
    expect(lines.length).toBe(copied().flatMap((section) => section.lines).filter((line) => !/^Bir an düşün/.test(line.text)).length)
  })

  test('a fixed phrase inside a longer line is cut out, the rest of the line stays; the same invitation is not used twice', () => {
    const script = sections([
      {
        role: 'teach',
        lines: [
          ['hostA', 'Işık bitkiye enerji verir ve şeker üretimini başlatır. Bir düşün.'],
          ['hostB', 'Sence gölgede ne olur, tahmin et?'],
          ['hostA', 'Yaprak soluklaşır ve zamanla küçülür.'],
          ['hostB', 'Sence gölgede ne olur, tahmin et?'],
          ['hostA', 'Şimdi bir tahmin yap.'],
          ['hostB', 'Şimdi bir tahmin yap.'],
        ],
      },
      { role: 'selfcheck', lines: [['hostA', 'Fotosentez nerede olur?', true], ['hostB', 'Kloroplastta.']] },
    ])
    tidyPauses(script, 'tr')
    const texts = script.flatMap((section) => section.lines.map((line) => line.text))
    expect(texts[0]).toBe('Işık bitkiye enerji verir ve şeker üretimini başlatır.')
    expect(texts.filter((text) => text === 'Sence gölgede ne olur, tahmin et?')).toHaveLength(1) // a word-for-word repeat is dropped
    expect(texts.filter((text) => text === 'Şimdi bir tahmin yap.')).toHaveLength(1)
  })

  test('the writer pipeline applies it: a draft full of copied "think" lines comes out clean', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.ANTHROPIC_API_KEY = 'must-not-be-used'
    delete process.env.VERCEL_ENV
    const draft = {
      title: 'Yaprak',
      sections: copied().map((section) => ({ role: section.role, title: section.title, keyPointIds: section.role === 'teach' ? ['K1'] : [], lines: section.lines.map((line) => ({ s: line.speaker, t: line.text, d: 'warm', ...(line.pause ? { pause: true } : {}) })) })).concat([
        { role: 'recap', title: 'Özet', keyPointIds: ['K1'], lines: [{ s: 'hostA', t: 'Klorofil ışığı soğurur ve şeker üretilir.', d: 'warm' }] },
      ] as never),
    }
    // The three OpenAI calls: writer, check (nothing flagged), nothing else.
    const replies = [draft, { flags: [], coverage: [{ keyPointId: 'K1', explained: true, exampleLineIds: ['p1-L1'] }] }]
    let call = 0
    globalThis.fetch = (async () => {
      const reply = replies[call++] ?? { flags: [], coverage: [{ keyPointId: 'K1', explained: true, exampleLineIds: ['p1-L1'] }] }
      return new Response(JSON.stringify({ output_text: JSON.stringify(reply), usage: { input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } }), { status: 200 })
    }) as typeof fetch
    const source = Array.from({ length: 40 }, (_, i) => `Fotosentez hakkında ${i} numaralı bilgi: bitkiler ışığı kullanır.`).join(' ')
    const { status, body } = await handleLessonRequest(
      { action: 'script', text: source, keyPoints: [{ id: 'K1', text: 'Klorofil ışığı soğurur.', source: 's', topic: 'fotosentez' }], episodes: [{ part: 1, keyPointIds: ['K1'] }], part: 1, style: 'two_hosts', level: 'general', tone: 'normal', language: 'tr' },
      { ip: nextIp() },
    )
    expect(status).toBe(200)
    const episode = (body as { episode: { sections: ScriptSection[] } }).episode
    expect(auditScript(episode.sections, 'tr').issues).toEqual([])
  })
})

test.describe('plan: one fact per line, in plain words, no internal labels', () => {
  test('a list fact reads as a sentence with its items; merged facts stay separate lines', () => {
    const text = 'Bitkiler ışıkla beslenir. Fotosentez için karbondioksit, su ve ışık gerekir. Oksijen açığa çıkar.'
    const points = keyPointsFromFacts(
      [
        { id: 'F1', statement: 'Bitkiler ışıkla beslenir.', label: 'Fotosentez', span: 'Bitkiler ışıkla beslenir.' },
        { id: 'F2', statement: 'Fotosentez için gerekenler', label: 'Fotosentez', span: 'Fotosentez için karbondioksit, su ve ışık gerekir.', items: ['karbondioksit', 'su', 'ışık'] },
        { id: 'F3', statement: 'Oksijen açığa çıkar.', label: 'Fotosentez', span: 'Oksijen açığa çıkar.' },
      ] as never,
      text,
    )
    const shown = points.flatMap((point) => keyPointDisplay(point))
    expect(shown).toEqual(['Bitkiler ışıkla beslenir.', 'Fotosentez için gerekenler: karbondioksit, su, ışık.', 'Oksijen açığa çıkar.'])
    expect(shown.join(' ')).not.toMatch(/Items:|;/)
    expect(points.map((point) => point.text).join(' ')).not.toContain('Items:')
  })

  test('a plan saved before the fix is shown without the label', () => {
    expect(keyPointDisplay({ text: 'Fotosentez için gerekenler. Items: karbondioksit; su; ışık.' })).toEqual(['Fotosentez için gerekenler: karbondioksit, su, ışık.'])
  })
})

test.describe('lesson audit helpers', () => {
  test('the same audio file twice is a copied clip; long silence is counted, short gaps are not', () => {
    expect(duplicateSegments(new Map([['a', 'h1'], ['b', 'h2'], ['c', 'h1'], ['d', 'h1']]))).toEqual(['c', 'd'])
    const rate = 24000
    const voice = glideSamples(2, 190, 190)
    const gap = (seconds: number) => new Float32Array(Math.round(seconds * rate))
    const join = (...parts: Float32Array[]) => {
      const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
      let at = 0
      for (const part of parts) {
        out.set(part, at)
        at += part.length
      }
      return out
    }
    expect(longSilenceShare(join(voice, gap(0.4), voice, gap(0.4), voice), rate)).toBeLessThan(0.01)
    const withPause = longSilenceShare(join(voice, gap(3), voice, gap(3), voice), rate)
    expect(withPause).toBeGreaterThan(0.3)
    expect(withPause).toBeLessThan(0.55)
  })
})
