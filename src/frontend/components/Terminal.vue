<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'

const props = defineProps({
  wsUrl: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['error'])

const DEFAULT_THEME = {
  background: '#1e1e1e',
  foreground: '#f0f0f0',
  cursor: '#00ff00'
}

const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'

const terminalContainer = ref(null)
const isConnected = ref(false)

let term = null
let fitAddon = null
let resizeObserver = null
let socket = null
let terminalClickHandler = null

function focus() {
  if (term) {
    term.focus()
  }
}

defineExpose({ sendCommand, focus })

function cleanup() {
  if (socket) {
    socket.close()
    socket = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (terminalContainer.value && terminalClickHandler) {
    terminalContainer.value.removeEventListener('click', terminalClickHandler)
    terminalClickHandler = null
  }
  isConnected.value = false
}

onMounted(() => {
  initTerminal()

  resizeObserver = new ResizeObserver(() => {
    fitAddon.fit()
  })
  resizeObserver.observe(terminalContainer.value)

  setTimeout(() => {
    fitAddon.fit()
    connectWebSocket()
  }, 100)
})

onUnmounted(() => {
  cleanup()
})

watch(() => props.wsUrl, (newUrl, oldUrl) => {
  if (newUrl && newUrl !== oldUrl) {
    console.log('wsUrl changed, reconnecting:', oldUrl, '->', newUrl)
    cleanup()
    term.reset()
    setTimeout(() => {
      connectWebSocket()
    }, 100)
  }
})

function initTerminal() {
  if (!terminalContainer.value) {
    throw new Error('Terminal container missing: terminalContainer is null')
  }

  term = new Terminal({
    cursorBlink: true,
    theme: DEFAULT_THEME,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())
  term.loadAddon(new ClipboardAddon())

  term.open(terminalContainer.value)
  fitAddon.fit()

  terminalClickHandler = () => term.focus()
  terminalContainer.value.addEventListener('click', terminalClickHandler)

  term.onData((data) => {
    sendStdin(data)
  })

  term.onResize((size) => {
    sendTerminalSize(size.rows, size.cols)
  })
}

function connectWebSocket() {
  socket = new WebSocket(props.wsUrl)

  socket.onopen = () => {
    isConnected.value = true
    console.log('WebSocket connected')
  }

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Unexpected server message format')
      }

      const messageType = data[0]

      if (messageType === 'setup') {
        console.log('Terminal ready')
        fitAddon.fit()
        console.log('Sending terminal size:', term.rows, 'x', term.cols)
        sendTerminalSize(term.rows, term.cols)
        return
      }

      if (messageType === 'stdout' || messageType === 'stderr') {
        term.write(data[1])
      } else {
        throw new Error(`Unknown message type: ${messageType}`)
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
      emit('error', error.message)
    }
  }

  socket.onerror = (error) => {
    console.error('WebSocket error:', error)
    emit('error', 'Connection failed')
  }

  socket.onclose = (event) => {
    console.log('WebSocket closed:', event.code, event.reason)
    isConnected.value = false
    if (event.code !== 1000 && event.code !== 1001) {
      emit('error', event.reason || `Connection closed (${event.code})`)
    }
  }
}

function sendStdin(data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    emit('error', 'Cannot send data: WebSocket not connected')
    return false
  }
  socket.send(JSON.stringify(['stdin', data]))
  return true
}

function sendTerminalSize(rows, cols) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    emit('error', 'Cannot send terminal size: WebSocket not connected')
    return false
  }
  socket.send(JSON.stringify(['set_size', rows, cols]))
  return true
}

function sendCommand(command) {
  const lines = command.split('\n')
  lines.forEach((line, index) => {
    if (line.trim()) {
      const data = index < lines.length - 1 || command.endsWith('\n') ? line + '\n' : line
      sendStdin(data)
    }
  })
  return true
}
</script>

<template>
  <div class="terminal">
    <div v-if="!isConnected" class="reconnect-overlay" @click="connectWebSocket">
      <div class="reconnect-content">
        <span class="reconnect-icon">↻</span>
        <span class="reconnect-text">Reconnect</span>
      </div>
    </div>
    <div ref="terminalContainer" class="terminal-container"></div>
  </div>
</template>

<style scoped>
.terminal {
  width: 100%;
  height: 100%;
  position: relative;
}

.terminal-container {
  width: 100%;
  height: 100%;
  text-align: left;
}

/* Reset xterm.js default padding to match container width */
.terminal-container :deep(.xterm-screen) {
  padding: 0;
}

.terminal-container :deep(.xterm-rows) {
  padding: 0;
}

.reconnect-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(30, 30, 30, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
}

.reconnect-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #f0f0f0;
}

.reconnect-icon {
  font-size: 48px;
  line-height: 1;
}

.reconnect-text {
  font-size: 16px;
}
</style>
