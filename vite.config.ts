import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

import { solveRequestHandler } from './api/_lib/solve.js'

function solveApiDevMiddleware(): Plugin {
  return {
    name: 'quelio-solve-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/solve', (req, res) => {
        void solveRequestHandler(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), solveApiDevMiddleware()],
})
