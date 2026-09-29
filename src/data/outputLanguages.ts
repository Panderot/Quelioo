export interface OutputLanguage {
  /** BCP-47 language tag. */
  code: string
  /** The language's own name for itself (autonym) — shown in the UI, needs no translation. */
  nativeName: string
  /** English name — used to search, to sort the "All languages" group, and inside the prompt sent to the model. */
  englishName: string
  /** Extra Turkish search alias so Turkish users can type e.g. "Almanca" or "Ermenice" and still find the language. */
  trAlias?: string
}

/** Suggested codes, in display order. "auto" is handled separately (localized, not a real language). */
export const SUGGESTED_OUTPUT_LANGUAGE_CODES = ['tr', 'en', 'hyw']

export const OUTPUT_LANGUAGES: OutputLanguage[] = [
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'hyw', nativeName: 'Հայերէն (Արեւմտահայերէն)', englishName: 'Armenian (Western)', trAlias: 'Ermenice (Batı)' },
  { code: 'sq', nativeName: 'Shqip', englishName: 'Albanian', trAlias: 'Arnavutça' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', trAlias: 'Arapça' },
  { code: 'hy', nativeName: 'Հայերեն (Արևելահայերեն)', englishName: 'Armenian (Eastern)', trAlias: 'Ermenice (Doğu)' },
  { code: 'az', nativeName: 'Azərbaycanca', englishName: 'Azerbaijani', trAlias: 'Azerbaycanca' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', trAlias: 'Bengalce' },
  { code: 'bs', nativeName: 'Bosanski', englishName: 'Bosnian', trAlias: 'Boşnakça' },
  { code: 'bg', nativeName: 'Български', englishName: 'Bulgarian', trAlias: 'Bulgarca' },
  { code: 'ca', nativeName: 'Català', englishName: 'Catalan', trAlias: 'Katalanca' },
  { code: 'zh-Hans', nativeName: '中文 (简体)', englishName: 'Chinese (Simplified)', trAlias: 'Çince (Basit)' },
  { code: 'zh-Hant', nativeName: '中文 (繁體)', englishName: 'Chinese (Traditional)', trAlias: 'Çince (Geleneksel)' },
  { code: 'hr', nativeName: 'Hrvatski', englishName: 'Croatian', trAlias: 'Hırvatça' },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech', trAlias: 'Çekçe' },
  { code: 'da', nativeName: 'Dansk', englishName: 'Danish', trAlias: 'Danca' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', trAlias: 'Felemenkçe' },
  { code: 'et', nativeName: 'Eesti', englishName: 'Estonian', trAlias: 'Estonca' },
  { code: 'fi', nativeName: 'Suomi', englishName: 'Finnish', trAlias: 'Fince' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', trAlias: 'Fransızca' },
  { code: 'ka', nativeName: 'ქართული', englishName: 'Georgian', trAlias: 'Gürcüce' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', trAlias: 'Almanca' },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek', trAlias: 'Yunanca' },
  { code: 'he', nativeName: 'עברית', englishName: 'Hebrew', trAlias: 'İbranice' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', trAlias: 'Hintçe' },
  { code: 'hu', nativeName: 'Magyar', englishName: 'Hungarian', trAlias: 'Macarca' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', trAlias: 'Endonezce' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', trAlias: 'İtalyanca' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', trAlias: 'Japonca' },
  { code: 'kk', nativeName: 'Қазақ тілі', englishName: 'Kazakh', trAlias: 'Kazakça' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', trAlias: 'Korece' },
  { code: 'kmr', nativeName: 'Kurdî (Kurmancî)', englishName: 'Kurdish (Kurmanji)', trAlias: 'Kürtçe (Kurmançi)' },
  { code: 'lv', nativeName: 'Latviešu', englishName: 'Latvian', trAlias: 'Letonca' },
  { code: 'lt', nativeName: 'Lietuvių', englishName: 'Lithuanian', trAlias: 'Litvanca' },
  { code: 'ms', nativeName: 'Bahasa Melayu', englishName: 'Malay', trAlias: 'Malayca' },
  { code: 'no', nativeName: 'Norsk', englishName: 'Norwegian', trAlias: 'Norveççe' },
  { code: 'fa', nativeName: 'فارسی', englishName: 'Persian', trAlias: 'Farsça' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish', trAlias: 'Lehçe' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', trAlias: 'Portekizce (Brezilya)' },
  { code: 'pt-PT', nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)', trAlias: 'Portekizce (Portekiz)' },
  { code: 'ro', nativeName: 'Română', englishName: 'Romanian', trAlias: 'Rumence' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', trAlias: 'Rusça' },
  { code: 'sr', nativeName: 'Српски', englishName: 'Serbian', trAlias: 'Sırpça' },
  { code: 'sk', nativeName: 'Slovenčina', englishName: 'Slovak', trAlias: 'Slovakça' },
  { code: 'sl', nativeName: 'Slovenščina', englishName: 'Slovenian', trAlias: 'Slovence' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', trAlias: 'İspanyolca' },
  { code: 'sw', nativeName: 'Kiswahili', englishName: 'Swahili', trAlias: 'Svahili' },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish', trAlias: 'İsveççe' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai', trAlias: 'Tayca' },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian', trAlias: 'Ukraynaca' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', trAlias: 'Urduca' },
  { code: 'uz', nativeName: 'Oʻzbekcha', englishName: 'Uzbek', trAlias: 'Özbekçe' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', trAlias: 'Vietnamca' },
]

export const OUTPUT_LANGUAGE_CODES: ReadonlySet<string> = new Set(['auto', ...OUTPUT_LANGUAGES.map((language) => language.code)])

const OUTPUT_LANGUAGE_BY_CODE: ReadonlyMap<string, OutputLanguage> = new Map(
  OUTPUT_LANGUAGES.map((language) => [language.code, language]),
)

export function getOutputLanguage(code: string): OutputLanguage | undefined {
  return OUTPUT_LANGUAGE_BY_CODE.get(code)
}

/** The English name to use inside the model prompt (e.g. "Write the quiz in German."). */
export function getOutputLanguageEnglishName(code: string): string | undefined {
  return OUTPUT_LANGUAGE_BY_CODE.get(code)?.englishName
}
