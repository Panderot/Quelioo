/** Section tags in song lyrics. The music model and the lyrics writer use the English tags; the
 * student sees them in their own language and edits them there, so every tag is mapped back to the
 * English form before lyrics are sent anywhere. */

type TagKind = 'Intro' | 'Verse' | 'Chorus' | 'Bridge' | 'Outro'

const TAG_NAMES: Record<string, Record<TagKind, string>> = {
  en: { Intro: 'Intro', Verse: 'Verse', Chorus: 'Chorus', Bridge: 'Bridge', Outro: 'Outro' },
  tr: { Intro: 'Giriş', Verse: 'Kıta', Chorus: 'Nakarat', Bridge: 'Köprü', Outro: 'Bitiş' },
  hyw: { Intro: 'Ներածութիւն', Verse: 'Տուն', Chorus: 'Կրկներգ', Bridge: 'Կամուրջ', Outro: 'Աւարտ' },
}

/** A whole line that is just one tag: "[Chorus]", "[Kıta 2]", "[Verse]". */
const TAG_LINE = /^\s*\[\s*([^\]\d]+?)\s*(\d+)?\s*\]\s*$/

function languageKey(language: string): string {
  const base = language.toLowerCase().split('-')[0]
  return base in TAG_NAMES ? base : 'en'
}

function kindOfName(name: string): TagKind | null {
  const wanted = name.toLocaleLowerCase('tr')
  for (const names of Object.values(TAG_NAMES)) {
    for (const [kind, label] of Object.entries(names)) {
      if (label.toLocaleLowerCase('tr') === wanted || label.toLowerCase() === name.toLowerCase()) return kind as TagKind
    }
  }
  return null
}

function mapTagLines(lyrics: string, render: (kind: TagKind, number: string | undefined) => string): string {
  return lyrics
    .split('\n')
    .map((line) => {
      const match = TAG_LINE.exec(line)
      const kind = match ? kindOfName(match[1]) : null
      return match && kind ? render(kind, match[2]) : line
    })
    .join('\n')
}

/** English tags (or any already-localized ones) shown in the student's language. */
export function localizeSectionTags(lyrics: string, language: string): string {
  const names = TAG_NAMES[languageKey(language)]
  return mapTagLines(lyrics, (kind, number) => `[${names[kind]}${number ? ` ${number}` : ''}]`)
}

/** Tags in any supported language mapped back to the English ones the music model needs. */
export function canonicalSectionTags(lyrics: string): string {
  return mapTagLines(lyrics, (kind, number) => `[${TAG_NAMES.en[kind]}${number ? ` ${number}` : ''}]`)
}

/** True for a line that is only a section tag in any supported language. */
export function isSectionTagLine(line: string): boolean {
  const match = TAG_LINE.exec(line)
  return Boolean(match && kindOfName(match[1]))
}
