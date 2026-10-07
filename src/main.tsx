import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App.tsx'
import { initAuth } from './lib/auth/authStore'
import './lib/data/session'
import { initFocusModality } from './lib/focusModality'
import { initSingleAudio } from './lib/singleAudio'

initAuth()
initFocusModality()
initSingleAudio()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
