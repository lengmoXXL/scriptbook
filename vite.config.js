import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

// 构建完成后复制静态文件目录
const copyStaticFiles = () => {
  const projectRoot = process.cwd()
  const distDir = path.join(projectRoot, 'dist')
  const srcDir = path.join(projectRoot, 'src/frontend')

  return {
    name: 'copy-static-files',
    configureServer(server) {
      // 开发模式下，监听文件变化
      const watchDirs = [
        path.join(srcDir, 'css'),
        path.join(srcDir, 'js/lib'),
        path.join(srcDir, 'plugins')
      ]
      watchDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          server.watcher.add(dir)
          server.watcher.on('change', () => copyStaticDirs())
        }
      })
    },
    closeBundle() {
      copyStaticDirs()
    }
  }
}

function copyStaticDirs() {
  const projectRoot = process.cwd()
  const distDir = path.join(projectRoot, 'dist')
  const srcDir = path.join(projectRoot, 'src/frontend')

  // 复制 css 目录
  const srcCssDir = path.join(srcDir, 'css')
  const destCssDir = path.join(distDir, 'css')
  if (fs.existsSync(srcCssDir)) {
    if (fs.existsSync(destCssDir)) {
      fs.rmSync(destCssDir, { recursive: true })
    }
    fs.cpSync(srcCssDir, destCssDir, { recursive: true })
    console.log('CSS copied to dist/css')
  }

  // 复制 js/lib 目录
  const srcLibDir = path.join(srcDir, 'js/lib')
  const destLibDir = path.join(distDir, 'js/lib')
  if (fs.existsSync(srcLibDir)) {
    if (fs.existsSync(destLibDir)) {
      fs.rmSync(destLibDir, { recursive: true })
    }
    fs.cpSync(srcLibDir, destLibDir, { recursive: true })
    console.log('JS/lib copied to dist/js/lib')
  }

  // 复制 plugins 目录
  const srcPluginsDir = path.join(srcDir, 'plugins')
  const destPluginsDir = path.join(distDir, 'plugins')
  if (fs.existsSync(srcPluginsDir)) {
    if (fs.existsSync(destPluginsDir)) {
      fs.rmSync(destPluginsDir, { recursive: true })
    }
    fs.cpSync(srcPluginsDir, destPluginsDir, { recursive: true })
    console.log('Plugins copied to dist/plugins')
  }
}

export default defineConfig({
  plugins: [vue(), copyStaticFiles()],
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
