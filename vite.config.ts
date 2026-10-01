import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

import { solveRequestHandler } from './api/_lib/solve.js'
import { explainStepRequestHandler } from './api/_lib/explain-step.js'
import { generateRequestHandler } from './api/_lib/generate.js'
import { extractUrlRequestHandler } from './api/_lib/extract-url.js'
import { gradeRequestHandler } from './api/_lib/grade.js'
import { songLyricsRequestHandler } from './api/_lib/song-lyrics.js'
import { songRequestHandler } from './api/_lib/song.js'

function apiDevMiddleware(): Plugin {
  return {
    name: 'quelio-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/solve', (req, res) => {
        void solveRequestHandler(req, res)
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
})
