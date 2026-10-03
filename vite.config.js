import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  // Dev-only: keep the dependency scanner on the app entry — public/store/ is a
  // self-contained static page whose bare "three" import resolves via its own importmap.
  optimizeDeps: { entries: ['index.html'] },
  // React, the router and Sentry change far less often than the app, so they get
  // their own long-lived file the browser keeps across deploys and portals.
  build: {
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom', '@sentry/react'] },
      },
    },
  },
  server: {
    historyApiFallback: true
  }
})