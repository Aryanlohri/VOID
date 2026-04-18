import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/cdp': {
        target: 'http://127.0.0.1:9229',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cdp/, '')
      }
    }
  }
})
