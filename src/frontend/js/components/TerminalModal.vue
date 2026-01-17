<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="terminal-modal-overlay" @click.self="close">
        <div class="terminal-modal">
          <div class="terminal-modal-header">
            <span class="terminal-title">{{ title }}</span>
            <div class="terminal-actions">
              <button class="terminal-stop-btn" @click="stop" title="停止执行">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
                </svg>
              </button>
              <button class="terminal-close-btn" @click="close">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </div>
          <div ref="terminalContainer" class="terminal-container"></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { ref, watch, nextTick, onUnmounted, onMounted } from 'vue'
import { Terminal } from '@xterm/xterm'

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
    },
    terminalTheme: {
      type: Object,
      default: null
    },
    modalTheme: {
      type: Object,
      default: null
    }
  },
  emits: ['close', 'send-input'],
  setup(props, { emit }) {
    const terminalContainer = ref(null)
    const term = ref(null)
    const pendingReplay = ref(null)  // 待回放的输出数据
    let resizeObserver = null

    // 从插件配置获取弹窗颜色
    const getThemeColors = () => {
      const modalConfig = props.modalTheme || {}
      return {
        bg: modalConfig.bg || '#ffffff',
        headerBg: modalConfig.headerBg || '#f6f8fa',
        border: modalConfig.border || '#d0d7de',
        text: modalConfig.text || '#24292f',
        textSecondary: modalConfig.textSecondary || '#57606a'
      }
    }

    // 应用主题颜色到弹窗 - 通过查询 DOM 获取弹窗元素
    const applyThemeColors = () => {
      // 使用 querySelector 获取弹窗元素（因为 Teleport 到 body，ref 可能不工作）
      const modal = document.querySelector('.terminal-modal')
      if (!modal) return

      const colors = getThemeColors()
      modal.style.setProperty('--modal-bg', colors.bg)
      modal.style.setProperty('--modal-header-bg', colors.headerBg)
      modal.style.setProperty('--modal-border', colors.border)
      modal.style.setProperty('--modal-text', colors.text)
      modal.style.setProperty('--modal-text-secondary', colors.textSecondary)
      modal.style.backgroundColor = colors.bg
      modal.style.borderColor = colors.border
    }

    // 初始化终端
    const initTerminal = () => {
      if (!terminalContainer.value || !Terminal) return

      const container = terminalContainer.value
      const themeConfig = props.terminalTheme || {}

      // 如果终端已存在，先销毁
      if (term.value) {
        term.value.dispose()
        term.value = null
      }

      // 固定的终端尺寸
      const cols = 120  // 终端列数
      const rows = 35
      // xterm.js 默认字体大小13px时，实测行高约为15px
      const charWidth = 9   // 字符宽度（像素）
      const charHeight = 15 // 行高（像素），基于xterm.js实际渲染测量

      // 根据终端尺寸动态设置容器和弹窗大小
      const terminalWidth = cols * charWidth
      const terminalHeight = rows * charHeight

      // 设置容器大小
      container.style.width = `${terminalWidth}px`
      container.style.height = `${terminalHeight}px`

      // 设置弹窗大小
      const modal = document.querySelector('.terminal-modal')
      if (modal) {
        modal.style.width = `${terminalWidth + 32}px`
        modal.style.height = 'auto'
      }

      // 创建终端
      term.value = new Terminal({
        cursorBlink: false,
        cursorStyle: 'block',
        convertEol: true,
        fontFamily: "'SF Mono', 'Menlo', monospace",
        fontSize: 13,
        theme: {
          background: themeConfig.background || '#1e1e1e',
          foreground: themeConfig.foreground || '#d4d4d4',
          cursor: themeConfig.cursor || '#d4d4d4',
          cursorAccent: themeConfig.cursorAccent || '#1e1e1e',
          selectionBackground: themeConfig.selectionBackground || '#264f78'
        },
        cols,
        rows,
        allowTransparency: true,
        scrollback: 10000,
        wraparoundLinesEnabled: true
      })

      console.log('[initTerminal] 终端实例创建完成, 调用 open()')
      term.value.open(container)
      console.log('[initTerminal] open() 完成')

      // 暴露 terminal 实例到 window 以便测试 (使用唯一ID)
      const testId = `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      window[testId] = term.value
      container.setAttribute('data-terminal-id', testId)
      term.value.write('\x1b[2m终端已准备...\x1b[0m\r\n')
      console.log('[initTerminal] 初始化完成')

      // 应用当前主题颜色到弹窗
      applyThemeColors()

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

      // 设置 ResizeObserver（保持固定尺寸，不调整）
      resizeObserver = new ResizeObserver(() => {
        // 终端尺寸固定，不根据容器大小调整
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
      term.value.write(`${prefix}${content}${suffix}`)
    }

    // 回放缓存的输出
    const replayOutput = (outputBuffer) => {
      if (!term.value || !Array.isArray(outputBuffer)) return

      // 应用当前主题颜色到弹窗
      applyThemeColors()

      // 更新终端主题
      const themeConfig = props.terminalTheme || {}
      const newTheme = {
        background: themeConfig.background || '#1e1e1e',
        foreground: themeConfig.foreground || '#d4d4d4',
        cursor: themeConfig.cursor || '#d4d4d4',
        cursorAccent: themeConfig.cursorAccent || '#1e1e1e',
        selectionBackground: themeConfig.selectionBackground || '#264f78'
      }
      term.value.options.theme = newTheme

      // 清空终端并重置
      term.value.clear()
      term.value.reset()

      // 写入所有缓存的输出
      for (const { content, type } of outputBuffer) {
        writeToTerminal(content, type)
      }
    }

    // 关闭弹窗（不终止脚本）
    const close = () => {
      emit('close')
    }

    // 停止执行（关闭弹窗并终止脚本）
    const stop = () => {
      if (props.scriptId) {
        window.stopScript(props.scriptId)
      }
    }

    // 清理
    const cleanup = () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      // 不再销毁终端实例，保留输出历史
      // 如果需要真正清理，需要从父组件调用
      // if (term.value) {
      //   term.value.dispose()
      //   term.value = null
      // }
    }

    // 外部调用的完全清理（组件卸载时）
    window.cleanupTerminalModal = () => {
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
        nextTick(() => initTerminal())
      }
      // 注意：不自动销毁终端，保持输出历史
    })

    // 监听弹窗打开事件，确保主题颜色正确应用
    watch(() => props.visible, (visible) => {
      if (visible) {
        nextTick(() => {
          applyThemeColors()
        })
      }
    })

    // 监听主题变化，更新终端样式
    watch(() => props.terminalTheme, (theme) => {
      if (theme && terminalContainer.value) {
        const bg = theme.background || '#1e1e1e'
        terminalContainer.value.style.setProperty('--terminal-bg', bg)
      }
    }, { immediate: true })

    onMounted(() => {
      if (props.terminalTheme && terminalContainer.value) {
        const bg = props.terminalTheme.background || '#1e1e1e'
        terminalContainer.value.style.setProperty('--terminal-bg', bg)
      }
    })

    onUnmounted(() => {
      cleanup()
    })

    return {
      terminalContainer,
      writeToTerminal,
      replayOutput,
      close,
      stop
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
  z-index: 1000;
}

.terminal-modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 8px;
  width: auto;
  min-width: 600px;
  max-width: 1400px;
  height: auto;
  max-height: none;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: visible;
  background-color: var(--modal-bg, #ffffff);
  border: 1px solid var(--modal-border, #d0d7de);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
}

.terminal-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--modal-header-bg, #f6f8fa);
  border-bottom: 1px solid var(--modal-border, #d0d7de);
}

.terminal-title {
  color: var(--modal-text, #24292f);
  font-size: 14px;
  font-weight: 500;
}

.terminal-actions {
  display: flex;
  gap: 8px;
}

.terminal-stop-btn {
  background: none;
  border: none;
  color: var(--modal-text-secondary, #57606a);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-stop-btn:hover {
  background: rgba(220, 53, 69, 0.1);
  color: #dc3545;
}

.terminal-close-btn {
  background: none;
  border: none;
  color: var(--modal-text-secondary, #57606a);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-close-btn:hover {
  background: var(--modal-border, #d0d7de);
  color: var(--modal-text, #24292f);
}

.terminal-container {
  flex: 1;
  min-height: 300px;
  max-height: none;
  overflow: hidden;
}

/* Transition animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.12s ease-out;
}

.modal-enter-active .terminal-modal,
.modal-leave-active .terminal-modal {
  transition: transform 0.12s ease-out;
  will-change: transform;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .terminal-modal,
.modal-leave-to .terminal-modal {
  transform: translate(-50%, -50%) scale(0.99);
}
</style>
