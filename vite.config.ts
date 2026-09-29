import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

import { solveRequestHandler } from './api/_lib/solve.js'
import { generateRequestHandler } from './api/_lib/generate.js'

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
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevMiddleware()],
})
