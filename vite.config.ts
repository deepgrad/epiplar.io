import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  build: {
    target: 'esnext',
  },
  server: {
    headers: {
      // Use credentialless to allow external images while keeping SharedArrayBuffer support
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
    watch: {
      // Ignore backend directory to prevent WSL file watching issues
      ignored: ['**/backend/**', '**/node_modules/**', '**/.git/**'],
      // Use polling for better WSL compatibility
      usePolling: true,
      interval: 1000,
    },
  },
})
