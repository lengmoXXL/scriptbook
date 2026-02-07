<script setup>
import { ref, onMounted, nextTick, onUnmounted, watch, computed } from 'vue'
import { createSandbox, getSandboxInfo } from '../api/sandbox.js'
import { getFileContent } from '../api/files.js'
import { parse } from 'smol-toml'
import Dialog from './Dialog.vue'
import Terminal from './Terminal.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import { useSandboxHandler } from '../composables/useSandboxChatHandlers.js'

const WS_BASE = import.meta.env.DEV
  ? 'ws://localhost:8080/ws'
  : `ws://${window.location.host}/ws`

const props = defineProps({
    config: {
        type: String,
        required: true
    },
    markdownContent: {
        type: String,
        default: ''
    },
    markdownLoading: {
        type: Boolean,
        default: false
    },
    markdownError: {
        type: String,
        default: ''
    }
})

const getStorageKey = (suffix) => {
    return `scriptbook-sandbox-${props.config.replace(/[^\w]/g, '-')}-${suffix}`
}

const inputCommand = ref('')
const loading = ref(false)
const sandboxId = ref(null)
const containerId = ref(null)
const error = ref('')
const configData = ref(null)
const wsConnected = ref(false)
const terminalVisible = ref(false)

// Terminal resize state
const terminalHeight = ref(200) // pixels

const messagesContainerRef = ref(null)
const dialogRef = ref(null)
const inputRef = ref(null)
const terminalRef = ref(null)
let ws = null
let handler = null
let currentRequestId = null

async function loadConfig() {
    if (!props.config) {
        throw new Error('Config file path is required')
    }

    const content = await getFileContent(props.config)
    const parsed = parse(content)
    const sandboxConfig = parsed.sandbox || {}

    configData.value = {
        provider: sandboxConfig.provider || null,
        sandbox_id: sandboxConfig.sandbox_id || 'auto',
        image: sandboxConfig.image,
        init_commands: sandboxConfig.init_commands,
        env: parsed.env || {},
        expire_time: sandboxConfig.expire_time || null,
        type: sandboxConfig.type || null
    }

    handler = useSandboxHandler(configData)
}

async function tryConnectStoredSandbox() {
    const storedId = localStorage.getItem(getStorageKey('id'))
    if (!storedId) {
        return null
    }

    try {
        await getSandboxInfo(storedId)
        return storedId
    } catch {
        return null
    }
}

function connectWebSocket() {
    if (ws) {
        ws.close()
    }
    wsConnected.value = false

    ws = new WebSocket(`${WS_BASE}/sandbox/${sandboxId.value}`)

    ws.onopen = () => {
        wsConnected.value = true
        loading.value = false
        console.log('WebSocket connected')
    }

    ws.onclose = () => {
        wsConnected.value = false
        loading.value = false
        if (sandboxId.value) {
            error.value = 'Connection closed. The sandbox may have been recycled or terminated.'
        }
    }

    ws.onerror = (err) => {
        error.value = `WebSocket connection failed: ${err.message || 'Connection error'}`
        loading.value = false
    }

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('[SandboxChat] Received message:', data.type, data)

        switch (data.type) {
        case 'connected':
            wsConnected.value = true
            loading.value = false
            break
        case 'stdout':
        case 'stderr':
        case 'result':
        case 'error':
        case 'done': {
            const msg = handler.handleMessage(data)
            console.log('[SandboxChat] Processed message:', msg)
            if (msg) {
                if (dialogRef.value) {
                    dialogRef.value.addMessage({ ...msg, requestId: currentRequestId })
                } else {
                    // Dialog not ready yet, wait for next tick
                    nextTick(() => {
                        if (dialogRef.value) {
                            dialogRef.value.addMessage({ ...msg, requestId: currentRequestId })
                        }
                    })
                }
            }
            if (handler.isDone(data)) {
                loading.value = false
                currentRequestId = null
                console.log('[SandboxChat] Done, loading = false')
            }
            nextTick(() => {
                scrollToBottom()
                if (inputRef.value && !loading.value) {
                    inputRef.value.focus()
                }
            })
            break
        }
        }
    }
}

async function recreateSandbox() {
    sandboxId.value = null
    containerId.value = null
    if (dialogRef.value) {
        dialogRef.value.clearMessages()
    }
    handler.reset()
    localStorage.removeItem(getStorageKey('id'))
    if (ws) {
        ws.close()
        ws = null
    }
    await refreshSandbox()
}

