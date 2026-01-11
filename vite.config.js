import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: 'src/scriptbook/static',
  build: {
    outDir: '../../scriptbook/static/dist',
    assetsDir: 'js',
    emptyOutDir: true
  }
})
