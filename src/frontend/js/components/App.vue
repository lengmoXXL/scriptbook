<template>
  <div class="app-container" :class="currentTheme">
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
        <div ref="contentRef" class="markdown-content" v-html="contentHtml"></div>
      </div>
    </main>

    <footer>
      <p>Scriptbook &copy; 2025</p>
    </footer>

    <!-- 终端弹窗列表 -->
    <TerminalModal
      v-for="[scriptId, terminal] in activeTerminals"
      :key="scriptId"
      :visible="terminal.visible"
      :title="terminal.title"
      :script-id="scriptId"
      :code="terminal.code"
      :terminal-theme="currentTerminalTheme"
      :modal-theme="currentModalTheme"
      :ref="el => setTerminalRef(scriptId, el)"
      @close="closeModal(scriptId)"
      @send-input="onSendInput(scriptId, $event)"
    />
  </div>
</template>

<script>
import { ref, onMounted, nextTick } from 'vue'
import NavBar from './NavBar.vue'
import TerminalModal from './TerminalModal.vue'

export default {
  name: 'App',
  components: { NavBar, TerminalModal },
  setup() {
    const fileList = ref([])
    const pluginList = ref([])
    const currentFile = ref(null)
    const currentTheme = ref('theme-light')
    const currentTerminalTheme = ref(null)
    const currentModalTheme = ref(null)
    const contentHtml = ref('<p>请从上方选择Markdown文件...</p>')
    const loading = ref(false)
    const error = ref(null)
    const contentRef = ref(null)

    // 脚本状态管理: scriptId -> { status, exitCode, timestamp }
    const scriptStates = ref({})

    // 终端输出缓存: scriptId -> [{content, type}, ...]
    const scriptOutputBuffers = ref({})

    // 活跃终端: scriptId -> { visible, title, code, ws }
    const activeTerminals = ref(new Map())
    const terminalRefs = ref(new Map())

    // 暴露到 window 供测试使用
    window.scriptOutputBuffers = scriptOutputBuffers.value

    // 设置终端组件引用
    const setTerminalRef = (scriptId, el) => {
      if (el) {
        terminalRefs.value.set(scriptId, el)
      } else {
        terminalRefs.value.delete(scriptId)
      }
    }

    // 获取终端组件实例
    const getTerminalRef = (scriptId) => {
      return terminalRefs.value.get(scriptId)
    }

    // 更新脚本状态
    const updateScriptState = (scriptId, status, exitCode = null) => {
      scriptStates.value[scriptId] = {
        status,
        exitCode,
        timestamp: Date.now()
      }

      // 更新 DOM 按钮状态
      const block = document.querySelector(`[data-script-id="${scriptId}"]`)
      if (block) {
        const resultBtn = block.querySelector('.result-btn')

        if (resultBtn) {
          resultBtn.setAttribute('data-status', status)
          resultBtn.textContent = getStatusText(scriptId, status)
          resultBtn.disabled = status === 'idle'
        }
      }
    }

    // 获取状态文本
    const getStatusText = (scriptId, status) => {
      switch (status) {
        case 'idle':
        case 'running':
          return 'terminal'
        case 'completed':
          return 'terminal ✓'
        case 'failed':
          return 'terminal ✗'
        default:
          return 'terminal'
      }
    }

    // 初始化脚本状态显示
    const initScriptStates = () => {
      for (const [scriptId, state] of Object.entries(scriptStates.value)) {
        const block = document.querySelector(`[data-script-id="${scriptId}"]`)
        if (block) {
          const btn = block.querySelector('.result-btn')
          if (btn) {
            btn.setAttribute('data-status', state.status)
            btn.textContent = getStatusText(scriptId, state.status)
            btn.disabled = state.status === 'idle'
          }
        }
      }
    }

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
        localStorage.setItem('scriptbook_currentFile', filename)

        const response = await fetch(`/api/markdown/render?file=${encodeURIComponent(filename)}`, {
          cache: 'no-cache'
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const data = await response.json()
        contentHtml.value = data.html
        currentFile.value = filename

        await nextTick()
        initScriptStates()
      } catch (err) {
        error.value = `加载文件失败: ${err.message}`
        console.error('选择文件失败:', err)
      } finally {
        loading.value = false
      }
    }

    // 切换主题
    const switchTheme = async (themeName) => {
      currentTheme.value = themeName
      localStorage.setItem('scriptbook_theme', themeName)

      document.querySelectorAll('link[href*="theme-"]').forEach(link => {
        link.remove()
      })

      const plugin = pluginList.value.find(p => p.name === themeName)

      if (plugin) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `/static/plugins/${themeName}/style.css`
        link.setAttribute('data-theme', themeName)
        document.head.appendChild(link)
        currentTerminalTheme.value = plugin.terminalTheme || null
        currentModalTheme.value = plugin.modalTheme || null
      }

      await nextTick()
    }

    // 打开终端
    const openTerminal = (scriptId, title, code) => {
      const terminal = activeTerminals.value.get(scriptId) || {
        visible: false,
        title: '',
        code: '',
        ws: null
      }
      terminal.visible = true
      terminal.title = title
      terminal.code = code
      activeTerminals.value.set(scriptId, terminal)
    }

    // 关闭终端
    const closeModal = (scriptId) => {
      const terminal = activeTerminals.value.get(scriptId)
      if (terminal) {
        if (terminal.ws) {
          terminal.ws.close()
        }
        activeTerminals.value.delete(scriptId)
      }
      terminalRefs.value.delete(scriptId)
    }

    // 发送输入
    const onSendInput = (scriptId, value) => {
      const terminal = activeTerminals.value.get(scriptId)
      if (!terminal?.ws || terminal.ws.readyState !== 1) return
      terminal.ws.send(JSON.stringify({ type: 'input', content: value }))
    }

    // 执行脚本
    window.executeScript = async (scriptId) => {
      const block = document.querySelector(`[data-script-id="${scriptId}"]`)
      if (!block) {
        console.error(`找不到脚本块: ${scriptId}`)
        return
      }

      const titleEl = block.querySelector('.script-title')
      const codeEl = block.querySelector('.script-code')
      const title = titleEl ? titleEl.textContent : scriptId
      const code = codeEl ? codeEl.textContent : ''

      // 清理旧缓冲区
      scriptOutputBuffers.value[scriptId] = []

      // 更新状态
      updateScriptState(scriptId, 'running')

      // 打开终端
      openTerminal(scriptId, title, code)

      // 建立 WebSocket
      const wsUrl = `ws://${window.location.host}/api/scripts/${scriptId}/execute`
      console.log('连接 WebSocket:', wsUrl)

      const ws = new WebSocket(wsUrl)

      // 更新终端的 WebSocket 引用
      const terminal = activeTerminals.value.get(scriptId)
      if (terminal) {
        terminal.ws = ws
      }

      ws.onopen = () => {
        console.log('WebSocket 已打开:', scriptId)

        // 等待弹窗渲染后初始化终端
        nextTick(() => {
          setTimeout(() => {
            const modal = getTerminalRef(scriptId)
            if (modal) {
              modal.writeToTerminal(`=== 开始执行: ${scriptId} ===\r\n`, 'stdout')
              ws.send(JSON.stringify({ code }))
              console.log('代码已发送')
            }
          }, 100)
        })
      }

      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data)
        const { type, content } = data

        // 缓存输出
        if (!scriptOutputBuffers.value[scriptId]) {
          scriptOutputBuffers.value[scriptId] = []
        }
        scriptOutputBuffers.value[scriptId].push({ content, type })

        // 写入终端
        const modal = getTerminalRef(scriptId)
        if (modal) {
          modal.writeToTerminal(content, type)
        }

        // 脚本结束
        if (type === 'exit') {
          updateScriptState(scriptId, 'completed', data.exitCode || 0)
        } else if (type === 'error') {
          updateScriptState(scriptId, 'failed', 1)
        }
      })

      ws.onerror = (error) => {
        console.error('WebSocket 错误:', error)
        updateScriptState(scriptId, 'failed')
      }

      ws.onclose = () => {
        console.log('WebSocket 已关闭:', scriptId)
      }
    }

    // 显示终端
    window.showTerminal = async (scriptId) => {
      const block = document.querySelector(`[data-script-id="${scriptId}"]`)
      if (!block) {
        console.error(`找不到脚本块: ${scriptId}`)
        return
      }

      const titleEl = block.querySelector('.script-title')
      const codeEl = block.querySelector('.script-code')
      const title = titleEl ? titleEl.textContent : scriptId
      const code = codeEl ? codeEl.textContent : ''

      // 打开终端
      openTerminal(scriptId, title, code)

      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const modal = getTerminalRef(scriptId)
      if (!modal) {
        console.error('找不到 TerminalModal 组件')
        return
      }

      // 优先使用本地缓存
      const localBuffer = scriptOutputBuffers.value[scriptId]
      if (localBuffer && localBuffer.length > 0) {
        await modal.replayOutput(localBuffer)
      } else {
        // 从后端获取
        try {
          const statusResponse = await fetch(`/api/scripts/${scriptId}/status`)
          if (!statusResponse.ok) throw new Error('获取状态失败')

          const statusData = await statusResponse.json()
          const { status, exit_code, cached_output } = statusData

          updateScriptState(scriptId, status, exit_code)

          if (cached_output && cached_output.length > 0) {
            scriptOutputBuffers.value[scriptId] = cached_output
            await modal.replayOutput(cached_output)
          } else {
            await modal.replayOutput([])
          }
        } catch (err) {
          console.error('获取脚本状态失败:', err)
          await modal.replayOutput([])
        }
      }

      // 订阅现有 WebSocket 消息
      const terminal = activeTerminals.value.get(scriptId)
      if (terminal?.ws) {
        terminal.ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          modal.writeToTerminal(data.content, data.type)
        }
      }
    }

    // 停止脚本
    window.stopScript = (scriptId) => {
      console.log('停止脚本:', scriptId)

      const terminal = activeTerminals.value.get(scriptId)
      if (terminal?.ws) {
        terminal.ws.close()
      }

      updateScriptState(scriptId, 'failed')
      closeModal(scriptId)
    }

    // 恢复正在运行的脚本
    const restoreRunningScripts = async () => {
      try {
        const response = await fetch('/api/scripts')
        if (!response.ok) return

        const allScripts = await response.json()
        if (!allScripts || allScripts.length === 0) return

        console.log('恢复脚本状态:', allScripts)

        for (const script of allScripts) {
          const { script_id, status } = script

          // 只处理正在运行的脚本
          if (status !== 'running') continue

          try {
            const block = document.querySelector(`[data-script-id="${script_id}"]`)
            if (!block) continue

            // 获取脚本标题
            const titleEl = block.querySelector('.script-title')
            const title = titleEl ? titleEl.textContent : script_id

            const wsUrl = `ws://${window.location.host}/api/scripts/${script_id}/execute`
            const ws = new WebSocket(wsUrl)

            // 打开终端（不传递 code，进入附加模式）
            openTerminal(script_id, title, '')

            // 设置 WebSocket
            const terminal = activeTerminals.value.get(script_id)
            if (terminal) {
              terminal.ws = ws
            }

            ws.onopen = () => {
              console.log('附加到正在运行的脚本:', script_id)
              // 发送空 code 进入附加模式，由后端恢复历史输出
              ws.send(JSON.stringify({}))
            }

            ws.addEventListener('message', (event) => {
              const data = JSON.parse(event.data)
              const { type, content } = data

              if (!scriptOutputBuffers.value[script_id]) {
                scriptOutputBuffers.value[script_id] = []
              }
              scriptOutputBuffers.value[script_id].push({ content, type })

              const modal = getTerminalRef(script_id)
              if (modal) {
                modal.writeToTerminal(content, type)
              }

              if (type === 'exit') {
                updateScriptState(script_id, 'completed', data.exitCode || 0)
              } else if (type === 'error') {
                updateScriptState(script_id, 'failed', 1)
              }
            })

            ws.onerror = (error) => {
              console.error('WebSocket 错误:', error)
              updateScriptState(script_id, 'failed')
            }

            ws.onclose = () => {
              console.log('WebSocket 已关闭:', script_id)
            }
          } catch (err) {
            console.error(`恢复脚本 ${script_id} 失败:`, err)
          }
        }
      } catch (err) {
        console.error('恢复脚本失败:', err)
      }
    }

    onMounted(async () => {
      await loadFileList()
      await loadPluginList()

      const savedTheme = localStorage.getItem('scriptbook_theme') || 'theme-github'
      switchTheme(savedTheme)

      const savedFile = localStorage.getItem('scriptbook_currentFile')
      if (savedFile && fileList.value.some(f => f.name === savedFile)) {
        await selectFile(savedFile)
      } else if (fileList.value.length > 0) {
        await selectFile(fileList.value[0].name)
      }

      await restoreRunningScripts()
    })

    // 暴露方法到 window
    window.selectFile = selectFile
    window.switchTheme = switchTheme
    window.pluginList = pluginList.value
    window.activeTerminals = activeTerminals

    return {
      fileList,
      pluginList,
      currentFile,
      currentTheme,
      currentTerminalTheme,
      currentModalTheme,
      contentHtml,
      loading,
      error,
      contentRef,
      activeTerminals,
      setTerminalRef,
      selectFile,
      switchTheme,
      closeModal,
      onSendInput
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

<style>
/* 全局重置 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  line-height: 1.15;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Markdown基础样式 */
.markdown-content {
  line-height: 1.8;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  margin: 1.5rem 0 1rem;
}

.markdown-content h1 { font-size: 2rem; }
.markdown-content h2 { font-size: 1.5rem; }
.markdown-content h3 { font-size: 1.25rem; }

.markdown-content p {
  margin: 1rem 0;
}

.markdown-content code {
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content pre {
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  margin: 1rem 0;
}

.markdown-content pre code {
  background: none;
  padding: 0;
}

/* 脚本块基础结构 */
.script-block {
  margin: 0.5rem 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid;
}

.script-header {
  padding: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid;
  gap: 0.5rem;
  flex-wrap: nowrap;
}

.script-header .script-info {
  flex: 1;
  min-width: 0;
}

.script-header .script-actions {
  display: flex !important;
  gap: 0.3rem;
  padding: 0;
  background: none;
  border: none;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.script-header .script-actions button {
  flex-shrink: 0;
}

.script-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
}

.script-title {
  font-weight: 500;
  font-size: 0.9rem;
  line-height: 1.2;
}

.script-language {
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
}

.script-actions {
  display: none !important;
}

.script-actions button {
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  border-radius: 3px;
  border: 1px solid;
  background-color: #fff;
  color: #333;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-block !important;
  visibility: visible !important;
  box-shadow: none;
}

.script-actions button:hover {
  background-color: #f0f0f0;
}

.execute-btn {
  background-color: #28a745;
  color: white;
  border-color: #28a745;
  box-shadow: none;
}

.execute-btn:hover:not(:disabled) {
  background-color: #218838;
  border-color: #1e7e34;
}

.execute-btn:disabled {
  background-color: #6c757d;
  color: #fff;
  border-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
  box-shadow: none;
}

/* 执行结果按钮 */
.result-btn {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}

.result-btn:hover:not(:disabled) {
  background-color: #5a6268;
  border-color: #545b62;
}

.result-btn:disabled {
  background-color: #e9ecef;
  color: #adb5bd;
  border-color: #dee2e6;
  cursor: not-allowed;
}

.result-btn[data-status="completed"] {
  background-color: #28a745;
  border-color: #28a745;
}

.result-btn[data-status="failed"] {
  background-color: #dc3545;
  border-color: #dc3545;
}

.stop-btn {
  background-color: #dc3545;
  color: white;
  border-color: #dc3545;
  display: inline-block;
  visibility: visible;
  opacity: 1;
  font-weight: bold;
  box-shadow: none;
}

.stop-btn:hover:not(:disabled) {
  background-color: #c82333;
  border-color: #c82333;
}

.stop-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.script-code {
  padding: 0.75rem;
  overflow-x: auto;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.3;
  text-rendering: optimizeLegibility;
}

/* 输出区域基础结构 */
.script-output {
  position: relative;
  min-height: 100px;
  max-height: 400px;
  height: auto;
  overflow-y: auto;
  border-top: 1px solid;
  padding: 0.5rem;
}

.script-output.has-overflow {
  max-height: 400px;
  overflow-y: auto;
}

.script-output .output-placeholder {
  padding: 2rem;
  text-align: center;
  font-style: italic;
}

.script-output .output-line {
  padding: 0 0.5rem;
  display: flex;
  gap: 0.3rem;
  align-items: baseline;
}

.script-output .timestamp {
  font-size: 0.8rem;
  min-width: 80px;
  flex-shrink: 0;
  padding-top: 0;
}

.script-output .content {
  flex: 1;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.1;
  white-space: pre-wrap;
  word-break: break-word;
}

/* xterm.js 终端容器样式 */
.script-output .xterm {
  padding: 8px;
  min-height: 100px;
  max-width: 100%;
}

.script-output.has-overflow .xterm {
  max-height: 400px;
  overflow: visible;
}

.script-output.has-overflow .xterm .xterm-viewport {
  overflow: hidden !important;
}

/* 自定义滚动条样式 */
.script-output.has-overflow::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.script-output.has-overflow::-webkit-scrollbar-track {
  background: transparent;
}

.script-output.has-overflow::-webkit-scrollbar-thumb {
  background-color: rgba(128, 128, 128, 0.4);
  border-radius: 4px;
}

.script-output.has-overflow::-webkit-scrollbar-thumb:hover {
  background-color: rgba(128, 128, 128, 0.6);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .controls {
    flex-direction: column;
    align-items: stretch;
  }

  .controls select,
  .controls button {
    width: 100%;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .script-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .script-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
