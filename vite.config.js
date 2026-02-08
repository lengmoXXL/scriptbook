import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  root: 'src/frontend',
  plugins: [vue()],
  server: {
    port: 7771,
  },
  optimizeDeps: {
    include: ['smol-toml'],
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  },
})
