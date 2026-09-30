import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

import { solveRequestHandler } from './api/_lib/solve.js'
import { generateRequestHandler } from './api/_lib/generate.js'
import { extractUrlRequestHandler } from './api/_lib/extract-url.js'
import { gradeRequestHandler } from './api/_lib/grade.js'

function apiDevMiddleware(): Plugin {
  return {
    name: 'quelio-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/solve', (req, res) => {
        void solveRequestHandler(req, res)
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
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevMiddleware()],
})
