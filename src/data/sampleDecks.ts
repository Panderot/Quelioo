/** Starter decks for the Flashcards page. Content is study data, not UI text: deck names come from
 * i18n (`flashcards.samples.*`); card text has a Turkish and an English version (hyw uses English
 * until a native speaker has reviewed an Armenian set). Every front is a question that says what is
 * asked. Facts double-checked: dates are those of the laws' adoption by the Turkish parliament. */

export type SampleDeckKey = 'photosynthesis' | 'organelles' | 'exponents' | 'irregularVerbs' | 'turkeyGeography' | 'reforms' | 'yds'

/** Stored in `Deck.sourceRef` so "Add sample decks" can tell which samples already exist. */
export const SAMPLE_REF_PREFIX = 'sample:'

type Pair = [front: string, back: string]
type Variants = Record<'tr' | 'en', Pair[]>

const PHOTOSYNTHESIS: Variants = {
  tr: [
    ['Fotosentez nedir?', 'Yeşil bitkilerin, alglerin ve bazı bakterilerin ışık enerjisini kullanarak besin üretmesidir.'],
    ['Fotosentez hücrenin hangi organelinde gerçekleşir?', 'Kloroplastta.'],
    ['Işığı soğuran pigmentin adı nedir?', 'Klorofil. Bitkilere yeşil rengini de verir.'],
    ['Fotosentez için gereken üç şey nedir?', 'Karbondioksit, su ve ışık.'],
    ['Fotosentezin sonunda ne oluşur?', 'Glikoz ve oksijen.'],
    ['Bitkiler karbondioksiti nereden alır?', 'Yapraklardaki stoma adı verilen gözeneklerden.'],
    ['Su yapraklara nasıl taşınır?', 'Kökler topraktan emer, odun boruları yapraklara taşır.'],
    ['Bitki glikozu nasıl depolar?', 'Nişasta olarak.'],
    ['Fotosentezin hızını etkileyen dört faktör nedir?', 'Işık şiddeti, karbondioksit miktarı, sıcaklık ve su miktarı.'],
    ['Oksijen fotosentezde gerekli madde mi, ürün mü?', 'Üründür. Fotosentez sonunda atmosfere verilir.'],
  ],
  en: [
    ['What is photosynthesis?', 'The way green plants, algae and some bacteria use light energy to make food.'],
    ['In which organelle does photosynthesis take place?', 'The chloroplast.'],
    ['What is the name of the pigment that absorbs light?', 'Chlorophyll. It also gives plants their green colour.'],
    ['What three things does photosynthesis need?', 'Carbon dioxide, water and light.'],
    ['What is produced at the end of photosynthesis?', 'Glucose and oxygen.'],
    ['Where do plants take in carbon dioxide?', 'Through small pores in the leaves called stomata.'],
    ['How does water reach the leaves?', 'The roots absorb it from the soil and xylem vessels carry it to the leaves.'],
    ['How does a plant store glucose?', 'As starch.'],
    ['What four factors affect the rate of photosynthesis?', 'Light intensity, carbon dioxide level, temperature and water supply.'],
    ['Is oxygen a requirement or a product of photosynthesis?', 'A product. It is released into the atmosphere.'],
  ],
}