async function refreshSandbox() {
    loading.value = true
    error.value = ''
    containerId.value = null

    try {
        const storedId = await tryConnectStoredSandbox()
        if (storedId) {
            sandboxId.value = storedId
            const info = await getSandboxInfo(storedId)
            containerId.value = info.container_id
            connectWebSocket()
            return true
        }

        if (!configData.value) {
            throw new Error('Sandbox config not loaded')
        }

        const { provider, sandbox_id, image, init_commands, env, expire_time } = configData.value
        const response = await createSandbox({ provider, sandbox_id, image, init_commands, env, expire_time })
        sandboxId.value = response.id
        containerId.value = response.container_id
        localStorage.setItem(getStorageKey('id'), response.id)

        connectWebSocket()
        return true
    } catch (err) {
        error.value = err.message || 'Failed to initialize sandbox'
        console.error('Error initializing sandbox:', err)
        loading.value = false
        return false
    }
}

function sendMessageToDialog() {
    const cmd = inputCommand.value.trim()
    if (!cmd || loading.value || !sandboxId.value || !wsConnected.value) return

    loading.value = true
    currentRequestId = Date.now().toString()

    // Wrap command for Claude daemon if type is "claude"
    let commandToSend = cmd
    if (configData.value?.type === 'claude') {
        commandToSend = `echo '${cmd}' | nc -U /tmp/claude.sock`
    }

    // Add user message to dialog first
    if (dialogRef.value) {
        dialogRef.value.addMessage({
            type: 'user',
            content: cmd,
            requestId: currentRequestId
        })
    }

    // Then send command to sandbox
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'execute',
            requestId: currentRequestId,
            command: commandToSend
        }))
        inputCommand.value = ''
    }

    // Scroll to bottom after adding user message
    nextTick(() => {
        scrollToBottom()
    })
}

function executeCommandInTerminal(cmd) {
    if (!cmd) return

    // Show terminal if hidden
    if (!terminalVisible.value) {
        terminalVisible.value = true
    }

    // Send command to terminal
    nextTick(() => {
        if (terminalRef.value && terminalRef.value.sendCommand) {
            terminalRef.value.sendCommand(cmd)
        }
    })
}

function scrollToBottom() {
    if (messagesContainerRef.value) {
        messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
}

function handleSendClick() {
    sendMessageToDialog()
}

function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessageToDialog()
    }
}

// Computed properties for terminal support
const supportsTerminal = computed(() => {
    return configData.value?.provider === 'local_docker'
})

const terminalTermName = computed(() => {
    return containerId.value || ''
})

const configFileName = computed(() => {
    if (!props.config) return 'Sandbox'
    return props.config.split('/').pop()
})

function toggleTerminal() {
    terminalVisible.value = !terminalVisible.value
}

