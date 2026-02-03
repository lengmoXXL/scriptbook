<script setup>
import { ref, computed, onMounted } from 'vue'
import MarkdownViewer from './MarkdownViewer.vue'

const props = defineProps({
    storageKey: {
        type: String,
        required: true
    }
})

// ============================================================================
// State
// ============================================================================

const messages = ref([])
const expandedStates = ref({})

// ============================================================================
// Public API
// ============================================================================

function addMessage(msg) {
    const messageWithMeta = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        ...msg
    }
    messages.value.push(messageWithMeta)
    saveMessages()
}

function clearMessages() {
    messages.value = []
    localStorage.removeItem(props.storageKey)
}

defineExpose({
    addMessage,
    clearMessages
})

// ============================================================================
// Message Grouping
// ============================================================================

const conversationGroups = computed(() => {
    const groups = []
    let currentGroup = null

    for (const msg of messages.value) {
        if (msg.type === 'user') {
            if (currentGroup) {
                groups.push(currentGroup)
            }
            currentGroup = {
                userMessage: msg,
                progressMessages: [],
                resultMessage: null,
                errorMessage: null
            }
        } else if (currentGroup) {
            if (msg.type === 'ResultMessage') {
                currentGroup.resultMessage = msg
            } else if (msg.type === 'Error') {
                currentGroup.errorMessage = msg
            } else if (msg.type !== 'SystemMessage') {
                currentGroup.progressMessages.push(msg)
            }
        }
    }

    if (currentGroup) {
        groups.push(currentGroup)
    }

    return groups
})

// ============================================================================
// Storage Operations
// ============================================================================

function saveMessages() {
    localStorage.setItem(props.storageKey, JSON.stringify(messages.value))
}

function loadMessages() {
    const saved = localStorage.getItem(props.storageKey)
    if (saved) {
        try {
            messages.value = JSON.parse(saved)
        } catch {
            messages.value = []
        }
    }
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
    loadMessages()
})

// ============================================================================
// Group Helpers
// ============================================================================

function getGroupId(userMessage) {
    return userMessage.id
}

function isExpanded(group) {
    return expandedStates.value[getGroupId(group.userMessage)] ?? false
}

function toggleExpanded(group) {
    const id = getGroupId(group.userMessage)
    expandedStates.value[id] = !expandedStates.value[id]
}

// ============================================================================
// Message Rendering
// ============================================================================

function messageSummary(msg) {
    switch (msg.type) {
    case 'AssistantMessage':
        return `Assistant (${msg.model})`
    case 'UserMessage':
        return 'User (Tool Result)'
    default:
        return msg.type
    }
}

function renderMessageBlock(block) {
    switch (block.type) {
    case 'text':
        return block.text
    case 'thinking':
        return `Thinking: ${block.thinking}`
    case 'tool_use':
        return `Running: ${block.name}\n\`\`\`\n${JSON.stringify(block.input, null, 2)}\n\`\`\``
    case 'tool_result':
        const content = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content, null, 2)
        return block.is_error
            ? `Error: ${content}`
            : `Result: ${content}`
    default:
        return JSON.stringify(block)
    }
}

function getLatestProgress(progressMessages) {
    if (progressMessages.length === 0) return null
    const latest = progressMessages[progressMessages.length - 1]

    switch (latest.type) {
    case 'AssistantMessage': {
        const toolUse = latest.content?.find(b => b.type === 'tool_use')
        if (toolUse) {
            return `Running: ${toolUse.name}`
        }
        const thinking = latest.content?.find(b => b.type === 'thinking')
        if (thinking) {
            return `Thinking...`
        }
        const text = latest.content?.find(b => b.type === 'text')
        if (text) {
            return text.text.slice(0, 100) + (text.text.length > 100 ? '...' : '')
        }
        return 'Processing...'
    }
    case 'UserMessage': {
        const toolResult = latest.content?.find(b => b.type === 'tool_result')
        if (toolResult) {
            const content = typeof toolResult.content === 'string'
                ? toolResult.content
                : JSON.stringify(toolResult.content)
            return `Output: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`
        }
        return 'Tool result received'
    }
    default:
        return 'Processing...'
    }
}
</script>

