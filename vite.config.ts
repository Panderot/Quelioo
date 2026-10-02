import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

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

function apiDevMiddleware(): Plugin {
  return {
    name: 'quelio-api-dev-middleware',
    configureServer(server) {
      // Production routes these four through /api/solve-tools (vercel.json rewrites); same handlers.
      server.middlewares.use('/api/solve-tools', (req, res) => {
        void solveToolsRequestHandler(req, res)
      })
      server.middlewares.use('/api/lesson', (req, res) => {
        void lessonRequestHandler(req, res)
      })
      server.middlewares.use('/api/cards', (req, res) => {
        void cardsRequestHandler(req, res)
      })
      server.middlewares.use('/api/solve', (req, res) => {
        void solveRequestHandler(req, res)
      })
      server.middlewares.use('/api/similar', (req, res) => {
        void similarRequestHandler(req, res)
      })
      server.middlewares.use('/api/another-way', (req, res) => {
        void anotherWayRequestHandler(req, res)
      })
      server.middlewares.use('/api/check-work', (req, res) => {
        void checkWorkRequestHandler(req, res)
      })
      server.middlewares.use('/api/explain-step', (req, res) => {
        void explainStepRequestHandler(req, res)
      })
      server.middlewares.use('/api/generate', (req, res) => {
        void generateRequestHandler(req, res)
      })
      server.middlewares.use('/api/extract-url', (req, res) => {
        void extractUrlRequestHandler(req, res)
      })
      server.middlewares.use('/api/grade', (req, res) => {
        void gradeRequestHandler(req, res)
      })
      server.middlewares.use('/api/song-lyrics', (req, res) => {
        void songLyricsRequestHandler(req, res)
      })
      server.middlewares.use('/api/song', (req, res) => {
        void songRequestHandler(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevMiddleware()],
  // Only reached via a lazy import (the similar-problem answer check); pre-bundle it so the dev
  // server doesn't discover it mid-session and reload the page.
  optimizeDeps: { include: ['mathjs/number'] },
})
