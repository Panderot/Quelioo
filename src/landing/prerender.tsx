import i18next from 'i18next'
import { renderToString } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import en from '../i18n/locales/en.json'
import hyw from '../i18n/locales/hyw.json'
import tr from '../i18n/locales/tr.json'
import Landing from './Landing'
import { FAQ_KEYS } from './ui'

export type PrerenderLanguage = 'tr' | 'en' | 'hyw'
const LOCALES = { tr, en, hyw }
const SITE = 'https://quelio.vercel.app'
const PATHS: Record<PrerenderLanguage, string> = { tr: '/', en: '/en', hyw: '/hyw' }
const OG_LOCALE: Record<PrerenderLanguage, string> = { tr: 'tr_TR', en: 'en_US', hyw: 'hy_AM' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Static HTML of the landing page in one language, plus the head tags search engines and link previews read. */
export async function prerender(lang: PrerenderLanguage): Promise<{ body: string; head: string; title: string }> {
  const i18n = i18next.createInstance()
  await i18n.use(initReactI18next).init({ lng: lang, fallbackLng: 'en', resources: { [lang]: { translation: LOCALES[lang] } }, interpolation: { escapeValue: false } })
  const body = renderToString(
    <I18nextProvider i18n={i18n}>
      <Landing prerendered />
    </I18nextProvider>,
  )
  const t = (key: string) => i18n.t(key)
  const title = t('landing.meta.title')
  const description = t('landing.meta.description')
  const url = SITE + PATHS[lang]
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Quelio',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      description,
      url: SITE + '/',
      inLanguage: lang === 'hyw' ? 'hyw' : lang,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ_KEYS.map((key) => ({
        '@type': 'Question',
        name: t(`landing.faq.${key}.q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`landing.faq.${key}.a`) },
      })),
    },
  ]
  const head = [
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="tr" href="${SITE}/" />`,
    `<link rel="alternate" hreflang="en" href="${SITE}/en" />`,
    `<link rel="alternate" hreflang="hy" href="${SITE}/hyw" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Quelio" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}" />`,
    `<meta property="og:image" content="${SITE}/og-image.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${SITE}/og-image.png" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\u003c')}</script>`,
  ].join('\n    ')
  return { body, head, title }
}
