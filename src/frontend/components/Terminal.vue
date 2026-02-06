<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useTerminal } from '../composables/useTerminal.js'
import { useTerminalWebSocket } from '../composables/useTerminalWebSocket.js'

const props = defineProps({
  wsUrl: {
    type: String,
    required: true
  }
})

const terminalContainer = ref(null)

const { isConnected, connect: connectWs, send: sendStdin, setSize: setTerminalSize } = useTerminalWebSocket({
  wsUrl: props.wsUrl,
  sessionId: '',
  onData: (content) => terminal.write(content),
  onSetup: () => console.log('Terminal ready'),
  onConnected: () => {
    if (terminal.isReady && terminal.dimensions) {
      setTerminalSize(terminal.dimensions.rows, terminal.dimensions.cols)
    }
  },
  onDisconnected: () => console.log('WebSocket disconnected'),
  onError: (error) => console.error('WebSocket error:', error)
})

const terminal = useTerminal({
  containerRef: terminalContainer,
  onInput: (data) => sendStdin(data),
  onResize: (rows, cols) => setTerminalSize(rows, cols)
})

function sendCommand(command) {
  if (!sendStdin) {
    console.warn('Cannot send command: WebSocket not ready')
    return false
  }

  const lines = command.split('\n')
  lines.forEach((line, index) => {
    if (line.trim()) {
      const data = index < lines.length - 1 || command.endsWith('\n') ? line + '\n' : line
      sendStdin(data)
    }
  })

  return true
}

defineExpose({ sendCommand })

onMounted(() => {
  connectWs()
})

onBeforeUnmount(() => {
  terminal.dispose()
})
</script>

<template>
  <div class="terminal">
    <div v-if="!isConnected" class="reconnect-overlay" @click="connectWs">
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

