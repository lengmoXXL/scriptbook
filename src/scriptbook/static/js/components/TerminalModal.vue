<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="terminal-modal-overlay" @click.self="close">
        <div class="terminal-modal">
          <div class="terminal-modal-header">
            <span class="terminal-title">{{ title }}</span>
            <button class="terminal-close-btn" @click="close">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div ref="terminalContainer" class="terminal-container"></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { ref, watch, nextTick, onUnmounted } from 'vue'

export default {
  name: 'TerminalModal',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: '终端'
    },
    scriptId: {
      type: String,
      default: ''
    },
    code: {
      type: String,
      default: ''
    }
  },
  emits: ['close', 'send-input'],
  setup(props, { emit }) {
    const terminalContainer = ref(null)
    const term = ref(null)
    let resizeObserver = null

    // 初始化终端
    const initTerminal = () => {
      if (!terminalContainer.value || !window.Terminal) return

      // 计算终端尺寸
      const container = terminalContainer.value
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

      const paddingLeft = 10
      const paddingRight = 10
      const availableWidth = container.clientWidth - paddingLeft - paddingRight
      const cols = Math.max(60, Math.floor(availableWidth / charWidth) - 3)
      const rows = 15

      // 创建终端
      term.value = new window.Terminal({
        cursorBlink: false,
        cursorStyle: 'block',
        convertEol: true,
        fontFamily: "'SF Mono', 'Menlo', monospace",
        fontSize: 13,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          cursorAccent: '#1e1e1e',
          selectionBackground: '#264f78'
        },
        cols,
        rows,
        allowTransparency: true,
        scrollback: 10000,
        wraparoundLinesEnabled: true
      })

      term.value.open(container)
      // 暴露 terminal 实例到 window 以便测试 (使用唯一ID)
      const testId = `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      window[testId] = term.value
      container.setAttribute('data-terminal-id', testId)
      term.value.write('\x1b[2m终端已准备...\x1b[0m\r\n')

      // 键盘输入处理：直接发送到父组件
      term.value.onData((data) => {
        // 过滤控制字符，只发送实际输入
        // 支持 ASCII 可打印字符和 UTF-8 多字节字符（如中文）
        const isAsciiPrintable = data.length === 1 && data >= ' ' && data <= '~'
        const isUtf8MultiByte = data.length > 1 || (data.charCodeAt(0) > 127)
        if (isAsciiPrintable || isUtf8MultiByte || data === '\r' || data === '\n' || data === '\t' || data.charCodeAt(0) === 127) {
          emit('send-input', data)
        }
      })

      // 测试用：监听全局输入事件
      window.addEventListener('terminal-send-input', (e) => {
        const data = e.detail
        if (term.value) {
          term.value.write(data)
        }
        emit('send-input', data)
      })

      // 设置 ResizeObserver
      resizeObserver = new ResizeObserver(() => {
        if (term.value) {
          const w = container.clientWidth - paddingLeft - paddingRight
          const c = Math.max(60, Math.floor(w / charWidth) - 3)
          term.value.resize(c, rows)
        }
      })
      resizeObserver.observe(container)
    }

    // 写入终端
    const writeToTerminal = (content, type = 'stdout') => {
      if (!term.value) return

      let prefix = ''
      if (type === 'stderr') prefix = '\x1b[31m'
      else if (type === 'stdin') prefix = '\x1b[36m'
      else if (type === 'exit') prefix = '\x1b[33m'

      const suffix = (type === 'stderr' || type === 'exit') ? '\x1b[0m' : ''
      // 不再手动添加 \r\n，让 convertEol 处理
      term.value.write(`${prefix}${content}${suffix}`)
    }

    // 关闭弹窗
    const close = () => {
      emit('close')
    }

    // 清理
    const cleanup = () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (term.value) {
        term.value.dispose()
        term.value = null
      }
    }

    watch(() => props.visible, (visible) => {
      if (visible) {
        nextTick(() => {
          initTerminal()
        })
      } else {
        cleanup()
      }
    })

    onUnmounted(() => {
      cleanup()
    })

    return {
      terminalContainer,
      writeToTerminal,
      close
    }
  }
}
</script>

<style scoped>
.terminal-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.terminal-modal {
  background: #1e1e1e;
  border-radius: 8px;
  width: 80%;
  max-width: 900px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.terminal-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
}

.terminal-title {
  color: #d4d4d4;
  font-size: 14px;
  font-weight: 500;
}

.terminal-close-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-close-btn:hover {
  background: #3d3d3d;
  color: #fff;
}

.terminal-container {
  flex: 1;
  min-height: 300px;
  max-height: 500px;
  overflow: hidden;
  background: #1e1e1e;
}

/* Transition animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .terminal-modal,
.modal-leave-active .terminal-modal {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .terminal-modal,
.modal-leave-to .terminal-modal {
  transform: scale(0.95);
}
</style>
