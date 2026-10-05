import { expect, test } from '@playwright/test'

import { detectTextLanguage, resolveCardLanguage, resolveTranslationTarget, textMatchesLanguage, translationLanguageConflict } from '../../src/lib/cardLanguage'
import { cardViolation, dropNearDuplicates, isNearDuplicate, shuffled } from '../../src/lib/cardRules'

// Pure unit tests (no browser): the language resolver, per-type validators and duplicate detection.

const SAMPLES: Record<string, string> = {
  tr: 'Gökkuşağı, güneş ışığının yağmur damlalarında kırılması ve renklerine ayrılmasıyla oluşur. Bu yüzden güneşin gözlemcinin arkasında olması gerekir.',
  en: 'A rainbow forms when sunlight is refracted and reflected inside raindrops and split into its colours. This is why the sun must be behind the observer.',
  de: 'Ein Regenbogen entsteht, wenn das Sonnenlicht in den Regentropfen gebrochen und in seine Farben zerlegt wird. Deshalb muss die Sonne hinter dem Beobachter stehen.',
  fr: "Un arc-en-ciel se forme quand la lumière du soleil est réfractée dans les gouttes de pluie et décomposée en couleurs. C'est pourquoi le soleil doit être derrière l'observateur.",
  ru: 'Радуга образуется, когда солнечный свет преломляется в каплях дождя и разлагается на цвета. Поэтому солнце должно находиться позади наблюдателя.',
  ar: 'يتكون قوس قزح عندما ينكسر ضوء الشمس داخل قطرات المطر ويتحلل إلى ألوانه. لذلك يجب أن تكون الشمس خلف المراقب.',
  fa: 'رنگین‌کمان زمانی شکل می‌گیرد که نور خورشید در قطرات باران شکسته شود و به رنگ‌هایش تجزیه گردد. چگونه است؟',
  he: 'קשת נוצרת כאשר אור השמש נשבר בטיפות הגשם ומתפרק לצבעיו. לכן השמש צריכה להיות מאחורי הצופה.',
  ja: '虹は、太陽の光が雨粒の中で屈折し、反射して、色に分かれることで生じます。そのため、太陽は観察者の後ろにある必要があります。',
  zh: '彩虹是太阳光在雨滴中折射、反射并分解成各种颜色而形成的。因此太阳必须在观察者的身后。',
  ko: '무지개는 햇빛이 빗방울 속에서 굴절되고 반사되어 여러 색으로 나뉠 때 생깁니다. 그래서 태양은 관찰자의 뒤에 있어야 합니다.',
  hyw: 'Ծիածանը կը ձեւանայ, երբ արեւի լոյսը անձրեւի կաթիլներուն մէջ կը բեկուի եւ իր գոյներուն կը բաժնուի։',
  el: 'Το ουράνιο τόξο σχηματίζεται όταν το φως του ήλιου διαθλάται στις σταγόνες της βροχής και αναλύεται στα χρώματα του.',
  hi: 'इंद्रधनुष तब बनता है जब सूर्य का प्रकाश वर्षा की बूंदों में अपवर्तित होकर रंगों में बंट जाता है।',
}

