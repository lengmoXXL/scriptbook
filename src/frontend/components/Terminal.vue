<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

// Backend WebSocket endpoint for terminal connections
const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:8080/ws/tty'
  : `ws://${window.location.host}/ws/tty`

const terminalContainer = ref(null)
const term = ref(null)
const fitAddon = ref(null)
const socket = ref(null)
const sessionId = ref(localStorage.getItem('terminal_term_name') || '')
const reconnectAttempts = ref(0)
const resizeObserver = ref(null)

const isConnected = ref(false)

function initTerminal() {
  term.value = new Terminal({
    cursorBlink: true,
    theme: {
      background: '#1e1e1e',
      foreground: '#f0f0f0',
      cursor: '#00ff00'
    },
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace'
  })

  fitAddon.value = new FitAddon()
  term.value.loadAddon(fitAddon.value)

  if (!terminalContainer.value) {
    console.error('Terminal container not found, component may not be mounted correctly')
    throw new Error('Terminal container missing: terminalContainer ref is null')
  }

  term.value.open(terminalContainer.value)
  fitAddon.value.fit()
  window.terminalInstance = term.value

  terminalContainer.value.addEventListener('click', () => {
    if (!term.value) return
    term.value.focus()
  })

  // TermSocket protocol requires ['stdin', data] format for server-side input processing
  term.value.onData((data) => {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return
    socket.value.send(JSON.stringify(['stdin', data]))
  })

  // Server needs terminal dimensions for proper PTY allocation and line wrapping
  term.value.onResize((size) => {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return
    socket.value.send(JSON.stringify(['set_size', size.rows, size.cols]))
  })
}

function connectWebSocket() {
  // Include session ID in URL for terminal persistence across page reloads
  let url = WS_URL
  if (sessionId.value) {
    url += `/${sessionId.value}`
  }

  const newSocket = new WebSocket(url)

  newSocket.onopen = () => {
    console.log('WebSocket connected')
    isConnected.value = true
    reconnectAttempts.value = 0

    // Initialize server-side PTY with current terminal dimensions for proper display
    if (!term.value) return
    const dimensions = term.value.dimensions
    if (!dimensions) return
    newSocket.send(JSON.stringify(['set_size', dimensions.rows, dimensions.cols]))
  }

  newSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      // TermSocket protocol expects JSON arrays with at least one element
      if (!Array.isArray(data) || data.length === 0) {
        console.error('Unexpected message format, expected non-empty array:', data)
        return
      }

      const messageType = data[0]

      if (messageType === 'setup') {
        // Server confirms terminal is ready for input after PTY initialization
        console.log('Terminal ready')
        return
      }

      if (!term.value) {
        console.warn('Terminal not ready, dropping message:', data)
        return
      }

      if (messageType === 'stdout' || messageType === 'stderr') {
        term.value.write(data[1])
      } else {
        console.warn('Unknown message type:', messageType, data)
      }
    } catch (error) {
      console.warn('Invalid raw data:', event.data.slice(0, 100))
    }
  }

  newSocket.onerror = (error) => {
    console.error('WebSocket error:', error)
  }

  newSocket.onclose = (event) => {
    console.log('WebSocket closed:', event.code, event.reason)
    isConnected.value = false
  }

  socket.value = newSocket
}

function handleResize() {
  if (!fitAddon.value) return
  fitAddon.value.fit()

  // Keep server-side PTY dimensions synchronized with visual terminal size
  if (!term.value || !socket.value || socket.value.readyState !== WebSocket.OPEN) return

  const dimensions = term.value.dimensions
  if (!dimensions) return
  socket.value.send(JSON.stringify(['set_size', dimensions.rows, dimensions.cols]))
}

function sendCommand(command) {
  // Send command to terminal via WebSocket
  if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
    console.warn('Cannot send command: WebSocket not connected')
    return false
  }

  // Send each line separately with a small delay to simulate typing
  const lines = command.split('\n')
  lines.forEach((line, index) => {
    if (line.trim()) {
      // Add newline except for the last line if it's empty
      const data = index < lines.length - 1 || command.endsWith('\n') ? line + '\n' : line
      socket.value.send(JSON.stringify(['stdin', data]))
    }
  })

  return true
}

// Expose sendCommand method to parent components
defineExpose({
  sendCommand
})

onMounted(() => {
  initTerminal()
  connectWebSocket()

  // Ensure terminal adapts to browser window size changes
  window.addEventListener('resize', handleResize)

  // Monitor container size changes for split layout resizing
  resizeObserver.value = new ResizeObserver(() => {
    if (fitAddon.value) {
      fitAddon.value.fit()
    }
  })
  resizeObserver.value.observe(terminalContainer.value)

  // Wait for DOM layout to stabilize before fitting terminal to container
  nextTick(() => {
    if (!fitAddon.value) return
    fitAddon.value.fit()
  })
})

onUnmounted(() => {
  // Prevent memory leaks by closing connections and disposing resources
  if (socket.value) {
    socket.value.close(1000, 'Component unmounted')
  }

  if (term.value) {
    term.value.dispose()
  }

  // Clean up ResizeObserver
  if (resizeObserver.value && terminalContainer.value) {
    resizeObserver.value.unobserve(terminalContainer.value)
  }

  window.removeEventListener('resize', handleResize)
})
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

