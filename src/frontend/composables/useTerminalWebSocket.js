import { ref, onUnmounted } from 'vue'

export function useTerminalWebSocket({
  wsUrl,
  sessionId,
  onData,
  onSetup,
  onConnected,
  onDisconnected,
  onError
}) {
  const socket = ref(null)
  const isConnected = ref(false)
  const reconnectAttempts = ref(0)

  function connect() {
    let url = wsUrl
    if (sessionId?.value) {
      url += `/${sessionId.value}`
    }

    const newSocket = new WebSocket(url)

    newSocket.onopen = () => {
      isConnected.value = true
      reconnectAttempts.value = 0
      onConnected?.()
    }

    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (!Array.isArray(data) || data.length === 0) {
          console.error('Unexpected message format, expected non-empty array:', data)
          return
        }

        const messageType = data[0]

        if (messageType === 'setup') {
          onSetup?.()
          return
        }

        if (messageType === 'stdout' || messageType === 'stderr') {
          onData?.(data[1])
        } else {
          console.warn('Unknown message type:', messageType, data)
        }
      } catch (error) {
        console.warn('Invalid raw data:', event.data.slice(0, 100))
      }
    }

    newSocket.onerror = (error) => {
      console.error('WebSocket error:', error)
      onError?.(error)
    }

    newSocket.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason)
      isConnected.value = false
      onDisconnected?.()
    }

    socket.value = newSocket
  }

  function disconnect() {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.close(1000, 'Disconnected')
    }
    socket.value = null
    isConnected.value = false
  }

  function send(data) {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send: WebSocket not connected')
      return false
    }
    socket.value.send(JSON.stringify(['stdin', data]))
    return true
  }

  function setSize(rows, cols) {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      return false
    }
    socket.value.send(JSON.stringify(['set_size', rows, cols]))
    return true
  }

  function getSocket() {
    return socket.value
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    isConnected,
    reconnectAttempts,
    connect,
    disconnect,
    send,
    setSize,
    getSocket
  }
}
