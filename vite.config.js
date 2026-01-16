import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

// 构建完成后复制 plugins 目录
const copyPlugins = () => {
  const projectRoot = process.cwd()
  const distDir = path.join(projectRoot, 'dist')
  const srcPluginsDir = path.join(projectRoot, 'src/frontend/plugins')

  return {
    name: 'copy-plugins',
    configureServer(server) {
      // 开发模式下，监听文件变化
      server.watcher.add(srcPluginsDir)
      server.watcher.on('change', () => {
        const destPluginsDir = path.join(distDir, 'plugins')
        if (fs.existsSync(destPluginsDir)) {
          fs.rmSync(destPluginsDir, { recursive: true })
        }
        fs.cpSync(srcPluginsDir, destPluginsDir, { recursive: true })
        console.log('Plugins synced to dist/plugins')
      })
    },
    closeBundle() {
      // 在所有 bundle 完成后复制
      if (fs.existsSync(srcPluginsDir)) {
        const destPluginsDir = path.join(distDir, 'plugins')
        if (fs.existsSync(destPluginsDir)) {
          fs.rmSync(destPluginsDir, { recursive: true })
        }
        fs.cpSync(srcPluginsDir, destPluginsDir, { recursive: true })
        console.log('Plugins copied to dist/plugins')
      }
    }
  }
}

export default defineConfig({
  plugins: [vue(), copyPlugins()],
  root: 'src/frontend',
  build: {
    outDir: '../../dist',
    assetsDir: 'js',
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
