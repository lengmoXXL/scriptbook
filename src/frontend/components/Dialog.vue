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

defineExpose({
    addMessage,
    clearMessages,
    loadMessages
})

// ============================================================================
// Message Grouping
// ============================================================================

// Check if messages use simplified format (no requestId)
const isSimplifiedFormat = computed(() => {
    return messages.value.length > 0 && !messages.value[0].requestId
})

const conversationGroups = computed(() => {
    const groups = []
    const groupMap = new Map()

    for (const msg of messages.value) {
        // For simplified format (no requestId), create a synthetic group
        if (!msg.requestId) {
            if (msg.type === 'progress') {
                groups.push({
                    requestId: `msg-${Date.now()}-${Math.random()}`,
                    userMessage: null,
                    progressMessages: [msg],
                    finishMessage: null
                })
            } else if (msg.type === 'finish') {
                groups.push({
                    requestId: `msg-${Date.now()}-${Math.random()}`,
                    userMessage: null,
                    progressMessages: [],
                    finishMessage: msg
                })
            }
            continue
        }

        // Standard format with requestId
        if (!groupMap.has(msg.requestId)) {
            const group = {
                requestId: msg.requestId,
                userMessage: null,
                progressMessages: [],
                finishMessage: null
            }
            groupMap.set(msg.requestId, group)
            groups.push(group)
        }

        const group = groupMap.get(msg.requestId)

        if (msg.type === 'user') {
            group.userMessage = msg
        } else if (msg.type === 'progress') {
            group.progressMessages.push(msg)
        } else if (msg.type === 'finish') {
            group.finishMessage = msg
        }
    }

    return groups
})

// ============================================================================
// Storage Operations
// ============================================================================

function saveMessages() {
    localStorage.setItem(props.storageKey, JSON.stringify(messages.value))
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

function getGroupId(group) {
    if (!group) return undefined
    return group.requestId
}

function isExpanded(group) {
    if (!group) return false
    const userMessage = group.userMessage
    if (!userMessage) return false
    const id = getGroupId(group)
    return expandedStates.value[id] ?? false
}

function toggleExpanded(group) {
    if (!group) return
    const userMessage = group.userMessage
    if (!userMessage) return
    const id = getGroupId(group)
    expandedStates.value[id] = !expandedStates.value[id]
}

// ============================================================================
// Message Rendering
// ============================================================================

function messageSummary(msg) {
    if (msg.type === 'progress') {
        return 'Progress'
    }
    return msg.type || 'Message'
}

function renderMessageContent(msg) {
    return msg.content || ''
}

function getLatestProgress(progressMessages) {
    if (progressMessages.length === 0) return null
    const latest = progressMessages[progressMessages.length - 1]
    const content = latest.content || ''

    // Extract summary from markdown
    const toolMatch = content.match(/### (\w+)/)
    if (toolMatch) {
        return `Running: ${toolMatch[1]}`
    }

    // Get first line or first 100 chars
    const firstLine = content.split('\n')[0].trim()
    if (firstLine) {
        return firstLine.slice(0, 100) + (firstLine.length > 100 ? '...' : '')
    }

    return 'Processing...'
}
</script>

<template>
    <div class="message-group">
        <div v-for="group in conversationGroups" :key="getGroupId(group)" class="conversation-group">
            <!-- 用户消息 -->
            <div v-if="group.userMessage" class="user-message">
                <div class="user-message-content">{{ group.userMessage.content }}</div>
            </div>

            <!-- 进度消息 -->
            <div v-if="group.progressMessages.length > 0" class="progress-section">
                <!-- 之前的进度消息 (缩略图) -->
                <template v-if="group.progressMessages.length > 1">
                    <div class="progress-header" @click="toggleExpanded(group)">
                        <span class="progress-label">
                            Previous Steps ({{ group.progressMessages.length - 1 }})
                        </span>
                        <span class="progress-toggle">{{ isExpanded(group) ? '▼' : '▶' }}</span>
                    </div>

                    <div v-if="isExpanded(group)" class="progress-details">
                        <div
                            v-for="(msg, idx) in group.progressMessages.slice(0, -1)"
                            :key="idx"
                            class="progress-item"
                        >
                            <div class="progress-item-header">{{ messageSummary(msg) }}</div>
                            <div class="progress-item-content">
                                <MarkdownViewer :content="renderMessageContent(msg)" />
                            </div>
                        </div>
                    </div>

                    <div v-else class="progress-summary">
                        <div class="latest-progress">{{ getLatestProgress(group.progressMessages.slice(0, -1)) }}</div>
                    </div>
                </template>

                <!-- 最后的进度消息 (直接显示，无容器包裹) -->
                <div class="progress-item latest-item">
                    <div class="progress-item-content">
                        <MarkdownViewer :content="renderMessageContent(group.progressMessages[group.progressMessages.length - 1])" />
                    </div>
                </div>
            </div>

            <!-- 结束消息 -->
            <div v-if="group.finishMessage" class="finish-section" :class="{ 'finish-error': group.finishMessage.success === false }">
                <div v-if="group.finishMessage.content" class="finish-content">
                    <MarkdownViewer :content="group.finishMessage.content" />
                </div>
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

.latest-item {
    background-color: transparent;
    padding: 12px 14px;
}

.latest-item .progress-item-content {
    padding: 0;
}

.finish-section {
    border-radius: 8px;
    padding: 14px 16px;
}

.finish-section.finish-error {
    background-color: #3a1a1a;
    border: 1px solid #5a2a2a;
}

.finish-content {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.85em;
    color: #bbb;
    word-break: break-word;
}

.finish-section.finish-error .finish-content {
    color: #ffb4b4;
}
</style>
