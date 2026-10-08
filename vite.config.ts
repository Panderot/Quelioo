import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'

import { accountRequestHandler } from './api/_lib/account.js'
import { withAuth } from './api/_lib/with-auth.js'
import { solveRequestHandler } from './api/_lib/solve.js'
import { explainStepRequestHandler } from './api/_lib/explain-step.js'
import { similarRequestHandler } from './api/_lib/similar.js'
import { anotherWayRequestHandler } from './api/_lib/another-way.js'
import { checkWorkRequestHandler } from './api/_lib/check-work.js'
import { generateRequestHandler } from './api/_lib/generate.js'
import { extractUrlRequestHandler } from './api/_lib/extract-url.js'
import { gradeRequestHandler } from './api/_lib/grade.js'
import { songLyricsRequestHandler } from './api/_lib/song-lyrics.js'
import { songRequestHandler } from './api/_lib/song.js'
import { cardsRequestHandler } from './api/_lib/cards.js'
import { solveToolsRequestHandler } from './api/_lib/solve-tools.js'
import { lessonRequestHandler } from './api/_lib/lesson.js'

/** The same account check as production (api/*.ts): AI endpoints answer 401 without a valid token. */
const protect = withAuth

function apiDevMiddleware(): Plugin {
  return {
    name: 'quelio-api-dev-middleware',
    configureServer(server) {
      // Production routes these four through /api/solve-tools (vercel.json rewrites); same handlers.
      server.middlewares.use('/api/solve-tools', (req, res) => {
        void protect(solveToolsRequestHandler)(req, res)
      })
      server.middlewares.use('/api/account', (req, res) => {
        void accountRequestHandler(req, res)
      })
      server.middlewares.use('/api/lesson', (req, res) => {
        void protect(lessonRequestHandler)(req, res)
      })
      server.middlewares.use('/api/cards', (req, res) => {
        void protect(cardsRequestHandler)(req, res)
      })
      server.middlewares.use('/api/solve', (req, res) => {
        void protect(solveRequestHandler)(req, res)
      })
      server.middlewares.use('/api/similar', (req, res) => {
        void protect(similarRequestHandler)(req, res)
      })
      server.middlewares.use('/api/another-way', (req, res) => {
        void protect(anotherWayRequestHandler)(req, res)
      })
      server.middlewares.use('/api/check-work', (req, res) => {
        void protect(checkWorkRequestHandler)(req, res)
      })
      server.middlewares.use('/api/explain-step', (req, res) => {
        void protect(explainStepRequestHandler)(req, res)
      })
      server.middlewares.use('/api/generate', (req, res) => {
        void protect(generateRequestHandler)(req, res)
      })
      server.middlewares.use('/api/extract-url', (req, res) => {
        void protect(extractUrlRequestHandler)(req, res)
      })
      server.middlewares.use('/api/grade', (req, res) => {
        void protect(gradeRequestHandler)(req, res)
      })
      server.middlewares.use('/api/song-lyrics', (req, res) => {
        void protect(songLyricsRequestHandler)(req, res)
      })
      server.middlewares.use('/api/song', (req, res) => {
        void protect(songRequestHandler)(req, res)
      })
    },
  }
}

/** Commit being built: Vercel's own variable in production builds, git locally ("dev" outside a repo). */
function buildCommit(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

/**
 * Lets anyone confirm which commit production serves without Vercel access: a
 * <meta name="quelio-commit"> tag in index.html and a static /version.json (not a function).
 */
function buildVersionPlugin(): Plugin {
  const commit = buildCommit()
  return {
    name: 'quelio-build-version',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'quelio-commit', content: commit }, injectTo: 'head' }],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The dev server's /api handlers read process.env: hand them the Supabase settings (token checks,
  // usage log) from .env.local without exposing the LLM keys the way a full load would.
  const fileEnv = loadEnv(mode, process.cwd(), '')
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
    if (!process.env[key] && fileEnv[key]) process.env[key] = fileEnv[key]
  }
  return {
    plugins: [react(), tailwindcss(), apiDevMiddleware(), buildVersionPlugin()],
    // Two pages: the app (index.html) and the light landing entry (landing.html, prerendered by scripts/prerender.mjs).
    build: { rollupOptions: { input: { index: 'index.html', landing: 'landing.html' } } },
    // Only reached via a lazy import (the similar-problem answer check); pre-bundle it so the dev
    // server doesn't discover it mid-session and reload the page.
    optimizeDeps: { include: ['mathjs/number'] },
    // The Playwright dev server runs without HMR: when a busy machine drops the HMR socket, Vite's client
    // reloads the page and wipes the state of whatever test is running.
    server: { hmr: process.env.QUELIO_NO_HMR ? false : undefined },
  }
})
