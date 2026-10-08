// After `vite build`: renders the landing page to static HTML so crawlers and link previews see real content.
//   dist/index.html (tr), dist/en/index.html, dist/hyw/index.html  -> landing page
//   dist/app.html                                                  -> the plain app shell every other route is rewritten to (vercel.json)
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const dist = 'dist'
// vite emits two pages: index.html (the whole app) and landing.html (the light landing entry).
const shell = `${dist}/app.html`
if (!existsSync(shell)) copyFileSync(`${dist}/index.html`, shell)
const template = readFileSync(`${dist}/landing.html`, 'utf8')

/** Loads the page's JavaScript after the first paint (and `load`) so the static page is never held up by script work. */
function deferScripts(html) {
  const script = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/)
  if (!script) throw new Error('prerender: entry script not found')
  const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1])
  const loader = `<script>addEventListener('load',function(){setTimeout(function(){${JSON.stringify(preloads)}.forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.href=h;document.head.appendChild(l)});var s=document.createElement('script');s.type='module';s.src=${JSON.stringify(script[1])};document.head.appendChild(s)},0)})</script>`
  // The stylesheet goes inline too: one request fewer before the first paint.
  const sheet = html.match(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/)
  if (sheet) html = html.replace(sheet[0], `<style>${readFileSync(`${dist}${sheet[1]}`, 'utf8')}</style>`)
  return html
    .replace(script[0], '')
    .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
    .replace('</body>', `${loader}
  </body>`)
}

const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { prerender } = await server.ssrLoadModule('/src/landing/prerender.tsx')
  for (const [lang, file] of [['tr', 'index.html'], ['en', 'en/index.html'], ['hyw', 'hyw/index.html']]) {
    const { body, head, title } = await prerender(lang)
    const htmlLang = lang === 'hyw' ? 'hyw' : lang
    let html = template
      .replace('<html lang="en">', `<html lang="${htmlLang}">`)
      .replace(/<title>.*?<\/title>/, `<title>${title.replace(/&/g, '&amp;')}</title>\n    ${head}`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
    html = deferScripts(html)
    if (html === template) throw new Error('prerender: template markers not found')
    mkdirSync(`${dist}/${file}`.replace(/\/[^/]*$/, ''), { recursive: true })
    writeFileSync(`${dist}/${file}`, html)
    console.log(`prerendered ${file} (${Math.round(html.length / 1024)} KB)`)
  }
  rmSync(`${dist}/landing.html`)
} finally {
  await server.close()
}
