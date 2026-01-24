<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

// Backend WebSocket endpoint for terminal connections
const WS_URL = 'ws://localhost:8080/ws/tty'

const terminalContainer = ref(null)
const term = ref(null)
const fitAddon = ref(null)
const socket = ref(null)
const sessionId = ref(localStorage.getItem('terminal_term_name') || '')
const isConnected = ref(false)
const reconnectAttempts = ref(0)
const MAX_RECONNECT_ATTEMPTS = 5

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

  // Critical dependency check: terminal requires a DOM container to render
  if (!terminalContainer.value) {
    console.error('Terminal container not found, component may not be mounted correctly')
    throw new Error('Terminal container missing: terminalContainer ref is null')
  }

  term.value.open(terminalContainer.value)
  fitAddon.value.fit()
  // Allow Playwright tests to access terminal instance for assertions
  window.terminalInstance = term.value

  // User experience: clicking anywhere in terminal area should focus the cursor
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
  if (socket.value && socket.value.readyState === WebSocket.OPEN) return

  // Include session ID in URL for terminal persistence across page reloads
  let url = WS_URL
  if (sessionId.value) {
    url += `/${sessionId.value}`
  }

  socket.value = new WebSocket(url)

  socket.value.onopen = () => {
    console.log('WebSocket connected')
    isConnected.value = true
    reconnectAttempts.value = 0

    // Initialize server-side PTY with current terminal dimensions for proper display
    if (!term.value) return
    const dimensions = term.value.dimensions
    if (!dimensions) return
    socket.value.send(JSON.stringify(['set_size', dimensions.rows, dimensions.cols]))
  }

  socket.value.onmessage = (event) => {
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

  socket.value.onerror = (error) => {
    console.error('WebSocket error:', error)
    isConnected.value = false
  }

  socket.value.onclose = (event) => {
    console.log('WebSocket closed:', event.code, event.reason)
    isConnected.value = false

    // Maintain user experience by automatically recovering from transient network failures
    // 1000 = Normal Closure (正常关闭), 非正常关闭才需要重连
    if (event.code !== 1000 && reconnectAttempts.value < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts.value++
      console.log(`Reconnecting... attempt ${reconnectAttempts.value}`)
      setTimeout(connectWebSocket, 2000 * reconnectAttempts.value)
    }
  }
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

onMounted(() => {
  initTerminal()
  connectWebSocket()

  // Ensure terminal adapts to browser window size changes
  window.addEventListener('resize', handleResize)

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

  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="terminal">
    <div class="terminal-header" v-if="isConnected">
      <span class="status connected">● Connected</span>
      <span class="session-id" v-if="sessionId">Session: {{ sessionId.slice(0, 8) }}...</span>
      <button class="reconnect-btn" @click="connectWebSocket" :disabled="isConnected">
        {{ isConnected ? 'Connected' : 'Reconnect' }}
      </button>
    </div>
    <div class="terminal-header" v-else>
      <span class="status disconnected">● Disconnected</span>
      <span class="reconnect-info" v-if="reconnectAttempts > 0">
        Reconnecting... ({{ reconnectAttempts }}/{{ MAX_RECONNECT_ATTEMPTS }})
      </span>
      <button class="reconnect-btn" @click="connectWebSocket">
        Reconnect
      </button>
    </div>
    <div ref="terminalContainer" class="terminal-container"></div>
  </div>
</template>

<style scoped>
.terminal {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.terminal-header {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.terminal-container {
  flex: 1;
  text-align: left;
}
</style>