const ORGANELLES: Variants = {
  tr: [
    ['Hücrenin yönetim merkezi hangi yapıdır?', 'Çekirdek. Kalıtım materyalini (DNA) taşır.'],
    ['Hücrede enerji üreten organel hangisidir?', 'Mitokondri. Oksijenli solunumla ATP üretir.'],
    ['Protein sentezi hangi organelde yapılır?', 'Ribozomda.'],
    ['Hücreyi çevreleyen ve madde geçişini kontrol eden yapı nedir?', 'Hücre zarı.'],
    ['Bitki hücresini hayvan hücresinden ayıran üç yapı nedir?', 'Hücre duvarı, kloroplast ve büyük merkezi koful.'],
    ['Hücre içi sindirimi yapan organel hangisidir?', 'Lizozom.'],
    ['Maddeleri paketleyip salgılayan organel hangisidir?', 'Golgi cisimciği.'],
    ['Hücre zarı ile çekirdek arasını dolduran sıvı nedir?', 'Sitoplazma.'],
    ['Hücre içinde madde taşıyan kanal sistemi hangisidir?', 'Endoplazmik retikulum.'],
    ['Hayvan hücresinde bölünmede görev alan yapı hangisidir?', 'Sentrozom.'],
  ],
  en: [
    ['Which structure is the control centre of the cell?', 'The nucleus. It holds the genetic material (DNA).'],
    ['Which organelle produces energy in the cell?', 'The mitochondrion. It makes ATP through aerobic respiration.'],
    ['In which organelle are proteins made?', 'The ribosome.'],
    ['Which structure surrounds the cell and controls what passes in and out?', 'The cell membrane.'],
    ['What three structures set a plant cell apart from an animal cell?', 'A cell wall, chloroplasts and a large central vacuole.'],
    ['Which organelle digests material inside the cell?', 'The lysosome.'],
    ['Which organelle packages and secretes substances?', 'The Golgi apparatus.'],
    ['What is the fluid that fills the space between the cell membrane and the nucleus?', 'Cytoplasm.'],
    ['Which channel system carries substances inside the cell?', 'The endoplasmic reticulum.'],
    ['Which structure takes part in cell division in animal cells?', 'The centrosome.'],
  ],
}

// The Turkish and English math decks share their text: only the question wording differs.
const EXPONENTS: Variants = {
  tr: [
    ['Aynı tabanlı üslü sayılar çarpılırken üsler ne yapılır?', 'Toplanır: aᵐ · aⁿ = aᵐ⁺ⁿ'],
    ['Aynı tabanlı üslü sayılar bölünürken üsler ne yapılır?', 'Çıkarılır: aᵐ / aⁿ = aᵐ⁻ⁿ'],
    ['Üssün üssü nasıl hesaplanır?', 'Üsler çarpılır: (aᵐ)ⁿ = aᵐ·ⁿ'],
    ['Sıfırdan farklı bir sayının sıfırıncı kuvveti kaçtır?', '1 (a⁰ = 1)'],
    ['Negatif üs ne anlama gelir?', 'Sayının tersi alınır: a⁻ⁿ = 1 / aⁿ'],
    ['(−2)³ kaçtır?', '−8 (negatif sayının tek kuvveti negatiftir)'],
    ['(−2)⁴ kaçtır?', '16 (negatif sayının çift kuvveti pozitiftir)'],
    ['−2⁴ kaçtır?', "−16 (üs yalnızca 2'ye uygulanır)"],
    ['4³ kaçtır?', '64 (4 · 4 · 4). 4 · 3 değildir.'],
    ['2⁵ · 4³ / 8³ kaçtır?', '4 (hepsi 2 tabanına çevrilir: 2⁵ · 2⁶ / 2⁹ = 2²)'],
  ],
  en: [
    ['When you multiply powers with the same base, what do you do with the exponents?', 'Add them: aᵐ · aⁿ = aᵐ⁺ⁿ'],
    ['When you divide powers with the same base, what do you do with the exponents?', 'Subtract them: aᵐ / aⁿ = aᵐ⁻ⁿ'],
    ['How do you work out a power of a power?', 'Multiply the exponents: (aᵐ)ⁿ = aᵐ·ⁿ'],
    ['What is any non-zero number to the power of zero?', '1 (a⁰ = 1)'],
    ['What does a negative exponent mean?', 'Take the reciprocal: a⁻ⁿ = 1 / aⁿ'],
    ['What is (−2)³?', '−8 (an odd power of a negative number is negative)'],
    ['What is (−2)⁴?', '16 (an even power of a negative number is positive)'],
    ['What is −2⁴?', '−16 (the exponent applies only to the 2)'],
    ['What is 4³?', '64 (4 · 4 · 4), not 4 · 3.'],
    ['What is 2⁵ · 4³ / 8³?', '4 (convert everything to base 2: 2⁵ · 2⁶ / 2⁹ = 2²)'],
  ],
}

