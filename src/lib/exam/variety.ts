import type { PaperLang } from './paperLabels'

/** Everyday settings and first names the scenarios of an exam may use. Each request gets a fresh random handful, so scenarios differ inside one exam and between exams. */

const SETTINGS: Record<'tr' | 'en', string[]> = {
  tr: [
    'okul laboratuvarı', 'mahalle pazarı', 'köydeki bir bahçe', 'şehir kütüphanesi', 'futbol maçı', 'okul gezisinde otobüs', 'evde mutfak', 'müze gezisi', 'sağlık ocağı', 'bir çiftlik', 'bilim fuarı', 'sahil kasabası',
    'orman kampı', 'küçük bir atölye', 'spor salonu', 'tren yolculuğu', 'gözlemevi', 'balıkçı teknesi', 'mahalle fırını', 'apartman bahçesi', 'okul kantini', 'bisiklet turu', 'hayvanat bahçesi', 'dağ evi',
  ],
  en: [
    'a school laboratory', 'a farmers market', 'a village garden', 'a city library', 'a football match', 'a school trip on a bus', 'a family kitchen', 'a museum visit', 'a health clinic', 'a farm', 'a science fair', 'a seaside town',
    'a forest camp', 'a small workshop', 'a gym', 'a train journey', 'an observatory', 'a fishing boat', 'a local bakery', 'an apartment garden', 'a school canteen', 'a cycling tour', 'a zoo', 'a mountain cabin',
  ],
}

const NAMES: Record<'tr' | 'en', string[]> = {
  tr: ['Ayşe', 'Burak', 'Defne', 'Emre', 'Selin', 'Kerem', 'Nehir', 'Ozan', 'Deniz', 'Yağmur', 'Arda', 'Ceren', 'Berk', 'Melis', 'İpek', 'Toprak', 'Zeynep', 'Mert', 'Elif', 'Can'],
  en: ['Maya', 'Liam', 'Sofia', 'Noah', 'Ella', 'Omar', 'Chloe', 'Ethan', 'Priya', 'Lucas', 'Amira', 'Jack', 'Nora', 'Leo', 'Hana', 'Sam', 'Zoe', 'Adam', 'Ivy', 'Kai'],
}

function pick<T>(list: T[], count: number, random: () => number): T[] {
  const pool = [...list]
  const out: T[] = []
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return out
}

/** `count` scenario hints like "setting: balıkçı teknesi; person: Defne". Languages other than Turkish get English settings. */
export function scenarioVariety(lang: PaperLang, count: number, random: () => number = Math.random): string[] {
  const key = lang === 'tr' ? 'tr' : 'en'
  const settings = pick(SETTINGS[key], count, random)
  const names = pick(NAMES[key], count, random)
  return settings.map((setting, index) => `setting: ${setting}; person: ${names[index] ?? names[0]}`)
}
