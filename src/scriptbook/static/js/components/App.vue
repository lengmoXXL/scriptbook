<template>
  <div class="app-container">
    <NavBar
      :files="fileList"
      :plugins="pluginList"
      :current-file="currentFile"
      :current-theme="currentTheme"
      @select-file="selectFile"
      @select-theme="switchTheme"
    />

    <main>
      <div class="content-area">
        <div class="current-file-bar">
          <span v-if="currentFile">当前文件: {{ currentFile }}</span>
          <span v-else>请选择文件</span>
        </div>

        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else ref="contentRef" class="markdown-content" v-html="contentHtml"></div>
      </div>
    </main>

    <footer>
      <p>Scriptbook &copy; 2025</p>
    </footer>
  </div>
</template>

<script>
import { ref, onMounted, watch, nextTick } from 'vue'
import NavBar from './NavBar.vue'

export default {
  name: 'App',
  components: { NavBar },
  setup() {
    const fileList = ref([])
    const pluginList = ref([])
    const currentFile = ref(null)
    const currentTheme = ref('theme-light')
    const contentHtml = ref('<p>请从上方选择Markdown文件...</p>')
    const loading = ref(false)
    const error = ref(null)
    const scripts = ref([])
    const contentRef = ref(null)

    // 加载文件列表
    const loadFileList = async () => {
      try {
        const response = await fetch('/api/markdown/files')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        fileList.value = data.files || []
      } catch (err) {
        console.error('加载文件列表失败:', err)
      }
    }

    // 加载插件列表
    const loadPluginList = async () => {
      try {
        const response = await fetch('/api/plugins')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        pluginList.value = await response.json()
      } catch (err) {
        console.error('加载插件列表失败:', err)
      }
    }

    // 选择文件
    const selectFile = async (filename) => {
      if (!filename) return

      loading.value = true
      error.value = null

      try {
        // 保存到 localStorage
        localStorage.setItem('scriptbook_currentFile', filename)

        const response = await fetch(`/api/markdown/render?file=${encodeURIComponent(filename)}`, {
          cache: 'no-cache'
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const data = await response.json()
        contentHtml.value = data.html
        scripts.value = data.scripts || []
        currentFile.value = filename

        // 等待 DOM 更新后初始化终端
        await nextTick()
        // 再次等待确保 v-html 内容完全渲染
        await new Promise(resolve => setTimeout(resolve, 100))
        console.log('HTML 内容已渲染，查找脚本块...')
        const scriptBlocks = document.querySelectorAll('.script-block')
        console.log(`找到 ${scriptBlocks.length} 个脚本块`)
        scriptBlocks.forEach(block => {
          console.log('脚本块:', block.dataset.scriptId)
        })
        initScriptTerminals()
        restoreScriptResults()
      } catch (err) {
        error.value = `加载文件失败: ${err.message}`
        console.error('选择文件失败:', err)
      } finally {
        loading.value = false
      }
    }

    // 切换主题
    const switchTheme = (themeName) => {
      currentTheme.value = themeName
      localStorage.setItem('scriptbook_theme', themeName)

      // 移除所有已加载的主题样式表
      document.querySelectorAll('link[href*="theme-"]').forEach(link => {
        link.remove()
      })

      // 如果是 theme-light，重置样式
      if (themeName === 'theme-light' || !themeName) {
        document.body.style.backgroundColor = ''
        document.body.style.color = ''
        const mainEl = document.querySelector('main')
        if (mainEl) {
          mainEl.style.backgroundColor = ''
          mainEl.style.color = ''
        }
      } else {
        // 加载新主题的 CSS
        const plugin = pluginList.value.find(p => p.name === themeName)
        if (plugin) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = `/static/plugins/${themeName}/style.css`
          link.setAttribute('data-theme', themeName)
          document.head.appendChild(link)
        }
      }

      // 更新终端主题
      applyTerminalTheme(themeName === 'theme-dark')
    }

    // 应用终端主题
    const applyTerminalTheme = (isDark) => {
      const terminals = document.querySelectorAll('.xterm')
      terminals.forEach(termEl => {
        if (termEl._xterm) {
          const theme = isDark ? {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            cursorAccent: '#1e1e1e',
            selectionBackground: '#264f78'
          } : {
            background: '#ffffff',
            foreground: '#333333',
            cursor: '#333333',
            cursorAccent: '#ffffff',
            selectionBackground: '#b4d5ff'
          }
          termEl._xterm.options.theme = theme
          termEl._xterm.refresh(0, termEl._xterm.rows - 1)
        }
      })
    }

    // 初始化脚本终端
    const initScriptTerminals = () => {
      // 尝试查找脚本块，如果找不到则等待并重试
      const tryFindTerminals = (retries = 5) => {
        const scriptBlocks = document.querySelectorAll('.script-block')
        if (scriptBlocks.length > 0) {
          console.log(`初始化 ${scriptBlocks.length} 个终端`)
          scriptBlocks.forEach(block => {
            const scriptId = block.dataset.scriptId
            if (!scriptId) {
              console.warn('脚本块没有 scriptId:', block)
              return
            }
            createTerminalForScript(scriptId, block)
          })
          restoreScriptResults()
        } else if (retries > 0) {
          console.log(`未找到脚本块，${retries} 次重试...`)
          setTimeout(() => tryFindTerminals(retries - 1), 200)
        } else {
          console.error('无法找到脚本块')
        }
      }
      tryFindTerminals()
    }

    // 创建终端
    const createTerminalForScript = (scriptId, block) => {
      console.log(`创建终端: ${scriptId}`)
      let outputContainer = block.querySelector('.script-output')
      if (!outputContainer) {
        outputContainer = document.createElement('div')
        outputContainer.className = 'script-output'
        outputContainer.id = `output-${scriptId}`
        const scriptCode = block.querySelector('.script-code')
        if (scriptCode) {
          scriptCode.parentNode.insertBefore(outputContainer, scriptCode.nextSibling)
        }
      }

      outputContainer.innerHTML = ''

      // 计算终端尺寸
      const measureEl = document.createElement('div')
      measureEl.style.position = 'fixed'
      measureEl.style.visibility = 'hidden'
      measureEl.style.whiteSpace = 'pre'
      measureEl.style.left = '-9999px'
      measureEl.style.fontFamily = "'SF Mono', 'Menlo', monospace"
      measureEl.style.fontSize = '13px'
      measureEl.textContent = 'W'.repeat(50)
      document.body.appendChild(measureEl)
      const charWidth = measureEl.getBoundingClientRect().width / 50
      document.body.removeChild(measureEl)

      const containerStyle = window.getComputedStyle(outputContainer)
      const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0
      const paddingRight = parseFloat(containerStyle.paddingRight) || 0
      const availableWidth = outputContainer.clientWidth - paddingLeft - paddingRight
      const cols = Math.max(40, Math.floor(availableWidth / charWidth) - 3)
      const rows = 10

      const term = new window.Terminal({
        cursorBlink: false,
        cursorStyle: 'block',
        convertEol: true,
        fontFamily: "'SF Mono', 'Menlo', monospace",
        fontSize: 13,
        theme: {
          background: '#ffffff',
          foreground: '#333333',
          cursor: '#333333',
          cursorAccent: '#ffffff',
          selectionBackground: '#b4d5ff'
        },
        cols,
        rows,
        allowTransparency: true,
        scrollback: 10000,
        wraparoundLinesEnabled: true
      })

      term.open(outputContainer)
      term.write('\x1b[2m执行结果将显示在这里...\x1b[0m\r\n')

      // 保存到 DOM 元素
      outputContainer._xterm = term
      outputContainer._scriptId = scriptId
    }

    // 恢复脚本结果
    const restoreScriptResults = () => {
      if (!currentFile.value) return

      try {
        const storageKey = `scriptResults_${currentFile.value}`
        const savedResults = JSON.parse(localStorage.getItem(storageKey) || '{}')

        Object.keys(savedResults).forEach(scriptId => {
          const results = savedResults[scriptId]
          const outputContainer = document.getElementById(`output-${scriptId}`)

          if (outputContainer && outputContainer._xterm && results.length > 0) {
            const term = outputContainer._xterm
            term.clear()
            results.forEach(result => {
              writeToTerminal(term, result.content, result.type)
            })
          }
        })
      } catch (err) {
        console.error('恢复脚本结果失败:', err)
      }
    }

    // 写入终端
    const writeToTerminal = (term, content, type = 'stdout') => {
      let prefix = ''
      if (type === 'stderr') prefix = '\x1b[31m'
      else if (type === 'stdin') prefix = '\x1b[36m'
      else if (type === 'exit') prefix = '\x1b[33m'

      const suffix = (type === 'stderr' || type === 'exit') ? '\x1b[0m' : ''
      term.write(`${prefix}${content}${suffix}\r\n`)
    }

    // 保存脚本结果
    const saveScriptResult = (scriptId, type, content) => {
      try {
        if (!currentFile.value) return

        const storageKey = `scriptResults_${currentFile.value}`
        const savedResults = JSON.parse(localStorage.getItem(storageKey) || '{}')

        if (!savedResults[scriptId]) savedResults[scriptId] = []

        savedResults[scriptId].push({
          type,
          content,
          timestamp: new Date().toISOString()
        })

        localStorage.setItem(storageKey, JSON.stringify(savedResults))
      } catch (err) {
        console.error('保存脚本结果失败:', err)
      }
    }

    // 执行脚本
    window.executeScript = async (scriptId) => {
      console.log('开始执行脚本:', scriptId)
      const block = document.querySelector(`[data-script-id="${scriptId}"]`)
      if (!block) {
        console.error(`找不到脚本块: ${scriptId}`)
        return
      }
      const codeEl = block.querySelector('.script-code')
      const code = codeEl.textContent

      const outputContainer = document.getElementById(`output-${scriptId}`)
      if (!outputContainer) {
        console.error(`找不到输出容器: output-${scriptId}`)
        return
      }
      const term = outputContainer._xterm
      if (!term) {
        console.error(`终端未初始化: output-${scriptId}`)
        return
      }
      const inputContainer = document.getElementById(`input-container-${scriptId}`)
      const inputEl = document.getElementById(`input-${scriptId}`)

      // 显示输入容器
      if (inputContainer) inputContainer.style.display = 'flex'

      // 输入框事件
      if (inputEl) {
        inputEl.onkeypress = (e) => {
          if (e.key === 'Enter') window.sendInput(scriptId)
        }
      }

      // 更新 UI
      const executeBtn = block.querySelector('.execute-btn')
      const stopBtn = block.querySelector('.stop-btn')
      executeBtn.disabled = true
      executeBtn.textContent = '执行中...'
      stopBtn.disabled = false

      stopBtn.onclick = () => window.stopScript(scriptId)

      // 清空终端
      term.clear()

      // 清除保存的结果
      try {
        const storageKey = `scriptResults_${currentFile.value}`
        const savedResults = JSON.parse(localStorage.getItem(storageKey) || '{}')
        delete savedResults[scriptId]
        localStorage.setItem(storageKey, JSON.stringify(savedResults))
      } catch (err) {}

      // 建立 WebSocket
      const wsUrl = `ws://${window.location.host}/api/scripts/${scriptId}/execute`
      console.log('连接 WebSocket:', wsUrl)
      const ws = new WebSocket(wsUrl)
      window.appConnections = window.appConnections || new Map()
      window.appConnections.set(scriptId, ws)

      ws.onopen = () => {
        console.log('WebSocket 已打开:', scriptId)
        writeToTerminal(term, `=== 开始执行: ${scriptId} ===`, 'stdout')
        ws.send(JSON.stringify({ code }))
        console.log('代码已发送')
      }

      ws.onmessage = (event) => {
        console.log('收到消息:', scriptId, event.data.slice(0, 100))
        const data = JSON.parse(event.data)
        const { type, content } = data
        writeToTerminal(term, content, type)
        saveScriptResult(scriptId, type, content)

        if (type === 'exit' || type === 'error') {
          console.log('脚本结束:', type)
          executeBtn.disabled = false
          executeBtn.textContent = '执行脚本'
          stopBtn.disabled = true
          if (inputContainer) inputContainer.style.display = 'none'
          window.appConnections.delete(scriptId)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket 错误:', scriptId, error)
        writeToTerminal(term, `脚本执行错误`, 'error')
        executeBtn.disabled = false
        executeBtn.textContent = '执行脚本'
        stopBtn.disabled = true
        if (inputContainer) inputContainer.style.display = 'none'
        window.appConnections.delete(scriptId)
      }

      ws.onclose = (event) => {
        console.log('WebSocket 已关闭:', scriptId, 'code:', event.code, 'reason:', event.reason)
        executeBtn.disabled = false
        executeBtn.textContent = '执行脚本'
        stopBtn.disabled = true
        if (inputContainer) inputContainer.style.display = 'none'
        window.appConnections.delete(scriptId)
      }
    }

    // 停止脚本
    window.stopScript = (scriptId) => {
      console.log('停止脚本:', scriptId)

      if (window.appConnections && window.appConnections.has(scriptId)) {
        const ws = window.appConnections.get(scriptId)
        ws.close()
        window.appConnections.delete(scriptId)
      }

      const block = document.querySelector(`[data-script-id="${scriptId}"]`)
      if (block) {
        const executeBtn = block.querySelector('.execute-btn')
        const stopBtn = block.querySelector('.stop-btn')
        if (executeBtn) {
          executeBtn.disabled = false
          executeBtn.textContent = '执行脚本'
        }
        if (stopBtn) stopBtn.disabled = true
      }

      const outputContainer = document.getElementById(`output-${scriptId}`)
      if (outputContainer && outputContainer._xterm) {
        writeToTerminal(outputContainer._xterm, '=== 脚本已被用户停止 ===', 'stdout')
      }

      const inputContainer = document.getElementById(`input-container-${scriptId}`)
      if (inputContainer) inputContainer.style.display = 'none'
    }

    // 复制代码
    window.copyCode = async (scriptId) => {
      const block = document.querySelector(`[data-script-id="${scriptId}"]`)
      const codeEl = block.querySelector('.script-code')
      const code = codeEl.textContent
      try {
        await navigator.clipboard.writeText(code)
        console.log('代码已复制到剪贴板')
      } catch (err) {
        console.error('复制失败:', err)
      }
    }

    // 发送输入
    window.sendInput = (scriptId) => {
      const inputEl = document.getElementById(`input-${scriptId}`)
      if (!inputEl) {
        console.error(`找不到输入框: input-${scriptId}`)
        return
      }
      const inputValue = inputEl.value.trim()
      if (!inputValue) return

      const ws = window.appConnections?.get(scriptId)
      if (!ws) {
        console.error(`脚本 ${scriptId} 没有活动的WebSocket连接 (connections: ${window.appConnections?.size || 0})`)
        console.log('可用连接:', Array.from(window.appConnections?.keys() || []))
        return
      }

      if (ws.readyState !== 1) {
        console.error(`WebSocket 状态不是 OPEN: ${ws.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`)
        return
      }

      try {
        ws.send(JSON.stringify({ type: 'input', content: inputValue }))
        console.log(`成功发送输入到 ${scriptId}:`, inputValue)
        inputEl.value = ''
        inputEl.focus()
      } catch (err) {
        console.error(`发送输入失败: ${err}`)
      }
    }

    onMounted(async () => {
      // 等待 xterm.js 加载
      await new Promise(resolve => {
        if (window.Terminal) resolve()
        else {
          const check = setInterval(() => {
            if (window.Terminal) {
              clearInterval(check)
              resolve()
            }
          }, 100)
          setTimeout(() => {
            clearInterval(check)
            resolve()
          }, 5000)
        }
      })

      await loadFileList()
      await loadPluginList()

      // 恢复主题
      const savedTheme = localStorage.getItem('scriptbook_theme') || 'theme-light'
      currentTheme.value = savedTheme
      if (savedTheme !== 'theme-light') {
        switchTheme(savedTheme)
      }

      // 恢复或选择文件
      const savedFile = localStorage.getItem('scriptbook_currentFile')
      if (savedFile && fileList.value.some(f => f.name === savedFile)) {
        await selectFile(savedFile)
      } else if (fileList.value.length > 0) {
        await selectFile(fileList.value[0].name)
      }
    })

    return {
      fileList,
      pluginList,
      currentFile,
      currentTheme,
      contentHtml,
      loading,
      error,
      selectFile,
      switchTheme
    }
  }
}
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.current-file-bar {
  padding: 10px 15px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px 8px 0 0;
  border: 1px solid var(--border-color, #e0e0e0);
  border-bottom: none;
  color: var(--text-secondary, #666);
  font-size: 14px;
}

.markdown-content {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 0 0 8px 8px;
  padding: 20px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, #666);
}

.error {
  color: #dc3545;
  padding: 20px;
  background: #ffe6e6;
  border-radius: 8px;
}

footer {
  text-align: center;
  padding: 15px;
  color: var(--text-secondary, #666);
  font-size: 14px;
}
</style>