<template>
    <div class="message-group">
        <div v-for="group in conversationGroups" :key="getGroupId(group.userMessage)" class="conversation-group">
            <!-- 用户消息 -->
            <div class="user-message">
                <div class="user-message-content">{{ group.userMessage.content }}</div>
            </div>

            <!-- 进度消息 -->
            <div v-if="group.progressMessages.length > 0" class="progress-section">
                <div class="progress-header" @click="toggleExpanded(group)">
                    <span class="progress-label">
                        Progress ({{ group.progressMessages.length }} steps)
                    </span>
                    <span class="progress-toggle">{{ isExpanded(group) ? '▼' : '▶' }}</span>
                </div>

                <div v-if="isExpanded(group)" class="progress-details">
                    <div
                        v-for="(msg, idx) in group.progressMessages"
                        :key="idx"
                        class="progress-item"
                    >
                        <div class="progress-item-header">{{ messageSummary(msg) }}</div>
                        <div class="progress-item-content">
                            <template v-for="(block, bIdx) in msg.content" :key="bIdx">
                                <MarkdownViewer :content="renderMessageBlock(block)" />
                            </template>
                        </div>
                    </div>
                </div>

                <div v-else class="progress-summary">
                    <div class="latest-progress">{{ getLatestProgress(group.progressMessages) }}</div>
                </div>
            </div>

            <!-- 错误消息 -->
            <div v-if="group.errorMessage" class="error-section">
                <div class="error-label">Error</div>
                <div class="error-content">{{ group.errorMessage.error }}</div>
                <div v-if="group.errorMessage.traceback" class="error-traceback">
                    <pre>{{ group.errorMessage.traceback }}</pre>
                </div>
            </div>

            <!-- 结果消息 -->
            <div v-if="group.resultMessage" class="result-section">
                <div class="result-label">Result</div>
                <MarkdownViewer :content="group.resultMessage.result" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.message-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.conversation-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.user-message {
    align-self: flex-end;
    margin-left: auto;
    background-color: #2c5282;
    border: 1px solid #2c5282;
    border-radius: 8px;
    padding: 10px 14px;
    max-width: 80%;
}

.user-message-content {
    color: #f0f0f0;
    white-space: pre-wrap;
    word-break: break-word;
}

.progress-section {
    background-color: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    overflow: hidden;
}

.progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background-color: #333;
    cursor: pointer;
    user-select: none;
}

.progress-label {
    font-size: 0.85em;
    color: #aaa;
}

.progress-toggle {
    font-size: 0.75em;
    color: #888;
}

.progress-summary {
    padding: 12px 14px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    color: #bbb;
}

.progress-details {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 300px;
    overflow-y: auto;
}

.progress-item {
    background-color: #222;
    border-radius: 6px;
    padding: 10px;
}

.progress-item-header {
    font-size: 0.8em;
    color: #666;
    margin-bottom: 6px;
}

.progress-item-content {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.85em;
    color: #bbb;
    word-break: break-word;
}

.result-section {
    background-color: #1a3a2a;
    border: 1px solid #2a5a4a;
    border-radius: 8px;
    padding: 14px 16px;
}

.result-label {
    font-size: 0.8em;
    color: #4a9a8a;
    font-weight: 600;
    margin-bottom: 8px;
    text-transform: uppercase;
}

.error-section {
    background-color: #3a1a1a;
    border: 1px solid #5a2a2a;
    border-radius: 8px;
    padding: 14px 16px;
}

.error-label {
    font-size: 0.8em;
    color: #9a4a4a;
    font-weight: 600;
    margin-bottom: 8px;
    text-transform: uppercase;
}

.error-content {
    color: #ffb4b4;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    margin-bottom: 8px;
}

.error-traceback {
    background-color: #2a1010;
    border-radius: 4px;
    padding: 10px;
    overflow-x: auto;
}

.error-traceback pre {
    margin: 0;
    font-size: 0.8em;
    color: #a88;
}
</style>
