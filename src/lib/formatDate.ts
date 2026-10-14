const pad = (value: number) => String(value).padStart(2, '0')

/** Western Armenian (hyw) shows dates as numbers (15.10.2026, with time 15.10.2026 00:51): month names are not used. */
const isNumericLocale = (language: string) => language === 'hyw'

const intlLocale = (language: string) => (language === 'hyw' ? 'hy' : language)

export function formatDay(date: Date): string {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

export function formatTime(date: Date, language: string): string {
  if (isNumericLocale(language)) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return new Intl.DateTimeFormat(intlLocale(language), { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** Archive rows and cards: "15 Oct 2026, 00:51" in TR / EN, "15.10.2026 00:51" in HYW. */
export function formatDateTime(date: Date, language: string): string {
  if (isNumericLocale(language)) return `${formatDay(date)} ${formatTime(date, language)}`
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Chart axis: "15 Oct" in TR / EN, "15.10" in HYW. */
export function formatDayMonth(date: Date, language: string): string {
  if (isNumericLocale(language)) return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(date)
}

/** Tooltips: the long date with time in TR / EN, "15.10.2026 00:51" in HYW. */
export function formatDateTimeLong(date: Date, language: string): string {
  if (isNumericLocale(language)) return formatDateTime(date, language)
  return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeStyle: 'short' }).format(date)
}