test.describe('language resolver', () => {
  test('detects the language of a text by script and function words', () => {
    const expected: Record<string, string> = { tr: 'tr', en: 'en', de: 'de', fr: 'fr', ru: 'ru', ar: 'ar', fa: 'fa', he: 'he', ja: 'ja', zh: 'zh-Hans', ko: 'ko', hyw: 'hyw', el: 'el', hi: 'hi' }
    for (const [key, text] of Object.entries(SAMPLES)) expect(detectTextLanguage(text), key).toBe(expected[key])
  })

  test('a short or unclear text is not guessed', () => {
    expect(detectTextLanguage('xyz')).toBeNull()
    expect(detectTextLanguage('1 + 2 = 3')).toBeNull()
    expect(detectTextLanguage('Mitochondria ATP')).toBeNull()
  })

  test('a chosen language wins; auto follows the source; the UI language is the last resort, never English by default', () => {
    expect(resolveCardLanguage({ selected: 'de', sourceText: SAMPLES.tr, uiLanguage: 'en' })).toEqual({ code: 'de', certain: true })
    expect(resolveCardLanguage({ selected: 'auto', sourceText: SAMPLES.tr, uiLanguage: 'en' })).toEqual({ code: 'tr', certain: true })
    expect(resolveCardLanguage({ selected: 'auto', sourceText: SAMPLES.ru, uiLanguage: 'tr' })).toEqual({ code: 'ru', certain: true })
    expect(resolveCardLanguage({ selected: 'auto', sourceText: 'xyz', uiLanguage: 'tr' })).toEqual({ code: 'tr', certain: false })
    expect(resolveCardLanguage({ selected: 'auto', sourceText: '', uiLanguage: 'hyw' })).toEqual({ code: 'hyw', certain: false })
    expect(resolveCardLanguage({ selected: 'auto', sourceText: '', uiLanguage: 'fr' })).toEqual({ code: 'en', certain: false })
  })

  test('foreign words: the UI language unless it is the source, then English (Turkish for an English source)', () => {
    expect(resolveTranslationTarget({ selected: 'auto', sourceLanguage: 'de', uiLanguage: 'tr' })).toBe('tr')
    expect(resolveTranslationTarget({ selected: 'auto', sourceLanguage: 'tr', uiLanguage: 'tr' })).toBe('en')
    expect(resolveTranslationTarget({ selected: 'auto', sourceLanguage: 'en', uiLanguage: 'en' })).toBe('tr')
    expect(resolveTranslationTarget({ selected: 'ja', sourceLanguage: 'de', uiLanguage: 'tr' })).toBe('ja')
    expect(translationLanguageConflict({ selected: 'tr', sourceLanguage: 'tr' })).toBe(true)
    expect(translationLanguageConflict({ selected: 'pt-BR', sourceLanguage: 'pt' })).toBe(true)
    expect(translationLanguageConflict({ selected: 'auto', sourceLanguage: 'tr' })).toBe(false)
    expect(translationLanguageConflict({ selected: 'en', sourceLanguage: null })).toBe(false)
  })

  test('output check: right script and right language pass, other scripts and languages fail', () => {
    for (const key of ['ru', 'ar', 'fa', 'he', 'ja', 'zh', 'ko', 'hyw', 'el', 'hi', 'tr', 'en', 'de', 'fr']) {
      const code = key === 'zh' ? 'zh-Hans' : key
      expect(textMatchesLanguage(SAMPLES[key], code), key).toBe(true)
      expect(textMatchesLanguage(SAMPLES.en, code), `en as ${key}`).toBe(key === 'en' ? true : false)
    }
    expect(textMatchesLanguage(SAMPLES.tr, 'en')).toBe(false)
    expect(textMatchesLanguage(SAMPLES.de, 'tr')).toBe(false)
    expect(textMatchesLanguage('ATP', 'tr')).toBeNull()
    expect(textMatchesLanguage(SAMPLES.tr, 'xx')).toBeNull()
  })
})

