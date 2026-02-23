import { ref, onMounted, onUnmounted } from 'vue'
import { getConnectionId } from './connectionId'
import { CONFIG } from '../config'

export function useControlSocket(onCommand) {
    const socket = ref(null)
    const connected = ref(false)
    const connectionId = getConnectionId()

    function connect() {
        const host = import.meta.env.DEV
            ? CONFIG.api.devBase.replace('http://', '').replace('/api', '')
            : location.host
        const wsUrl = `ws://${host}/ws/control?id=${connectionId}`
        socket.value = new WebSocket(wsUrl)

        socket.value.onopen = () => {
            connected.value = true
            console.log('Control WebSocket connected:', connectionId)
        }

        socket.value.onclose = () => {
            connected.value = false
        }

        socket.value.onmessage = (event) => {
            try {
                const [action, payload] = JSON.parse(event.data)
                onCommand(action, payload)
            } catch (e) {
                console.error('Failed to parse control message:', e)
            }
        }
    }

    onMounted(connect)
    onUnmounted(() => socket.value?.close())

    return { connected, connectionId }
}
