import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'

import AppNav from './components/AppNav'
import { ImportPrompt } from './components/auth/ImportDialog'
import KeptRoute from './components/KeptRoute'
import RateLimitNotice from './components/RateLimitNotice'
import { useStudyChrome } from './lib/studyPrefs'
import AccountPage from './pages/AccountPage'
import ArchivePage from './pages/ArchivePage'
import ArchiveQuizPage from './pages/ArchiveQuizPage'
import ArchiveSolutionPage from './pages/ArchiveSolutionPage'
import CreatePage from './pages/CreatePage'
import FlashcardDeckPage from './pages/FlashcardDeckPage'
import FlashcardsPage from './pages/FlashcardsPage'
import FlashcardStudyPage from './pages/FlashcardStudyPage'
import NotFoundPage from './pages/NotFoundPage'
import OwnerPage from './pages/OwnerPage'
import SolvePage from './pages/SolvePage'

const KEPT_ROUTES: { path: string; element: ReactNode; restoreSearch?: boolean }[] = [
  { path: '/', element: <CreatePage /> },
  { path: '/solve', element: <SolvePage /> },
  // Search is part of what the page shows (?mode=study): a plain link to the quiz page must open the quiz page, never a remembered study screen.
  { path: '/archive/:id', element: <ArchiveQuizPage />, restoreSearch: false },
  { path: '/flashcards', element: <FlashcardsPage /> },
  { path: '/flashcards/:deckId', element: <FlashcardDeckPage /> },
]

/** The signed-in app: top bar (tab bar on phones) and the pages (kept ones stay mounted). Loaded lazily so the landing page never downloads it. */
export default function AppShell() {
  // Study mode is a focused screen: it has its own header, so the top bar and tab bar are hidden and the screen is centred on the whole window.
  const studyChrome = useStudyChrome()

  return (
    <div data-purpose="app-viewport" className="flex min-h-screen flex-col bg-paper">
      {!studyChrome.active && <AppNav />}

      <main
        data-purpose="main-layout"
        className={`relative flex min-w-0 flex-1 flex-col bg-paper ${studyChrome.active ? '' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0'}`}
      >
        <div
          className="pointer-events-none absolute top-0 right-0 h-[480px] w-[480px] bg-[radial-gradient(circle,rgba(245,165,36,0.08)_0%,rgba(245,165,36,0)_70%)]"
          aria-hidden
        />

        <div className={`animate-fade-in relative mx-auto w-full max-w-5xl space-y-7 ${studyChrome.active ? 'p-4 sm:p-6 lg:p-8' : 'p-4 sm:p-6 lg:p-8 xl:p-10'}`}>
          {/* Pages that hold unfinished work (photo and crop, forms, results, answers, requests in
              flight, playback) stay mounted while the user visits other pages; <Routes> renders
              nothing for them. Lists that other pages change (Archive) are not kept. */}
          {KEPT_ROUTES.map(({ path, element, restoreSearch }) => (
            <KeptRoute key={path} path={path} element={element} restoreSearch={restoreSearch} />
          ))}
          <Routes>
            {KEPT_ROUTES.map(({ path }) => (
              <Route key={path} path={path} element={null} />
            ))}
            <Route path="/account" element={<AccountPage />} />
            <Route path="/owner" element={<OwnerPage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/archive/solutions/:id" element={<ArchiveSolutionPage />} />
            <Route path="/flashcards/:deckId/study" element={<FlashcardStudyPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
      <ImportPrompt />
      <RateLimitNotice />
    </div>
  )
}
