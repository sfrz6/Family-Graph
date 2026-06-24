import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the local FastAPI backend during development.
      // In production, the frontend and backend share a domain on Vercel,
      // so this proxy isn't needed there - "/api" resolves directly.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
})