function startTerminalResize(event) {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = terminalHeight.value

    function onMouseMove(e) {
        const deltaY = e.clientY - startY
        let newHeight = startHeight - deltaY
        newHeight = Math.max(100, Math.min(600, newHeight))
        terminalHeight.value = newHeight
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
}

onMounted(async () => {
    try {
        await loadConfig()
    } catch (err) {
        error.value = 'Failed to load config file'
        return
    }

    refreshSandbox()
})

onUnmounted(() => {
    if (ws) {
        ws.close()
    }
})

// Reload dialog messages when switching between different sandbox files
watch(() => props.config, async () => {
    // Clear current sandbox state
    sandboxId.value = null
    if (ws) {
        ws.close()
        ws = null
    }
    wsConnected.value = false
    loading.value = false
    error.value = ''

    // Load new config and refresh sandbox
    try {
        await loadConfig()
        if (dialogRef.value) {
            dialogRef.value.loadMessages()
        }
        refreshSandbox()
    } catch (err) {
        error.value = 'Failed to load config file'
    }
})
</script>

<template>
    <div class="sandbox-chat" :class="{ 'with-terminal': terminalVisible }">
        <div class="chat-header">
            <div class="header-left">
                <h3>{{ configFileName }}</h3>
                <span v-if="sandboxId" class="sandbox-id">ID: {{ sandboxId }}</span>
            </div>
            <div class="header-right">
                <button v-if="supportsTerminal" @click="toggleTerminal" class="terminal-button">
                    {{ terminalVisible ? 'Hide Terminal' : 'Terminal' }}
                </button>
                <button @click="recreateSandbox" class="recreate-button">Recreate</button>
                <div v-if="loading" class="loading-indicator">Processing...</div>
                <div v-if="sandboxId && !wsConnected && !loading" class="loading-indicator">Connecting...</div>
                <div v-if="error" class="error-message">
                    {{ error }}
                    <button @click="refreshSandbox" class="retry-button">Retry</button>
                </div>
            </div>
        </div>

        <div class="content-wrapper">
            <div v-if="markdownContent" class="markdown-container">
                <MarkdownViewer
                    :content="markdownContent"
                    :loading="markdownLoading"
                    :error="markdownError"
                    :on-execute-command="executeCommandInTerminal"
                />
            </div>
            <div v-else ref="messagesContainerRef" class="messages-container">
                <Dialog ref="dialogRef" :storage-key="getStorageKey('messages')" />
            </div>

            <div v-if="terminalVisible && supportsTerminal && containerId" class="terminal-section">
                <div class="terminal-resize-handle" @mousedown="startTerminalResize">
                    <div class="resize-bar"></div>
                </div>
                <div class="terminal-panel" :style="{ height: terminalHeight + 'px' }">
                    <Terminal ref="terminalRef" :key="terminalTermName" :ws-url="`${WS_BASE}/${terminalTermName}`" />
                </div>
            </div>
        </div>

        <div v-if="!markdownContent" class="input-container">
            <textarea
                ref="inputRef"
                v-model="inputCommand"
                :placeholder="handler?.inputPlaceholder || 'Enter command...'"
                @keydown="handleKeydown"
                :disabled="loading || !wsConnected"
                rows="3"
            ></textarea>
            <button
                @click="handleSendClick"
                :disabled="!inputCommand.trim() || loading || !wsConnected"
                class="send-button"
            >
                Send
            </button>
        </div>
    </div>
</template>

<style scoped>
.sandbox-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #1e1e1e;
    color: #f0f0f0;
}

.content-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.markdown-container {
    flex: 1;
    overflow-y: auto;
}

.messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
}

.terminal-section {
    display: flex;
    flex-direction: column;
    border-top: 1px solid #444;
}

.terminal-resize-handle {
    height: 4px;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #252525;
}

.terminal-resize-handle:hover {
    background-color: #333;
}

.resize-bar {
    width: 100%;
    height: 2px;
    background-color: #444;
    border-radius: 1px;
}

.terminal-panel {
    background-color: #1a1a1a;
    overflow: hidden;
}

.chat-header {
    padding: 12px 20px;
    border-bottom: 1px solid #444;
    background-color: #252525;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

.chat-header h3 {
    margin: 0;
    font-size: 1.1em;
    color: #ffffff;
}

.sandbox-id {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    background-color: #333;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 0.85em;
}

.loading-indicator {
    color: #00ff00;
    font-style: italic;
    font-size: 0.9em;
    margin-top: 8px;
}

.error-message {
    color: #ff6b6b;
    font-size: 0.9em;
    margin-top: 8px;
}

.messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
}

.input-container {
    border-top: 1px solid #444;
    padding: 16px;
    background-color: #252525;
    display: flex;
    gap: 12px;
}

.input-container textarea {
    flex: 1;
    background-color: #2a2a2a;
    border: 1px solid #444;
    color: #f0f0f0;
    padding: 12px;
    border-radius: 6px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.95em;
    resize: vertical;
}

.input-container textarea:focus {
    outline: none;
    border-color: #00a67d;
}

.input-container textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.send-button {
    background-color: #00a67d;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 12px 24px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    align-self: flex-end;
}

.send-button:hover:not(:disabled) {
    background-color: #008f6b;
}

.send-button:active:not(:disabled) {
    background-color: #007a5a;
}

.send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.terminal-button {
    background-color: #2c5282;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 0.9em;
    cursor: pointer;
}

.terminal-button:hover {
    background-color: #2a4365;
}

.recreate-button {
    background-color: #5c3d00;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 0.9em;
    cursor: pointer;
}

.recreate-button:hover {
    background-color: #7a4f00;
}

.retry-button:hover {
    background-color: #2a4365;
}
</style>
