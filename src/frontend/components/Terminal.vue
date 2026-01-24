<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

// WebSocket URL
const WS_URL = 'ws://localhost:8080/ws/tty'

// Refs
const terminalContainer = ref(null)
const term = ref(null)
const fitAddon = ref(null)
const socket = ref(null)
const sessionId = ref(localStorage.getItem('terminal_term_name') || '')
const isConnected = ref(false)
const reconnectAttempts = ref(0)
const MAX_RECONNECT_ATTEMPTS = 5

// Initialize terminal
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

  // Attach terminal to container
  if (terminalContainer.value) {
    term.value.open(terminalContainer.value)
    fitAddon.value.fit()

    // Handle terminal input
    term.value.onData((data) => {
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        // Send as TermSocket format: ['stdin', data]
        socket.value.send(JSON.stringify(['stdin', data]))
      }
    })

    // Handle terminal resize
    term.value.onResize((size) => {
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        // Send as TermSocket format: ['set_size', rows, cols]
        socket.value.send(JSON.stringify(['set_size', size.rows, size.cols]))
      }
    })
  }
}

// Connect to WebSocket
function connectWebSocket() {
  if (socket.value && socket.value.readyState === WebSocket.OPEN) {
    return
  }

  // Build WebSocket URL with term_name in path if available
  let url = WS_URL
  if (sessionId.value) {
    url += `/${sessionId.value}`
  }

  socket.value = new WebSocket(url)

  socket.value.onopen = () => {
    console.log('WebSocket connected')
    isConnected.value = true
    reconnectAttempts.value = 0

    // Send initial resize with current terminal dimensions
    if (term.value) {
      const dimensions = term.value.dimensions
      if (dimensions) {
        socket.value.send(JSON.stringify(['set_size', dimensions.rows, dimensions.cols]))
      }
    }
  }

  socket.value.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === 'output' && term.value) {
        // Write output to terminal
        term.value.write(data.data)
      } else if (Array.isArray(data) && data[0] === 'setup') {
        // Setup message received, terminal ready
        console.log('Terminal ready')
      } else {
        // Assume raw terminal output
        if (term.value) {
          term.value.write(event.data)
        }
      }
    } catch (error) {
      // Not JSON, treat as raw terminal output
      if (term.value) {
        term.value.write(event.data)
      }
    }
  }

  socket.value.onerror = (error) => {
    console.error('WebSocket error:', error)
    isConnected.value = false
  }

  socket.value.onclose = (event) => {
    console.log('WebSocket closed:', event.code, event.reason)
    isConnected.value = false

    // Attempt reconnection if not closed normally
    if (event.code !== 1000 && reconnectAttempts.value < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts.value++
      console.log(`Reconnecting... attempt ${reconnectAttempts.value}`)
      setTimeout(connectWebSocket, 2000 * reconnectAttempts.value)
    }
  }
}

// Send command to execute a script
function sendScript(script) {
  if (socket.value && socket.value.readyState === WebSocket.OPEN) {
    // Add newline to execute the command
    const command = script.endsWith('\n') ? script : script + '\n'
    socket.value.send(JSON.stringify({
      type: 'input',
      data: command
    }))
  }
}

// Handle window resize
function handleResize() {
  if (fitAddon.value) {
    fitAddon.value.fit()

    // Send resize to server
    if (socket.value && socket.value.readyState === WebSocket.OPEN && term.value) {
      const dimensions = term.value.dimensions
      if (dimensions) {
        socket.value.send(JSON.stringify(['set_size', dimensions.rows, dimensions.cols]))
      }
    }
  }
}

// Lifecycle hooks
onMounted(() => {
  initTerminal()
  connectWebSocket()

  // Add resize listener
  window.addEventListener('resize', handleResize)

  // Fit terminal after a short delay
  nextTick(() => {
    if (fitAddon.value) {
      fitAddon.value.fit()
    }
  })
})

onUnmounted(() => {
  // Clean up
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
  background-color: #1e1e1e;
  border-radius: 4px;
  overflow: hidden;
}

.terminal-header {
  background-color: #252525;
  color: #f0f0f0;
  padding: 8px 16px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #333;
}

.status {
  font-weight: bold;
}

.status.connected {
  color: #4caf50;
}

.status.disconnected {
  color: #f44336;
}

.session-id {
  font-family: monospace;
  color: #888;
  margin-left: 16px;
}

.reconnect-info {
  color: #ff9800;
  margin-left: 16px;
}

.reconnect-btn {
  background-color: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 3px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.reconnect-btn:hover:not(:disabled) {
  background-color: #444;
}

.reconnect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.terminal-container {
  flex: 1;
  padding: 8px;
  overflow: hidden;
}

/* xterm.js overrides */
:deep(.xterm) {
  height: 100%;
  width: 100%;
}

:deep(.xterm-viewport) {
  overflow-y: auto;
}

:deep(.xterm-screen) {
  width: 100% !important;
}
</style>