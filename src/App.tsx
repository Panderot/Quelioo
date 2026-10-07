import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'

import AuthLayout from './components/auth/AuthLayout'
import { ImportPrompt } from './components/auth/ImportDialog'
import RequireAuth, { ConfigMissing } from './components/auth/RequireAuth'
import KeptRoute from './components/KeptRoute'
import RateLimitNotice from './components/RateLimitNotice'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import { isFakeBackend, supabaseConfigured } from './lib/supabase'
import AccountPage from './pages/AccountPage'
import ArchivePage from './pages/ArchivePage'
import ArchiveQuizPage from './pages/ArchiveQuizPage'
import ArchiveSolutionPage from './pages/ArchiveSolutionPage'
import CreatePage from './pages/CreatePage'
import FlashcardDeckPage from './pages/FlashcardDeckPage'
import FlashcardsPage from './pages/FlashcardsPage'
import FlashcardStudyPage from './pages/FlashcardStudyPage'
import LessonPage from './pages/LessonPage'
import LessonsPage from './pages/LessonsPage'
import NotFoundPage from './pages/NotFoundPage'
import OwnerPage from './pages/OwnerPage'
import SolvePage from './pages/SolvePage'
import AuthCallbackPage from './pages/auth/AuthCallbackPage'
import CheckEmailPage from './pages/auth/CheckEmailPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import LegalPage from './pages/auth/LegalPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import SignInPage from './pages/auth/SignInPage'
import SignUpPage from './pages/auth/SignUpPage'
import SongsPage from './pages/SongsPage'

const KEPT_ROUTES = [
  { path: '/', element: <CreatePage /> },
  { path: '/solve', element: <SolvePage /> },
  { path: '/archive/:id', element: <ArchiveQuizPage /> },
  { path: '/songs', element: <SongsPage /> },
  { path: '/flashcards', element: <FlashcardsPage /> },
  { path: '/flashcards/:deckId', element: <FlashcardDeckPage /> },
  { path: '/lessons', element: <LessonsPage /> },
  { path: '/lessons/:id', element: <LessonPage /> },
]

/** Public pages (sign in, sign up, passwords, legal) sit outside the app shell; everything else needs a session. */
export default function App() {
  if (!supabaseConfigured && !isFakeBackend) return <ConfigMissing />
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/check-email" element={<CheckEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/kullanim-sartlari" element={<LegalPage kind="terms" />} />
        <Route path="/gizlilik" element={<LegalPage kind="privacy" />} />
      </Route>
      <Route
        path="*"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

function AppShell() {
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
          {/* Pages that hold unfinished work (photo and crop, forms, results, answers, requests in
              flight, playback) stay mounted while the user visits other pages; <Routes> renders
              nothing for them. Lists that other pages change (Archive) are not kept. */}
          {KEPT_ROUTES.map(({ path, element }) => (
            <KeptRoute key={path} path={path} element={element} />
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