const VERBS: [base: string, tr: string, en: string, forms: string][] = [
  ['go', 'gitmek', 'to go', 'went / gone'],
  ['see', 'görmek', 'to see', 'saw / seen'],
  ['eat', 'yemek', 'to eat', 'ate / eaten'],
  ['write', 'yazmak', 'to write', 'wrote / written'],
  ['take', 'almak', 'to take', 'took / taken'],
  ['give', 'vermek', 'to give', 'gave / given'],
  ['buy', 'satın almak', 'to buy', 'bought / bought'],
  ['think', 'düşünmek', 'to think', 'thought / thought'],
  ['begin', 'başlamak', 'to begin', 'began / begun'],
  ['speak', 'konuşmak', 'to speak', 'spoke / spoken'],
  ['drink', 'içmek', 'to drink', 'drank / drunk'],
  ['know', 'bilmek', 'to know', 'knew / known'],
]

const IRREGULAR_VERBS: Variants = {
  tr: VERBS.map(([base, tr, , forms]): Pair => [`${base} (${tr}): 2. ve 3. hâli?`, forms]),
  en: VERBS.map(([base, , , forms]): Pair => [`${base}: past simple and past participle?`, forms]),
}

const GEOGRAPHY: Variants = {
  tr: [
    ["Türkiye'nin en yüksek dağı hangisidir?", 'Ağrı Dağı (5137 m).'],
    ["Türkiye'nin en büyük gölü hangisidir?", 'Van Gölü.'],
    ['Tamamı Türkiye sınırları içinde kalan en uzun nehir hangisidir?', 'Kızılırmak.'],
    ["Türkiye'nin yüz ölçümü en büyük bölgesi hangisidir?", 'Doğu Anadolu Bölgesi.'],
    ["Türkiye'nin yüz ölçümü en küçük bölgesi hangisidir?", 'Güneydoğu Anadolu Bölgesi.'],
    ['Türkiye kaç coğrafi bölgeye ayrılır?', '7 bölge.'],
    ['Karadeniz kıyılarında hangi iklim görülür?', 'Karadeniz iklimi: her mevsim yağışlı.'],
    ['Akdeniz ikliminin özelliği nedir?', 'Yazlar sıcak ve kurak, kışlar ılık ve yağışlı.'],
    ["Türkiye'de en çok yağış alan il hangisidir?", 'Rize.'],
    ["Türkiye'nin başkenti hangi bölgededir?", "Ankara, İç Anadolu Bölgesi'ndedir."],
  ],
  en: [
    ["What is Turkey's highest mountain?", 'Mount Ağrı (Ararat), 5,137 m.'],
    ["What is Turkey's largest lake?", 'Lake Van.'],
    ['Which is the longest river lying entirely within Turkey?', 'The Kızılırmak.'],
    ['Which region of Turkey is the largest by area?', 'The Eastern Anatolia Region.'],
    ['Which region of Turkey is the smallest by area?', 'The Southeastern Anatolia Region.'],
    ['How many geographical regions does Turkey have?', '7 regions.'],
    ['Which climate is found along the Black Sea coast?', 'The Black Sea climate: rainy in every season.'],
    ['What are the features of the Mediterranean climate?', 'Hot, dry summers and mild, rainy winters.'],
    ['Which province receives the most rainfall in Turkey?', 'Rize.'],
    ["In which region is Turkey's capital?", 'Ankara is in the Central Anatolia Region.'],
  ],
}

