<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { createSandbox, executeCommand, getSandboxInfo } from '../api/sandbox.js'

const STORAGE_KEY = 'scriptbook-sandbox-id'

// State
const messages = ref([])
const inputCommand = ref('')
const loading = ref(false)
const sandboxId = ref(null)
const error = ref('')

// Refs
const messagesContainerRef = ref(null)
const inputRef = ref(null)

// Try to connect to an existing sandbox
async function tryConnectStoredSandbox() {
    const storedId = localStorage.getItem(STORAGE_KEY)
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

// Refresh or initialize sandbox
async function refreshSandbox() {
    loading.value = true
    error.value = ''

    try {
        // Try to use stored ID first
        const storedId = await tryConnectStoredSandbox()
        if (storedId) {
            sandboxId.value = storedId
            addMessage('system', `Reconnected to sandbox: ${storedId}`)
            return true
        }

        // Create new sandbox if stored ID is invalid or doesn't exist
        const response = await createSandbox()
        sandboxId.value = response.id
        localStorage.setItem(STORAGE_KEY, response.id)
        addMessage('system', `Connected to sandbox: ${response.id}`)
        return true
    } catch (err) {
        error.value = err.message || 'Failed to initialize sandbox'
        console.error('Error initializing sandbox:', err)
        addMessage('error', error.value)
        return false
    } finally {
        loading.value = false
        // Scroll to bottom and focus input after refresh
        nextTick(() => {
            if (messagesContainerRef.value) {
                messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
            }
            if (inputRef.value) {
                inputRef.value.focus()
            }
        })
    }
}

// Send command to sandbox
async function sendCommand(command = null) {
    const cmd = command || inputCommand.value.trim()
    if (!cmd || loading.value) return

    // Add user message
    addMessage('user', cmd)
    inputCommand.value = ''

    // Send to sandbox
    loading.value = true
    try {
        const result = await executeCommand(sandboxId.value, cmd)
        addMessage('sandbox', result.output || result.error || 'Command executed')
    } catch (err) {
        // If command fails, refresh sandbox instead of retrying command
        sandboxId.value = null
        localStorage.removeItem(STORAGE_KEY)
        addMessage('system', 'Sandbox expired, refreshing...')
        await refreshSandbox()
        return
    } finally {
        loading.value = false
        // Scroll to bottom and focus input after command execution
        nextTick(() => {
            if (messagesContainerRef.value) {
                messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
            }
            if (inputRef.value) {
                inputRef.value.focus()
            }
        })
    }
}

// Add message to chat
function addMessage(type, content) {
    const timestamp = new Date().toLocaleTimeString()
    messages.value.push({
        id: Date.now() + Math.random(),
        type,
        content,
        timestamp
    })
}

// Handle Enter key
function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendCommand()
    }
}

// Initialize on mount
onMounted(() => {
    refreshSandbox()
})
</script>

<template>
    <div class="sandbox-chat">
        <div class="chat-header">
            <h3>Sandbox Chat</h3>
            <div v-if="sandboxId" class="sandbox-info">
                <span class="sandbox-id">ID: {{ sandboxId }}</span>
            </div>
            <div v-if="loading" class="loading-indicator">Processing...</div>
            <div v-if="error" class="error-message">
            {{ error }}
            <button @click="initSandbox" class="retry-button">Retry</button>
        </div>
        </div>

        <div ref="messagesContainerRef" class="messages-container">
            <div v-for="message in messages" :key="message.id" :class="`message message-${message.type}`">
                <div class="message-header">
                    <span class="message-type">{{ message.type }}</span>
                    <span class="message-timestamp">{{ message.timestamp }}</span>
                </div>
                <div class="message-content">
                    <pre v-if="message.type === 'user' || message.type === 'sandbox'">{{ message.content }}</pre>
                    <div v-else class="error-content">{{ message.content }}</div>
                </div>
            </div>
        </div>

        <div class="input-container">
            <textarea
                ref="inputRef"
                v-model="inputCommand"
                placeholder="Enter command (e.g., ls, pwd, echo 'hello')..."
                @keydown="handleKeydown"
                :disabled="loading || !sandboxId"
                rows="3"
            ></textarea>
            <button
                @click="sendCommand"
                :disabled="!inputCommand.trim() || loading || !sandboxId"
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

.chat-header {
    padding: 12px 20px;
    border-bottom: 1px solid #444;
    background-color: #252525;
}

.chat-header h3 {
    margin: 0 0 8px 0;
    font-size: 1.2em;
    color: #ffffff;
}

.sandbox-info {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9em;
    color: #aaa;
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
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.message {
    border-radius: 8px;
    padding: 12px 16px;
    max-width: 80%;
}

.message-user {
    align-self: flex-end;
    background-color: #2c5282;
    border: 1px solid #2c5282;
}

.message-sandbox {
    align-self: flex-start;
    background-color: #2a2a2a;
    border: 1px solid #444;
}

.message-error {
    align-self: center;
    background-color: #742a2a;
    border: 1px solid #742a2a;
}

.message-system {
    align-self: center;
    background-color: #2a554a;
    border: 1px solid #2a554a;
    font-size: 0.9em;
}

.message-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 0.8em;
    opacity: 0.8;
}

.message-type {
    text-transform: uppercase;
    font-weight: bold;
}

.message-timestamp {
    font-style: italic;
}

.message-content {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
}

.message-content pre {
    margin: 0;
    white-space: pre-wrap;
}

.error-content {
    color: #ffb4b4;
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

.retry-button {
    margin-left: 12px;
    background-color: #2c5282;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 0.9em;
    cursor: pointer;
}

.retry-button:hover {
    background-color: #2a4365;
}
</style>