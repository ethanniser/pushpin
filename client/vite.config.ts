import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 8080,
    host: true,
    proxy: {
      // Proxy API requests to the origin-api service
      '/api': {
        target: process.env.PUSHPIN_URL || 'http://localhost:7999',
        changeOrigin: true,
      },
    },
  },
})

