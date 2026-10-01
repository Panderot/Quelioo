import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'

import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import ArchivePage from './pages/ArchivePage'
import ArchiveQuizPage from './pages/ArchiveQuizPage'
import CreatePage from './pages/CreatePage'
import NotFoundPage from './pages/NotFoundPage'
import SolvePage from './pages/SolvePage'
import SongsPage from './pages/SongsPage'

export default function App() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  return (
    <div data-purpose="app-viewport" className="flex min-h-screen bg-paper lg:flex-row">
      <Sidebar isMobileOpen={isMobileNavOpen} onCloseMobile={() => setIsMobileNavOpen(false)} />

      <main
        data-purpose="main-layout"
        className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-paper"
      >
        <div
          className="pointer-events-none absolute top-0 right-0 h-[480px] w-[480px] bg-[radial-gradient(circle,rgba(245,165,36,0.08)_0%,rgba(245,165,36,0)_70%)]"
          aria-hidden
        />

        <TopBar onOpenMobileNav={() => setIsMobileNavOpen(true)} />

        <div className="animate-fade-in relative mx-auto w-full max-w-5xl space-y-7 p-6 lg:p-8 xl:p-10">
          <Routes>
            <Route path="/" element={<CreatePage />} />
            <Route path="/solve" element={<SolvePage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/archive/:id" element={<ArchiveQuizPage />} />
            <Route path="/songs" element={<SongsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
