import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

/** Like Orca's separate vite.web.config: share renderer components and style tokens. */
export default defineConfig({
  root: resolve('src/renderer'),
  publicDir: false,
  base: '/web/',
  plugins: [tailwindcss()],
  resolve: { alias: { '@': resolve('src/renderer/src') } },
  build: {
    outDir: resolve('src/main/pwa/assets/web'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve('src/renderer/pwa.html'),
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunk-[hash].js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'app.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
