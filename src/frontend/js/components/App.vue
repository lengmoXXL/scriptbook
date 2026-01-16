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
        <div ref="contentRef" class="markdown-content" v-html="contentHtml"></div>
      </div>
    </main>

    <footer>
      <p>Scriptbook &copy; 2025</p>
    </footer>

    <!-- 终端弹窗 -->
    <TerminalModal
      :visible="modalVisible"
      :title="modalTitle"
      :script-id="modalScriptId"
      :code="modalCode"
      :terminal-theme="currentTerminalTheme"
      @close="closeModal"
      @send-input="onSendInput"
      ref="terminalModalRef"
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
    const currentTerminalTheme = ref(null) // 当前主题的终端配置
    const contentHtml = ref('<p>请从上方选择Markdown文件...</p>')
    const loading = ref(false)
    const error = ref(null)
    const contentRef = ref(null)
    const terminalModalRef = ref(null)

    // 弹窗状态
    const modalVisible = ref(false)
    const modalTitle = ref('')
    const modalScriptId = ref('')
    const modalCode = ref('')
    const modalWs = ref(null) // WebSocket 连接

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

        // 等待 DOM 更新
        await nextTick()
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

      document.querySelectorAll('link[href*="theme-"]').forEach(link => {
        link.remove()
      })

      if (themeName === 'theme-light' || !themeName) {
        document.body.style.backgroundColor = ''
        document.body.style.color = ''
        currentTerminalTheme.value = null
      } else {
        const plugin = pluginList.value.find(p => p.name === themeName)
        if (plugin) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = `/static/plugins/${themeName}/style.css`
          link.setAttribute('data-theme', themeName)
          document.head.appendChild(link)
          // 保存终端主题配置
          currentTerminalTheme.value = plugin.terminalTheme || null
        } else {
          currentTerminalTheme.value = null
        }
      }
    }

    // 关闭弹窗
    const closeModal = () => {
      // 关闭 WebSocket
      if (modalWs.value) {
        modalWs.value.close()
        modalWs.value = null
      }
      modalVisible.value = false
      modalScriptId.value = ''
      modalTitle.value = ''
      modalCode.value = ''
    }

    // 发送输入（键盘输入直接发送）
    const onSendInput = (value) => {
      if (!modalWs.value || modalWs.value.readyState !== 1) return
      modalWs.value.send(JSON.stringify({ type: 'input', content: value }))
    }

    // 执行脚本（打开弹窗）
    window.executeScript = async (scriptId) => {
      console.log('开始执行脚本:', scriptId)
      const block = document.querySelector(`[data-script-id="${scriptId}"]`)
      if (!block) {
        console.error(`找不到脚本块: ${scriptId}`)
        return
      }

      const titleEl = block.querySelector('.script-title')
      const codeEl = block.querySelector('.script-code')
      const title = titleEl ? titleEl.textContent : scriptId
      const code = codeEl ? codeEl.textContent : ''

      // 设置弹窗状态
      modalTitle.value = title
      modalScriptId.value = scriptId
      modalCode.value = code
      modalVisible.value = true

      // 等待弹窗渲染后初始化终端
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      // 获取 TerminalModal 组件实例
      const modal = terminalModalRef.value
      if (!modal) {
        console.error('找不到 TerminalModal 组件')
        return
      }

      // 建立 WebSocket
      const wsUrl = `ws://${window.location.host}/api/scripts/${scriptId}/execute`
      console.log('连接 WebSocket:', wsUrl)

      const ws = new WebSocket(wsUrl)
      modalWs.value = ws
      window.appConnections = window.appConnections || new Map()
      window.appConnections.set(scriptId, ws)

      ws.onopen = () => {
        console.log('WebSocket 已打开:', scriptId)
        modal.writeToTerminal(`=== 开始执行: ${scriptId} ===\r\n`, 'stdout')
        ws.send(JSON.stringify({ code }))
        console.log('代码已发送')
      }

      ws.onmessage = (event) => {
        console.log('收到消息:', scriptId, event.data.slice(0, 150))
        const data = JSON.parse(event.data)
        const { type, content } = data

        modal.writeToTerminal(content, type)

        if (type === 'exit' || type === 'error') {
          console.log('脚本结束:', type)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket 错误:', error)
        modal.writeToTerminal('脚本执行错误\r\n', 'error')
      }

      ws.onclose = () => {
        console.log('WebSocket 已关闭:', scriptId)
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

      closeModal()
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
      switchTheme(savedTheme)

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
      currentTerminalTheme,
      contentHtml,
      loading,
      error,
      contentRef,
      terminalModalRef,
      modalVisible,
      modalTitle,
      modalScriptId,
      modalCode,
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