test.describe('card type rules', () => {
  const tr = { outputLanguage: 'tr' }

  test('question → answer: the front is a complete question, the back is short', () => {
    expect(cardViolation({ front: 'Gökkuşağı nasıl oluşur?', back: 'Işığın kırılmasıyla.' }, { style: 'qa', ...tr })).toBeNull()
    expect(cardViolation({ front: 'Gökkuşağının oluşumu', back: 'Işığın kırılması.' }, { style: 'qa', ...tr })).toBe('front_not_question')
    expect(cardViolation({ front: '虹はどうやってできますか？', back: '光の屈折です。' }, { style: 'qa', outputLanguage: 'ja' })).toBeNull()
    expect(cardViolation({ front: 'Bir soru?', back: 'a\nb\nc' }, { style: 'qa', ...tr })).toBe('back_too_long')
  })

  test('term → definition: a real term of 1-4 words, never a question, heading or the topic', () => {
    const style = 'term' as const
    expect(cardViolation({ front: 'Işığın kırılması', back: 'Işığın bir ortamdan diğerine geçerken yön değiştirmesi.' }, { style, ...tr })).toBeNull()
    expect(cardViolation({ front: 'Işığın kırılması nedir?', back: 'Yön değişimi.' }, { style, ...tr })).toBe('front_is_question')
    expect(cardViolation({ front: 'Gökkuşağının oluşumunu açıklayan ışık olayları', back: 'x' }, { style, ...tr })).toBe('front_too_long')
    expect(cardViolation({ front: 'Gökkuşağı', back: 'Renkli yay.' }, { style, ...tr, topic: ' gökkuşağı ' })).toBe('front_is_topic')
    expect(cardViolation({ front: 'Bölüm 1:', back: 'x' }, { style, ...tr })).toBe('front_too_long')
  })

  test('foreign word → translation: a short word or phrase, and a back with a translation plus an example', () => {
    const style = 'translation' as const
    expect(cardViolation({ front: 'die Brücke', back: 'köprü — Die Brücke ist sehr alt.' }, { style, ...tr })).toBeNull()
    expect(cardViolation({ front: 'die Brücke', back: 'köprü' }, { style, ...tr })).toBe('back_no_example')
    expect(cardViolation({ front: 'Was heißt Brücke?', back: 'köprü — Die Brücke ist alt.' }, { style, ...tr })).toBe('front_is_question')
    expect(cardViolation({ front: 'die alte Brücke über den breiten Fluss hinweg', back: 'köprü — Sie ist alt.' }, { style, ...tr })).toBe('front_too_long')
    // The translation part must be in the output language; the example stays in the studied language.
    expect(cardViolation({ front: 'die Brücke', back: 'bridge — Die Brücke ist sehr alt.' }, { style, outputLanguage: 'ru' })).toBe('wrong_language')
    expect(cardViolation({ front: 'die Brücke', back: 'мост — Die Brücke ist sehr alt.' }, { style, outputLanguage: 'ru' })).toBeNull()
  })

  test('a card in the wrong language is flagged for every type', () => {
    expect(cardViolation({ front: 'What is refraction?', back: 'Bending of light.' }, { style: 'qa', outputLanguage: 'tr' })).toBe('wrong_language')
    expect(cardViolation({ front: 'Что такое преломление?', back: 'Изменение направления света.' }, { style: 'qa', outputLanguage: 'ru' })).toBeNull()
  })
})

test.describe('duplicates and variation', () => {
  test('near-duplicates are found by wording and by answer; different facts are kept', () => {
    const a = { front: 'Gökkuşağında en dışta hangi renk yer alır?', back: 'Kırmızı.' }
    expect(isNearDuplicate(a, { front: 'Gökkuşağında en dışta yer alan renk hangisidir?', back: 'Kırmızı.' })).toBe(true)
    expect(isNearDuplicate(a, { front: 'gökkuşağında EN dışta hangi renk yer alır', back: 'Kırmızı' })).toBe(true)
    expect(isNearDuplicate(a, { front: 'Gökkuşağı güneşten kaç derece açıyla görünür?', back: 'Yaklaşık 42 derece.' })).toBe(false)
    expect(isNearDuplicate({ front: '虹はどうやってできますか？', back: '光の屈折' }, { front: '虹はどうやってできますか', back: '光の屈折です' })).toBe(true)
  })

  test('the first of a group is kept; deck fronts and earlier cards count too', () => {
    const cards = [
      { front: 'Işığın kırılması nedir?', back: 'Yön değiştirmesi.' },
      { front: 'Işığın kırılması nedir', back: 'Yön değişimi.' },
      { front: 'İkinci gökkuşağı neden oluşur?', back: 'İki yansıma.' },
      { front: 'Mor renk nerede yer alır?', back: 'En içte.' },
    ]
    const result = dropNearDuplicates(cards, [{ front: 'Mor renk nerede yer alır?', back: 'İçte' }], ['İkinci gökkuşağı neden oluşur'])
    expect(result.kept.map((card) => card.front)).toEqual(['Işığın kırılması nedir?'])
    expect(result.dropped).toHaveLength(3)
  })

  test('the seeded shuffle differs per seed and keeps every item', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const first = shuffled(items, 1)
    expect([...first].sort()).toEqual(items)
    expect(shuffled(items, 1)).toEqual(first)
    expect(shuffled(items, 2)).not.toEqual(first)
  })
})
