import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        target: 'https://localhost:7298',
        changeOrigin: true,
        secure: false,
      },

      '/hubs': {
        target: 'https://localhost:7298',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})