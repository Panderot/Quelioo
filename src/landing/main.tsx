import { createRoot, hydrateRoot } from 'react-dom/client'

import '../index.css'
import { hasStoredSession } from '../lib/auth/storedSession'
import { initLandingI18n } from './i18n'
import Landing from './Landing'

/**
 * Entry of the prerendered landing pages (/, /en, /hyw). It carries no account or app code, so a visitor
 * downloads only the page itself. Someone with a saved session gets the full app instead; any other
 * address ("Start", "Sign in", ...) is a normal page load into the app.
 */
async function start() {
  if (hasStoredSession()) {
    await import('../main')
    return
  }
  const path = location.pathname.replace(/\/+$/, '')
  const fixed = path === '/en' ? 'en' : path === '/hyw' ? 'hyw' : undefined
  const i18n = await initLandingI18n(fixed)
  const { I18nextProvider } = await import('react-i18next')
  const root = document.getElementById('root')!
  const element = (
    <I18nextProvider i18n={i18n}>
      <Landing prerendered />
    </I18nextProvider>
  )
  // Same language as the prerendered HTML: attach to it; otherwise draw the page fresh in the visitor's language.
  if (root.firstElementChild?.getAttribute('data-lang') === i18n.resolvedLanguage) hydrateRoot(root, element)
  else createRoot(root).render(element)
}

void start()