const REFORMS: Variants = {
  tr: [
    ['Saltanat hangi tarihte kaldırıldı?', '1 Kasım 1922 (TBMM kararıyla).'],
    ['Cumhuriyet hangi tarihte ilan edildi?', '29 Ekim 1923.'],
    ['Halifelik hangi tarihte kaldırıldı?', '3 Mart 1924.'],
    ['Tevhid-i Tedrisat Kanunu ne zaman kabul edildi ve ne getirdi?', '3 Mart 1924. Eğitim ve öğretimi birleştirdi.'],
    ['Şapka Kanunu hangi tarihte kabul edildi?', '25 Kasım 1925.'],
    ['Türk Medeni Kanunu ne zaman kabul edildi?', '17 Şubat 1926 (yürürlük: 4 Ekim 1926).'],
    ['Harf İnkılabı (yeni Türk alfabesi) kanunu ne zaman kabul edildi?', '1 Kasım 1928.'],
    ['Soyadı Kanunu ne zaman kabul edildi?', '21 Haziran 1934.'],
    ['Kadınlara milletvekili seçme ve seçilme hakkı ne zaman verildi?', '5 Aralık 1934.'],
    ['Kadınlara belediye seçimlerinde seçme ve seçilme hakkı ne zaman verildi?', '1930.'],
  ],
  en: [
    ['On what date was the sultanate abolished?', '1 November 1922 (by decision of the Grand National Assembly).'],
    ['On what date was the Republic proclaimed?', '29 October 1923.'],
    ['On what date was the caliphate abolished?', '3 March 1924.'],
    ['When was the Law on the Unification of Education (Tevhid-i Tedrisat) adopted, and what did it do?', '3 March 1924. It unified education under one system.'],
    ['On what date was the Hat Law adopted?', '25 November 1925.'],
    ['When was the Turkish Civil Code adopted?', '17 February 1926 (in force from 4 October 1926).'],
    ['When was the law introducing the new Turkish alphabet adopted?', '1 November 1928.'],
    ['When was the Surname Law adopted?', '21 June 1934.'],
    ['When did women gain the right to vote and stand in general elections?', '5 December 1934.'],
    ['When did women gain the right to vote and stand in municipal elections?', '1930.'],
  ],
}

const YDS_WORDS: [word: string, tr: string, en: string][] = [
  ['abundant', 'bol, bereketli', 'plentiful'],
  ['scarce', 'kıt, az bulunan', 'rare, in short supply'],
  ['enhance', 'geliştirmek, artırmak', 'improve'],
  ['mitigate', 'hafifletmek, azaltmak', 'make less severe'],
  ['comprehensive', 'kapsamlı', 'complete, thorough'],
  ['inevitable', 'kaçınılmaz', 'unavoidable'],
  ['reluctant', 'isteksiz, gönülsüz', 'unwilling'],
  ['substantial', 'önemli, kayda değer', 'considerable'],
]

const YDS: Variants = {
  tr: YDS_WORDS.map(([word, tr, en]): Pair => [`${word}: Türkçe anlamı?`, `${tr} (${en})`]),
  en: YDS_WORDS.map(([word, tr, en]): Pair => [`${word}: what does it mean?`, `${en} (Turkish: ${tr})`]),
}

const DECKS: Record<SampleDeckKey, Variants> = {
  photosynthesis: PHOTOSYNTHESIS,
  organelles: ORGANELLES,
  exponents: EXPONENTS,
  irregularVerbs: IRREGULAR_VERBS,
  turkeyGeography: GEOGRAPHY,
  reforms: REFORMS,
  yds: YDS,
}

/** Keys double as `flashcards.samples.<key>` deck names and as the `sample:<key>` source reference. */
export const SAMPLE_DECK_KEYS: SampleDeckKey[] = ['photosynthesis', 'organelles', 'exponents', 'irregularVerbs', 'turkeyGeography', 'reforms', 'yds']

export function sampleDeckCards(key: SampleDeckKey, language: string): { front: string; back: string }[] {
  const variant = language === 'tr' ? 'tr' : 'en'
  return DECKS[key][variant].map(([front, back]) => ({ front, back }))
}

/** Sample keys with no deck yet. A deck the student deleted counts as missing, so it can be added again. */
export function missingSampleKeys(decks: { sourceRef: string | null }[]): SampleDeckKey[] {
  const present = new Set(decks.map((deck) => deck.sourceRef))
  return SAMPLE_DECK_KEYS.filter((key) => !present.has(`${SAMPLE_REF_PREFIX}${key}`))
}
