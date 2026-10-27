import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// 展示版建置(demo.html → dist-demo/)。base './' = 資產用相對路徑,放在任何子路徑 / 靜態主機都能開。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'demo.html') },
  },
})
