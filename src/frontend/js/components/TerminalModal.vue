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
    }
  },
  emits: ['close', 'send-input'],
  setup(props, { emit }) {
    const terminalContainer = ref(null)
    const term = ref(null)
    const pendingReplay = ref(null)  // 待回放的输出数据
    let resizeObserver = null

    // 从全局 CSS 变量获取当前主题颜色
    const getThemeColors = () => {
      const rootStyles = window.getComputedStyle(document.documentElement)
      return {
        bg: rootStyles.getPropertyValue('--color-background').trim() || '#ffffff',
        headerBg: rootStyles.getPropertyValue('--color-surface-alt').trim() || '#f6f8fa',
        border: rootStyles.getPropertyValue('--color-border').trim() || '#d0d7de',
        text: rootStyles.getPropertyValue('--color-text').trim() || '#24292f',
        textSecondary: rootStyles.getPropertyValue('--color-text-light').trim() || '#57606a'
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
      if (!terminalContainer.value || !window.Terminal) return

      // 如果终端已存在，更新主题并重新附加到 DOM
      if (term.value) {
        // 更新主题配置
        const themeConfig = props.terminalTheme || {}
        const newTheme = {
          background: themeConfig.background || '#1e1e1e',
          foreground: themeConfig.foreground || '#d4d4d4',
          cursor: themeConfig.cursor || '#d4d4d4',
          cursorAccent: themeConfig.cursorAccent || '#1e1e1e',
          selectionBackground: themeConfig.selectionBackground || '#264f78'
        }
        term.value.options.theme = newTheme

        // 应用弹窗主题颜色
        applyThemeColors()

        // 重新附加到 DOM
        try {
          term.value.open(terminalContainer.value)
        } catch (e) {
          // 如果已经附加，忽略错误
        }
        return
      }

      // 如果终端不存在，创建新终端
      if (!term.value) {
        // 获取主题配置
        const themeConfig = props.terminalTheme || {}

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

        term.value.open(container)
        // 暴露 terminal 实例到 window 以便测试 (使用唯一ID)
        const testId = `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        window[testId] = term.value
        container.setAttribute('data-terminal-id', testId)
        term.value.write('\x1b[2m终端已准备...\x1b[0m\r\n')

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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.terminal-modal {
  border-radius: 8px;
  width: 80%;
  max-width: 900px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  background-color: var(--modal-bg, #ffffff);
  border: 1px solid var(--modal-border, #d0d7de);
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
  max-height: 500px;
  overflow: hidden;
}

/* 暗色主题 fallback */
@media (prefers-color-scheme: dark), :global(.theme-github-dark) {
  .terminal-modal {
    --modal-bg: #0d1117;
    --modal-header-bg: #161b22;
    --modal-border: #30363d;
    --modal-text: #c9d1d9;
    --modal-text-secondary: #8b949e;
  }
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
