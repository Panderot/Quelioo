/** Starter decks for the empty Flashcards page. Content is study data, not UI text: deck names come
 * from i18n (`flashcards.samples.*`); card text has a Turkish and an English version (hyw uses
 * English). Facts double-checked: dates are those of the laws' adoption by the Turkish parliament. */

export type SampleDeckKey = 'yds' | 'kpssGeography' | 'reforms'

export const SAMPLE_REF_PREFIX = 'sample:'

type Pair = [front: string, back: string]

const YDS: Pair[] = [
  ['abundant', 'bol, bereketli (plentiful)'],
  ['scarce', 'kıt, az bulunan (rare, insufficient)'],
  ['enhance', 'geliştirmek, artırmak (improve)'],
  ['mitigate', 'hafifletmek, azaltmak (make less severe)'],
  ['comprehensive', 'kapsamlı (complete, thorough)'],
  ['inevitable', 'kaçınılmaz (unavoidable)'],
  ['reluctant', 'isteksiz, gönülsüz (unwilling)'],
  ['substantial', 'önemli, kayda değer (considerable)'],
]

const GEOGRAPHY: Record<'tr' | 'en', Pair[]> = {
  tr: [
    ["Türkiye'nin en yüksek dağı", 'Ağrı Dağı (5.137 m)'],
    ["Türkiye'nin en büyük gölü", 'Van Gölü'],
    ["Tamamı Türkiye'de olan en uzun akarsu", 'Kızılırmak'],
    ['Yüzölçümü en büyük il', 'Konya'],
    ["Türkiye'nin kara sınırı olan komşu ülke sayısı", '8'],
    ['En çok yağış alan il', 'Rize'],
    ["Karadeniz'i Marmara Denizi'ne bağlayan boğaz", 'İstanbul Boğazı'],
  ],
  en: [
    ["Turkey's highest mountain", 'Mount Ağrı (Ararat), 5,137 m'],
    ["Turkey's largest lake", 'Lake Van'],
    ['Longest river entirely within Turkey', 'Kızılırmak'],
    ['Largest province by area', 'Konya'],
    ['Number of countries sharing a land border with Turkey', '8'],
    ['Province with the most rainfall', 'Rize'],
    ['Strait linking the Black Sea to the Sea of Marmara', 'The Bosphorus (Istanbul Strait)'],
  ],
}

const REFORMS: Record<'tr' | 'en', Pair[]> = {
  tr: [
    ['Saltanatın kaldırılması', '1 Kasım 1922'],
    ['Cumhuriyetin ilanı', '29 Ekim 1923'],
    ['Halifeliğin kaldırılması', '3 Mart 1924'],
    ['Tevhid-i Tedrisat Kanunu', '3 Mart 1924'],
    ['Şapka Kanunu', '25 Kasım 1925'],
    ['Türk Medeni Kanunu', '17 Şubat 1926'],
    ['Harf İnkılabı (yeni Türk alfabesi)', '1 Kasım 1928'],
    ['Soyadı Kanunu', '21 Haziran 1934'],
    ['Kadınlara milletvekili seçme ve seçilme hakkı', '5 Aralık 1934'],
  ],
  en: [
    ['Abolition of the sultanate', '1 November 1922'],
    ['Proclamation of the Republic', '29 October 1923'],
    ['Abolition of the caliphate', '3 March 1924'],
    ['Law on the Unification of Education (Tevhid-i Tedrisat)', '3 March 1924'],
    ['Hat Law', '25 November 1925'],
    ['Turkish Civil Code', '17 February 1926'],
    ['Alphabet reform (new Turkish alphabet)', '1 November 1928'],
    ['Surname Law', '21 June 1934'],
    ['Women gain the right to vote and stand in general elections', '5 December 1934'],
  ],
}

export function sampleDeckCards(key: SampleDeckKey, language: string): { front: string; back: string }[] {
  const variant = language === 'tr' ? 'tr' : 'en'
  const pairs = key === 'yds' ? YDS : key === 'kpssGeography' ? GEOGRAPHY[variant] : REFORMS[variant]
  return pairs.map(([front, back]) => ({ front, back }))
}

export const SAMPLE_DECK_KEYS: SampleDeckKey[] = ['yds', 'kpssGeography', 'reforms']
