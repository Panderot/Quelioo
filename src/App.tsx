import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import AuthLayout from './components/auth/AuthLayout'
import RequireAuth, { AuthSplash, ConfigMissing } from './components/auth/RequireAuth'
import Landing from './landing/Landing'
import type { LandingLanguage } from './landing/Landing'
import { hasStoredSession, useAuth } from './lib/auth/authStore'
import { isFakeBackend, supabaseConfigured } from './lib/supabase'
import AuthCallbackPage from './pages/auth/AuthCallbackPage'
import CheckEmailPage from './pages/auth/CheckEmailPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import LegalPage from './pages/auth/LegalPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import SignInPage from './pages/auth/SignInPage'
import SignUpPage from './pages/auth/SignUpPage'

// The signed-in app is a separate chunk: a landing-page visitor never downloads it.
const AppShell = lazy(() => import('./AppShell'))
// The student's join page is public and separate too: a phone that only plays a live game never downloads the app shell.
const JoinPage = lazy(() => import('./pages/JoinPage'))

/** Where the landing page lives: "/" follows the visitor's language, the other two are fixed-language copies (also prerendered for search engines). */
const LANDING_PATHS: Record<string, LandingLanguage | undefined> = { '/': undefined, '/en': 'en', '/hyw': 'hyw' }

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
        path="/katil"
        element={
          <Suspense fallback={null}>
            <JoinPage />
          </Suspense>
        }
      />
      <Route
        path="/katil/:code"
        element={
          <Suspense fallback={null}>
            <JoinPage />
          </Suspense>
        }
      />
      <Route path="*" element={<AppOrLanding />} />
    </Routes>
  )
}

/** "/" is the landing page for a signed-out visitor and the app home for a signed-in user; no other page changes. */
function AppOrLanding() {
  const { status } = useAuth()
  const location = useLocation()
  const pathname = location.pathname.replace(/\/+$/, '') || '/'
  const isLandingPath = Object.hasOwn(LANDING_PATHS, pathname)

  if (isLandingPath && status !== 'signedIn') {
    // A saved session means the user is almost surely signed in: wait for it instead of flashing the landing page.
    if (status === 'loading' && hasStoredSession()) return <AuthSplash />
    return <Landing language={LANDING_PATHS[pathname]} />
  }
  if (isLandingPath && pathname !== '/') return <Navigate to="/" replace />
  // The same element for every app path, so moving between pages never remounts the shell (kept pages stay alive).
  return (
    <RequireAuth>
      <Suspense fallback={<AuthSplash />}>
        <AppShell />
      </Suspense>
    </RequireAuth>
  )
}
